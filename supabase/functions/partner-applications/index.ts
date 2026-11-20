// Supabase Edge Function: partner-applications
// Quản lý quy trình đăng ký đối tác (trường học / doanh nghiệp) cho SkillPass.
//
// Phân quyền 3 lớp & Ranh giới bảo mật:
//   * 'submit'   : Công khai, tạo Auth user với mật khẩu do đối tác chọn rồi khóa
//                  đăng nhập đến khi Admin duyệt. Không lưu mật khẩu trong hồ sơ.
//   * 'provision': Yêu cầu Bearer JWT của public.users có role = 'admin'.
//                  Claim nguyên tử qua partner_application_claim (chống race condition / cấp lặp),
//                  mở khóa Auth user đã tạo, tạo organizations (liên kết owner_user_id), và chốt qua
//                  partner_application_finalize. Ghi admin_audit_logs.
//   * 'reject'   : Yêu cầu admin JWT. Chốt từ chối qua partner_application_reject.
//                  Ghi admin_audit_logs.
//
// Gateway đặt verify_jwt = false vì client nặc danh gửi submit không có token;
// hàm tự kiểm tra token Bearer cho action admin.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createHash } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, x-client-info, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, error: string) {
  return json({ ok: false, code, error }, status);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const ORG_TYPES = new Set(["school", "company"]);

const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.com.vn", "hotmail.com",
  "outlook.com", "live.com", "icloud.com", "proton.me", "protonmail.com",
  "mail.com", "gmx.com", "zoho.com",
]);

type ServiceClient = ReturnType<typeof createClient>;

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || FREEMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function generatePassword(length = 20): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * Xác thực caller là admin thông qua access token.
 */
async function requireAdmin(
  req: Request,
  service: ServiceClient,
): Promise<{ userId: string } | Response> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return fail(401, "unauthorized", "Thiếu phiên đăng nhập admin.");
  }

  const { data: authData, error: authErr } = await service.auth.getUser(token);
  if (authErr || !authData?.user) {
    return fail(401, "unauthorized", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
  }

  const { data: profile, error: profileErr } = await service
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileErr) {
    return fail(500, "server_error", "Không kiểm tra được quyền admin.");
  }
  if (!profile || profile.role !== "admin") {
    return fail(403, "forbidden", "Chỉ admin mới được xử lý hồ sơ đối tác.");
  }

  return { userId: authData.user.id };
}

async function logAudit(
  service: ServiceClient,
  adminId: string,
  orgId: string | null,
  action: "provision_partner" | "reject_partner",
  title: string,
  body: string,
  tone: "ok" | "bad" | "info",
  icon: "ok" | "award" | "x" | "bell",
) {
  const { error } = await service.from("admin_audit_logs").insert({
    admin_id: adminId,
    org_id: orgId,
    action,
    tone,
    icon,
    title,
    body,
  });
  if (error) console.error("partner audit log failed:", error.message);
}

function isExistingUserError(message?: string): boolean {
  return /already|exist|registered/i.test(message ?? "");
}

// A rejected application may leave its locked Auth user behind if cleanup was
// interrupted. Only remove accounts that are still linked to a rejected
// application and do not own an organization.
async function removeRejectedAuthUserForRetry(
  service: ServiceClient,
  email: string,
): Promise<boolean> {
  const { data: profile, error: profileErr } = await service
    .from("users")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (profileErr || !profile || profile.role !== "business") return false;

  const [ownedOrg, openApplication, rejectedApplication] = await Promise.all([
    service.from("organizations").select("id").eq("owner_user_id", profile.id).limit(1),
    service.from("partner_applications").select("id").eq("user_id", profile.id)
      .in("status", ["pending", "provisioning", "account_created"]).limit(1),
    service.from("partner_applications").select("id").eq("user_id", profile.id)
      .eq("status", "rejected").limit(1),
  ]);

  if (ownedOrg.error || openApplication.error || rejectedApplication.error) return false;
  if (ownedOrg.data?.length || openApplication.data?.length || !rejectedApplication.data?.length) {
    return false;
  }

  const { error: deleteErr } = await service.auth.admin.deleteUser(profile.id);
  if (deleteErr) {
    console.error("rejected partner retry cleanup failed:", deleteErr.message);
    return false;
  }
  return true;
}

