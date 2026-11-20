// Supabase Edge Function: shared-evidence-url
// Trả signed URL ngắn hạn (TTL 60s) cho avatar và minh chứng của một link chia sẻ.
// Chạy với service_role nhưng thực hiện kiểm tra quyền chặt chẽ và phòng chống Confused-Deputy:
//   1. Link active, chưa hết hạn.
//   2. Validate code (format hợp lệ) và certificate_id (UUID hoặc slug regex, chống injection).
//   3. Nếu link restricted: người gọi PHẢI đăng nhập VÀ email_confirmed_at IS NOT NULL
//      VÀ email nằm trong allowed_emails.
//   4. Tuyệt đối KHÔNG fallback qua users.share_code (chống bypass restricted).
//   5. Chứng chỉ phải thuộc chủ sở hữu link và ở trạng thái đã duyệt ('issued', 'approved').
//   6. Validate nguồn gốc URL (SUPABASE_URL origin only), chống directory traversal.
//   7. Xác thực quyền sở hữu storage.objects.owner / owner_id = cert.student_id TRƯỚC KHI ký
//      (kể cả avatar, tài liệu minh chứng, và legacy cert.evidence_url).
//   8. Unowned legacy (owner và owner_id đều NULL) bị fail-closed và ghi log manual audit;
//      tuyệt đối không tự trust.
//   9. TTL ngắn 60s để giảm thiểu rủi ro rò rỉ link signed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "certificates";
const SIGNED_TTL_SECONDS = 60; // 60s TTL như yêu cầu bảo mật

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

/**
 * Trích xuất và chuẩn hóa storage path từ URL hoặc raw path.
 * - Bắt buộc origin phải khớp với SUPABASE_URL nếu là absolute URL.
 * - Kiểm tra và chặn đứng directory traversal ('..', '//', '\\').
 */