async function handleSubmit(
  req: Request,
  body: Record<string, unknown>,
  service: ServiceClient,
) {
  const payload = body.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") {
    return fail(400, "invalid_input", "Thiếu thông tin đăng ký.");
  }

  const name = normalizeText(payload.name, 160);
  const orgType = normalizeText(payload.org_type, 20);
  const taxCode = normalizeText(payload.tax_code, 50);
  const contactPerson = normalizeText(payload.contact_person, 120);
  const phone = normalizeText(payload.phone, 40);
  const rawEmail = normalizeText(payload.email, 200).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";

  if (
    !name || !contactPerson || !phone ||
    !ORG_TYPES.has(orgType) || !EMAIL_RE.test(rawEmail) ||
    password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)
  ) {
    return fail(
      400,
      "invalid_input",
      "Vui lòng nhập thông tin hợp lệ và mật khẩu ít nhất 10 ký tự gồm chữ và số.",
    );
  }

  // 1. Rate-limit và chống spam thông qua submit guard RPC.
  const ipHeader =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("cf-connecting-ip") ??
    "direct";
  const clientIp = ipHeader.split(",")[0].trim();
  const ipHash = md5(clientIp);
  const emailHash = md5(rawEmail);

  try {
    const { data: guardData, error: guardErr } = await service.rpc(
      "partner_application_submit_guard",
      { p_ip_hash: ipHash, p_email_hash: emailHash },
    );
    if (guardErr) {
      console.warn("partner_application_submit_guard error:", guardErr.message);
    } else if (guardData && guardData[0] && !guardData[0].accepted) {
      if (guardData[0].reason === "duplicate") {
        // Do not reveal whether a given email already applied.
        return json({ ok: true, duplicate: true }, 200);
      }
      return fail(
        429,
        "rate_limited",
        "Có quá nhiều yêu cầu gửi hồ sơ. Vui lòng thử lại sau.",
      );
    }
  } catch (err) {
    console.warn("submit guard invocation failed:", err);
  }

  // 2. Chống nộp trùng: một email không thể có hồ sơ đang mở hoặc đã duyệt.
  const { data: existing, error: dupErr } = await service
    .from("partner_applications")
    .select("id, status")
    .eq("email", rawEmail)
    .in("status", ["pending", "provisioning", "account_created"])
    .limit(1);

  if (dupErr) {
    return fail(500, "server_error", "Không kiểm tra được hồ sơ hiện có.");
  }
  if (existing && existing.length > 0) {
    // Same response as a fresh submission: do not expose queue membership.
    return json({ ok: true, duplicate: true }, 200);
  }

  // Auth giữ mật khẩu; tài khoản bị khóa trước khi Admin duyệt.
  const createUserPayload = {
    email: rawEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: contactPerson, role: "business" },
    app_metadata: { mailbox_unverified: true },
  };
  let { data: created, error: createErr } = await service.auth.admin.createUser(createUserPayload);
  if (isExistingUserError(createErr?.message) && await removeRejectedAuthUserForRetry(service, rawEmail)) {
    ({ data: created, error: createErr } = await service.auth.admin.createUser(createUserPayload));
  }
  if (createErr || !created?.user) {
    if (isExistingUserError(createErr?.message)) {
      return fail(409, "email_exists", "Email này đã có tài khoản SkillPass.");
    }
    return fail(500, "server_error", "Không tạo được tài khoản đối tác.");
  }
  const userId = created.user.id;
  const { error: banErr } = await service.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (banErr) {
    await service.auth.admin.deleteUser(userId);
    return fail(500, "server_error", "Không khóa được tài khoản chờ duyệt.");
  }

  // Ghi hồ sơ với status pending; không lưu mật khẩu ở bảng hồ sơ.
  const { data: inserted, error: insertErr } = await service
    .from("partner_applications")
    .insert({
      name,
      org_type: orgType,
      tax_code: taxCode || null,
      contact_person: contactPerson,
      phone,
      email: rawEmail,
      user_id: userId,
      ip_hash: ipHash,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    await service.auth.admin.deleteUser(userId);
    console.error("partner application insert failed:", insertErr?.message);
    return fail(500, "server_error", "Không lưu được hồ sơ. Vui lòng thử lại.");
  }

  return json({ ok: true, id: inserted.id }, 201);
}

async function handleProvision(
  body: Record<string, unknown>,
  service: ServiceClient,
  adminId: string,
) {
  const applicationId = normalizeText(body.applicationId, 64);
  if (!UUID_RE.test(applicationId)) {
    return fail(400, "invalid_input", "Mã hồ sơ không hợp lệ.");
  }

  // 1. Claim nguyên tử qua RPC (tránh race condition giữa 2 admin).
  const { data: claimRes, error: claimErr } = await service.rpc(
    "partner_application_claim",
    { p_application_id: applicationId, p_admin_id: adminId },
  );

  if (claimErr) {
    console.error("partner claim failed:", claimErr.message);
    return fail(500, "server_error", "Không thể khóa hồ sơ để xử lý.");
  }

  const claimStatus = claimRes?.status;
  if (claimStatus === "not_found") {
    return fail(404, "not_found", "Không tìm thấy hồ sơ đối tác.");
  }
  if (claimStatus === "already_provisioned") {
    return fail(409, "already_provisioned", "Hồ sơ đối tác đã được cấp tài khoản trước đó.");
  }
  if (claimStatus === "rejected") {
    return fail(409, "invalid_state", "Hồ sơ đã bị từ chối.");
  }
  if (claimStatus !== "claimed") {
    return fail(409, "conflict", "Hồ sơ đang được xử lý bởi quản trị viên khác.");
  }

  // 2. Lấy thông tin hồ sơ đã claim.
  const { data: app, error: appErr } = await service
    .from("partner_applications")
    .select("*")
    .eq("id", applicationId)
    .single();

  if (appErr || !app) {
    return fail(500, "server_error", "Không lấy được thông tin hồ sơ đã claim.");
  }

  const revertToPending = async (reason: string) => {
    const { error } = await service.rpc("partner_application_release", {
      p_application_id: applicationId,
      p_admin_id: adminId,
      p_reason: reason,
    });
    if (error) console.error("partner release failed:", error.message);
  };

  // Hồ sơ cũ chưa có Auth user vẫn dùng quy trình cấp tài khoản trước đây.
  let userId: string = app.user_id;
  const legacyAccount = !userId;
  if (legacyAccount) {
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email: app.email,
      password: generatePassword(),
      email_confirm: true,
      user_metadata: { full_name: app.contact_person, role: "business" },
      app_metadata: { mailbox_unverified: true },
    });
    if (createErr || !created?.user) {
      await revertToPending("Account creation failed");
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("exist") || msg.includes("registered")) {
        return fail(409, "email_exists", "Email đã có tài khoản SkillPass. Không thể cấp trùng.");
      }
      console.error("partner auth create failed:", createErr?.message);
      return fail(500, "server_error", "Không tạo được tài khoản đối tác.");
    }
    userId = created.user.id;
  }

  // Bảo đảm public.users tồn tại (trigger tự sinh, nhưng dự phòng nếu môi trường tắt trigger).
  const { data: profile } = await service
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    const { error: profileErr } = await service.from("users").insert({
      id: userId,
      email: app.email,
      full_name: app.contact_person,
      role: "business",
    });
    if (profileErr) {
      if (legacyAccount) await service.auth.admin.deleteUser(userId);
      await revertToPending("Profile creation failed");
      console.error("partner public.users insert failed:", profileErr.message);
      return fail(500, "server_error", "Không tạo được hồ sơ người dùng đối tác.");
    }
  }

  // 4. Tạo organization. Trigger sync_organization_owner_membership tự thêm owner
  //    membership, do đó không tự thêm row organization_members.
  const domain = emailDomain(app.email);
  const orgPayload = {
    name: app.name,
    org_type: app.org_type,
    tax_code: app.tax_code || null,
    phone: app.phone || null,
    contact_email: app.email,
    contact_person: app.contact_person || null,
    domain,
    owner_user_id: userId,
    // Admin approval is the single verification decision for the trial flow.
    kyc_status: "verified",
    approved_at: new Date().toISOString(),
    verification_tier: app.org_type === "school" ? "academic" : "enterprise",
  };

  let org: { id: string } | null = null;
  let orgErr: { message: string } | null = null;
  ({ data: org, error: orgErr } = await service
    .from("organizations")
    .insert(orgPayload)
    .select("id")
    .single());

  // Xung đột tên miền (tên miền đã gán tổ chức khác): fallback domain = null
  if (orgErr && domain && /duplicate key|unique/i.test(orgErr.message)) {
    ({ data: org, error: orgErr } = await service
      .from("organizations")
      .insert({ ...orgPayload, domain: null })
      .select("id")
      .single());
  }

  if (orgErr || !org) {
    if (legacyAccount) await service.auth.admin.deleteUser(userId);
    await revertToPending("Organization creation failed");
    console.error("partner organization insert failed:", orgErr?.message);
    return fail(500, "server_error", "Không tạo được tổ chức đối tác.");
  }

  if (!legacyAccount) {
    const { error: unbanErr } = await service.auth.admin.updateUserById(userId, { ban_duration: "none" });
    if (unbanErr) {
      await service.from("organizations").delete().eq("id", org.id);
      await revertToPending("Account unlock failed");
      return fail(500, "server_error", "Chưa mở khóa được tài khoản đối tác. Vui lòng thử lại.");
    }
  }

  // 5. Finalize application qua RPC nguyên tử.
  const { data: finRes, error: finErr } = await service.rpc(
    "partner_application_finalize",
    {
      p_application_id: applicationId,
      p_admin_id: adminId,
      p_user_id: userId,
      p_organization_id: org.id,
    },
  );

  if (
    finErr ||
    (finRes?.status !== "finalized" && finRes?.status !== "already_finalized")
  ) {
    // Roll back the records created in this attempt so the admin can retry
    // instead of leaving an orphaned account behind an unreviewed application.
    console.error("partner finalize failed:", finErr?.message, finRes);
    if (!legacyAccount) await service.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    await service.from("organizations").delete().eq("id", org.id);
    if (legacyAccount) await service.auth.admin.deleteUser(userId);
    await revertToPending("Finalize failed");
    return fail(500, "server_error", "Không chốt được hồ sơ đối tác. Vui lòng thử lại.");
  }

  await logAudit(
    service,
    adminId,
    org.id,
    "provision_partner",
    "Cấp tài khoản đối tác: " + app.name,
    "Đã tạo tài khoản business cho " + app.email + " và tổ chức " + app.org_type + ".",
    "ok",
    "award",
  );

  if (!legacyAccount) {
    return json({ ok: true, account: { userId, organizationId: org.id, email: app.email } });
  }

  // Legacy account: the partner sets their own password via a one-time link. Only the hash is
  // stored; the internal random password is never returned or logged.
  const appUrl = Deno.env.get("APP_URL") ?? "https://skillpass-app-sooty.vercel.app";
  const setupToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  const setupTokenHash = createHash("sha256").update(setupToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: tokenErr } = await service.rpc("partner_application_set_setup_token", {
    p_application_id: applicationId,
    p_token_hash: setupTokenHash,
    p_expires_at: expiresAt,
  });
  if (tokenErr) {
    console.error("partner setup token store failed:", tokenErr.message);
    return fail(500, "server_error", "Đã tạo tài khoản nhưng chưa tạo được link đặt mật khẩu. Hãy dùng quên mật khẩu.");
  }

  return json({
    ok: true,
    account: {
      userId,
      organizationId: org.id,
      email: app.email,
      setupUrl: appUrl + "/biz/set-password?token=" + setupToken,
      setupExpiresAt: expiresAt,
    },
  });
}