function pathFrom(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  let candidate: string;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsedUrl = new URL(raw);
      const expectedOrigin = new URL(SUPABASE_URL).origin;
      // Fail-closed nếu URL xuất phát từ bên ngoài Supabase instance
      if (parsedUrl.origin.toLowerCase() !== expectedOrigin.toLowerCase()) {
        return null;
      }
      const m = parsedUrl.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/certificates\/([^?#]+)/i);
      if (!m) return null;
      candidate = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  } else {
    candidate = raw;
  }

  const cleaned = candidate.replace(/^\/+/, "").trim();
  // Chống directory traversal & ký tự nguy hiểm
  if (!cleaned || cleaned.includes("..") || cleaned.includes("\\") || /\/{2,}/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Kiểm tra quyền sở hữu storage object trước khi ký URL (chống Confused-Deputy).
 * - Tra cứu storage.objects với bucket_id = BUCKET và name = path.
 * - Fail-closed nếu không tìm thấy object.
 * - Fail-closed và cảnh báo audit nếu object không có owner (unowned legacy).
 * - Bắt buộc owner/owner_id phải trùng khớp với expectedUserId.
 */
async function verifyStorageOwnership(
  service: any,
  path: string,
  expectedUserId: string
): Promise<boolean> {
  try {
    const { data, error } = await service.rpc("storage_object_owned_by", {
      p_path: path,
      p_user_id: expectedUserId,
    });
    return !error && data === true;
  } catch (err) {
    console.error("Error verifying storage ownership for " + path + ":", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ status: "not_found" }, 405);

  let payload: { code?: string; certificate_id?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ status: "not_found" }, 400);
  }

  const rawCode = (payload.code ?? "").trim();
  // Validate format mã code an toàn (chỉ chữ, số, gạch ngang, gạch dưới)
  if (!rawCode || !/^[A-Za-z0-9_-]{3,64}$/.test(rawCode)) {
    return json({ status: "not_found" });
  }
  const code = rawCode.toUpperCase();

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Phân giải link từ shared_links (KHÔNG fallback qua users.share_code)
  const { data: links, error: linkErr } = await service
    .from("shared_links")
    .select("user_id, status, expires_at, access_mode, allowed_emails")
    .ilike("code", code)
    .limit(1);

  if (linkErr || !links || links.length === 0) {
    return json({ status: "not_found" });
  }

  const link = links[0];
  if (link.status === "revoked") return json({ status: "revoked" });
  if (link.status === "expired" || (link.expires_at && Date.parse(link.expires_at) <= Date.now())) {
    return json({ status: "expired" });
  }

  const mode = link.access_mode === "restricted" ? "restricted" : "public";

  // 2. Kiểm tra quyền khi ở chế độ restricted
  if (mode === "restricted") {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ status: "login_required" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authUser, error: authErr } = await service.auth.getUser(token);
    if (authErr || !authUser?.user) {
      return json({ status: "login_required" });
    }

    // Bắt buộc email_confirmed_at IS NOT NULL và không bị đánh dấu mailbox_unverified
    const isUnverified =
      authUser.user.app_metadata?.mailbox_unverified === true ||
      authUser.user.app_metadata?.mailbox_unverified === "true";
    if (!authUser.user.email_confirmed_at || isUnverified) {
      return json({ status: "login_required" });
    }

    const callerEmail = (authUser.user.email ?? "").trim().toLowerCase();
    const allow = (link.allowed_emails ?? []).map((e: string) => e.trim().toLowerCase());
    if (!callerEmail || !allow.includes(callerEmail)) {
      return json({ status: "denied" });
    }
  }

  const userId = link.user_id;
  if (!userId) return json({ status: "not_found" });

  // 3. Avatar URL có ký hạn (xác thực quyền sở hữu trước khi ký)
  const { data: profile } = await service
    .from("users")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const avatarPath = pathFrom(profile?.avatar_url);
  let avatarUrl: string | null = null;
  if (avatarPath) {
    const isOwner = await verifyStorageOwnership(service, avatarPath, userId);
    if (isOwner) {
      const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(avatarPath, SIGNED_TTL_SECONDS);
      avatarUrl = signed?.signedUrl ?? null;
    }
  }

  // 4. Nếu yêu cầu chi tiết chứng chỉ, validate an toàn không dùng .or nối chuỗi
  const evidence: Array<{ id: string; signed_url: string | null }> = [];
  const certRef = (payload.certificate_id ?? "").trim();
  if (certRef) {
    // Validate UUID hoặc slug regex
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certRef);
    const isSlug = /^[A-Za-z0-9_-]{1,64}$/.test(certRef);
    if (!isUuid && !isSlug) {
      return json({ status: "not_found" });
    }

    let certQuery = service
      .from("certificates")
      .select("id, evidence_url, evidence_name")
      .eq("student_id", userId)
      .in("status", ["issued", "approved"]);

    if (isUuid) {
      certQuery = certQuery.eq("id", certRef);
    } else {
      certQuery = certQuery.eq("slug_id", certRef);
    }

    const { data: certs, error: certErr } = await certQuery.limit(1);
    if (certErr || !certs || certs.length === 0) {
      return json({ status: "not_found" });
    }

    const cert = certs[0];
    const certId = cert.id;

    // Lấy danh sách tài liệu minh chứng trong bảng evidence_documents
    const { data: docs, error: docErr } = await service
      .from("evidence_documents")
      .select("id, storage_path")
      .eq("certificate_id", certId)
      .order("created_at", { ascending: true });

    if (!docErr && docs) {
      for (const doc of docs) {
        const path = pathFrom(doc.storage_path);
        if (!path) {
          evidence.push({ id: doc.id, signed_url: null });
          continue;
        }

        // Xác thực quyền sở hữu storage object TRƯỚC KHI ký (chống confused-deputy)
        const isOwner = await verifyStorageOwnership(service, path, userId);
        if (!isOwner) {
          evidence.push({ id: doc.id, signed_url: null });
          continue;
        }

        const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS);
        evidence.push({ id: doc.id, signed_url: signed?.signedUrl ?? null });
      }
    }

    // Xử lý legacy cert có evidence_url trực tiếp trên certificates:
    // Nếu cert.evidence_url có giá trị và chưa được ký trong bảng evidence_documents,
    // cấp signed URL với id: 'primary' SAU KHI xác thực quyền sở hữu
    const legacyPath = pathFrom(cert.evidence_url);
    if (legacyPath && !evidence.some((e) => e.id === "primary")) {
      const isLegacyOwner = await verifyStorageOwnership(service, legacyPath, userId);
      if (isLegacyOwner) {
        const { data: signedLegacy } = await service.storage.from(BUCKET).createSignedUrl(legacyPath, SIGNED_TTL_SECONDS);
        evidence.unshift({ id: "primary", signed_url: signedLegacy?.signedUrl ?? null });
      } else {
        evidence.unshift({ id: "primary", signed_url: null });
      }
    }
  }

  return json({ status: "ok", avatar_url: avatarUrl, evidence });
});