async function handleReject(
  body: Record<string, unknown>,
  service: ServiceClient,
  adminId: string,
) {
  const applicationId = normalizeText(body.applicationId, 64);
  const reason = normalizeText(body.reason, 1000);
  if (!UUID_RE.test(applicationId) || !reason) {
    return fail(400, "invalid_input", "Vui lòng nhập lý do từ chối hợp lệ.");
  }

  // Keep the Auth user id before changing status so cleanup can be retried
  // even when the database operation succeeds but Auth deletion fails.
  const { data: appBeforeReject, error: appReadErr } = await service
    .from("partner_applications")
    .select("name, email, user_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appReadErr) {
    return fail(500, "server_error", "Không đọc được hồ sơ trước khi từ chối.");
  }

  const { data: rejRes, error: rejErr } = await service.rpc(
    "partner_application_reject",
    {
      p_application_id: applicationId,
      p_admin_id: adminId,
      p_reason: reason,
    },
  );

  if (rejErr) {
    console.error("partner reject failed:", rejErr.message);
    return fail(500, "server_error", "Không từ chối được hồ sơ.");
  }

  const status = rejRes?.status;
  if (status === "not_found") {
    return fail(404, "not_found", "Không tìm thấy hồ sơ đối tác.");
  }
  if (status === "invalid_reason") {
    return fail(400, "invalid_input", "Vui lòng nhập lý do từ chối.");
  }
  if (status === "already_provisioned") {
    return fail(409, "invalid_state", "Hồ sơ đã được cấp tài khoản, không thể từ chối.");
  }
  if (status !== "rejected") {
    return fail(409, "invalid_state", "Chỉ có thể từ chối hồ sơ đang chờ duyệt.");
  }

  await logAudit(
    service,
    adminId,
    null,
    "reject_partner",
    "Từ chối hồ sơ đối tác: " + (appBeforeReject?.name ?? applicationId),
    "Hồ sơ của " + (appBeforeReject?.email ?? "đối tác") + " bị từ chối. Lý do: " + reason,
    "bad",
    "x",
  );

  if (appBeforeReject?.user_id) {
    const { error: deleteErr } = await service.auth.admin.deleteUser(appBeforeReject.user_id);
    if (deleteErr) {
      console.error("rejected partner cleanup failed:", deleteErr.message);
      return fail(
        500,
        "account_cleanup_failed",
        "Hồ sơ đã bị từ chối nhưng chưa dọn được tài khoản chờ duyệt. Vui lòng thử đăng ký lại.",
      );
    }
  }

  return json({ ok: true });
}

async function handleCompleteSetup(body: Record<string, unknown>, service: ServiceClient) {
  const token = normalizeText(body.token, 128).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return fail(400, "invalid_token", "Link đặt mật khẩu không hợp lệ.");
  }
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return fail(400, "weak_password", "Mật khẩu cần ít nhất 10 ký tự, gồm chữ và số.");
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Consume first: the RPC locks the row and clears the hash atomically, so a
  // replayed or concurrent request cannot set a second password.
  const { data: consumed, error: consumeErr } = await service.rpc("partner_application_consume_setup_token", {
    p_token_hash: tokenHash,
  });
  if (consumeErr) {
    console.error("partner setup consume failed:", consumeErr.message);
    return fail(500, "server_error", "Không kiểm tra được link đặt mật khẩu.");
  }
  if (consumed?.status !== "consumed" || !consumed?.user_id) {
    return fail(410, "invalid_or_expired", "Link đã hết hạn hoặc đã được sử dụng. Hãy liên hệ Admin để cấp lại.");
  }

  const { error: updateErr } = await service.auth.admin.updateUserById(consumed.user_id, { password });
  if (updateErr) {
    console.error("partner password update failed:", updateErr.code ?? updateErr.message);
    return fail(500, "server_error", "Link đã dùng nhưng chưa đặt được mật khẩu. Hãy liên hệ Admin để cấp lại.");
  }

  return json({ ok: true, email: consumed.email });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return fail(405, "method_not_allowed", "Chỉ hỗ trợ POST.");
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let raw: Record<string, unknown> = {};
  try {
    raw = await req.json();
  } catch {
    return fail(400, "invalid_input", "Dữ liệu gửi lên không hợp lệ.");
  }
  const action = normalizeText(raw.action, 32);

  switch (action) {
    case "submit":
      return await handleSubmit(req, raw, service);
    case "complete_setup":
      return await handleCompleteSetup(raw, service);
    case "provision":
    case "reject": {
      const auth = await requireAdmin(req, service);
      if (auth instanceof Response) return auth;
      return action === "provision"
        ? await handleProvision(raw, service, auth.userId)
        : await handleReject(raw, service, auth.userId);
    }
    default:
      return fail(400, "invalid_action", "Hành động không được hỗ trợ.");
  }
});
