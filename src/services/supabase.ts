import { createClient } from '@supabase/supabase-js';
import type {
  UserRow,
  OrganizationRow,
  CertificateRow,
  EvidenceDocumentRow,
  BadgeRow,
  SharedLinkRow,
  NotificationRow,
  CertificateStatus,
  AdminAuditLogRow,
  AdminActionType,
  NotificationTone,
  NotificationIcon,
  SystemSettingRow,
  KycStatus,
  SharedAccessMode,
  SharedAccessStatus,
  SharedProfileResult,
  SharedCertificateResult,
} from '../types/database';

// Cấu hình URL và Anon Key của Supabase
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://vaxtkabqnvazdsiditgs.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable__gu6cZv9YJiUTS5BUQLW2A_E9LN8MMn';

export { SUPABASE_URL, SUPABASE_ANON_KEY };

export const isSupabaseConfigured = true;

/** Abort stalled network requests instead of leaving submit buttons pending forever. */
export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  timeoutMs = 45000
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const upstream = init.signal;
  if (upstream?.aborted) abort();
  else upstream?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', abort);
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: fetchWithTimeout },
});

/** Canonical locators are persisted; only short-lived signed URLs are rendered. */
function certificatesStoragePath(value?: string | null): string | null {
  if (!value) return null;
  try {
    let path = value.trim();
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path);
      if (url.origin !== new URL(SUPABASE_URL).origin) return null;
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/certificates\/(.+)$/);
      if (!match) return null;
      path = decodeURIComponent(match[1]);
    }
    if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('//')) return null;
    return path;
  } catch { return null; }
}

const privateUrlCache = new Map<string, { url: string; expiresAt: number }>();
export async function getPrivateStorageUrl(value?: string | null): Promise<string | null> {
  const path = certificatesStoragePath(value);
  if (!path) return null;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.user.id) return null;
  const key = `${session.session.user.id}:${path}`;
  const cached = privateUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from('certificates').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return null;
  privateUrlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + 45000 });
  return data.signedUrl;
}

async function certificateDisplayRows(rows: CertificateRow[]): Promise<CertificateRow[]> {
  return Promise.all(rows.map(async (row) => ({
    ...row,
    evidence_url: await getPrivateStorageUrl(row.evidence_url),
    evidence_documents: await Promise.all((row.evidence_documents || []).map(async (doc) => ({
      ...doc,
      storage_path: await getPrivateStorageUrl(doc.storage_path),
    }))),
  })));
}

async function organizationDisplayRow(row: OrganizationRow): Promise<OrganizationRow> {
  return { ...row, logo_url: await getPrivateStorageUrl(row.logo_url) };
}

/* ============================================================
   0. XÁC THỰC TÀI KHOẢN (SUPABASE AUTH) & UPLOAD STORAGE
   ============================================================ */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    console.warn('Supabase Auth signIn notice:', error.message);
    return { user: null, error: error.message };
  }
  return { user: data.user, error: null };
}

export function registrationErrorMessage(error: { code?: string; status?: number; message?: string }): string {
  const message = error.message ?? '';
  if (error.code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(message)) {
    return 'Dịch vụ đang chạm giới hạn gửi email xác nhận. Đổi email hoặc đăng ký lại liên tục không giải quyết được giới hạn toàn hệ thống. Vui lòng thử lại sau; quản trị viên cần kiểm tra hạn mức và cấu hình SMTP riêng.';
  }
  if (error.code === 'email_address_not_authorized') {
    return 'Dịch vụ email hiện chưa cho phép gửi tới địa chỉ này. Quản trị viên cần cấu hình SMTP riêng để người dùng đăng ký.';
  }
  if (error.code === 'over_request_rate_limit' || error.status === 429) {
    return 'Có quá nhiều yêu cầu đăng ký. Vui lòng tạm dừng và thử lại sau.';
  }
  if (error.code === 'email_address_invalid' || /email.*invalid/i.test(message)) {
    return 'Dịch vụ xác thực từ chối địa chỉ email này. Vui lòng dùng email thật đang hoạt động và kiểm tra lại chính tả.';
  }
  if (error.code === 'user_already_exists' || error.code === 'email_exists' || /already registered/i.test(message)) {
    return 'Email này đã được đăng ký. Vui lòng đăng nhập hoặc đặt lại mật khẩu.';
  }
  if (error.code === 'weak_password') {
    return 'Mật khẩu chưa đáp ứng yêu cầu bảo mật. Vui lòng chọn mật khẩu dài và khó đoán hơn.';
  }
  if (error.code === 'signup_disabled') {
    return 'Hệ thống đang tạm ngừng đăng ký tài khoản mới. Vui lòng liên hệ quản trị viên.';
  }
  if (/abort|timeout|fetch|network|load failed/i.test(message)) {
    return 'Chưa nhận được kết quả đăng ký do kết nối gián đoạn. Kiểm tra hộp thư trước khi thử lại; nếu đã nhận email xác nhận, hãy mở liên kết trong email đó.';
  }
  if ((error.status ?? 0) >= 500 || /smtp|sending.*email/i.test(message)) {
    return 'Dịch vụ chưa gửi được email xác nhận. Vui lòng thử lại sau hoặc liên hệ quản trị viên kiểm tra cấu hình gửi email.';
  }
  return 'Chưa tạo được tài khoản. Vui lòng kiểm tra thông tin và thử lại.';
}

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  fullName: string;
  role: 'student' | 'business' | 'admin';
  mssv?: string;
  schoolName?: string;
}) {
  try {
    const redirect =
      typeof window !== 'undefined' && window.location ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: params.email.trim().toLowerCase(),
      password: params.password,
      options: {
        emailRedirectTo: redirect,
        data: {
          full_name: params.fullName,
          role: params.role,
          mssv: params.mssv ?? '',
          school_name: params.schoolName ?? '',
        },
      },
    });
    if (error) {
      console.warn('Supabase Auth signUp notice:', error.message);
      const errorCode = error.code ||
        (/email rate limit exceeded/i.test(error.message) ? 'over_email_send_rate_limit' : undefined);
      return { user: null, session: null, error: registrationErrorMessage(error), errorCode };
    }
    // Supabase trả về identities rỗng khi email đã được đăng ký trước đó
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { user: null, session: null, error: 'Email này đã được đăng ký. Vui lòng đăng nhập hoặc kiểm tra email xác nhận đã nhận.', errorCode: 'user_already_exists' };
    }
    // With Confirm email enabled, a user without a session is expected.
    // Do not send a second auth request or pretend the account is already signed in.
    return { user: data.user, session: data.session, error: null };
  } catch (error) {
    return {
      user: null, session: null, errorCode: 'registration_unavailable',
      error: registrationErrorMessage({ message: error instanceof Error ? error.message : 'network unavailable' }),
    };
  }
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export async function getOrganizationForUser(
  userId: string,
  email?: string
): Promise<OrganizationRow | null> {
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_demo', false)
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (data && data.length > 0) return organizationDisplayRow(data[0]);
  if (email) {
    const { data: byEmail } = await supabase
      .from('organizations')
      .select('*')
      .eq('is_demo', false)
      .ilike('contact_email', email.trim())
      .limit(1);
    if (byEmail && byEmail.length > 0) return organizationDisplayRow(byEmail[0]);
  }
  return null;
}

export async function uploadFileToStorage(
  localUri: string,
  folder: 'evidence' | 'avatars' | 'student_cards' = 'evidence',
  customFileName?: string
): Promise<string | null> {
  try {
    const rawExt = (customFileName || localUri).split('.').pop()?.toLowerCase() || 'jpg';
    const ext = rawExt.includes('?') ? rawExt.split('?')[0] : rawExt;
    const cleanBase = (customFileName || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 30);
    const fileName = `${folder}/${Date.now()}_${cleanBase}`;
    // Keep the deadline active while reading the local file as well as its headers.
    const fileController = new AbortController();
    const fileTimer = setTimeout(() => fileController.abort(), 15000);
    let arrayBuffer: ArrayBuffer;
    try {
      const response = await fetch(localUri, { signal: fileController.signal });
      if (!response.ok) throw new Error('Không đọc được tệp đã chọn. Vui lòng chọn lại minh chứng.');
      arrayBuffer = await response.arrayBuffer();
    } finally {
      clearTimeout(fileTimer);
    }
    if (!arrayBuffer.byteLength) throw new Error('Tệp minh chứng đang trống. Vui lòng chọn tệp khác.');

    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
        ? 'image/webp'
        : ext === 'svg'
        ? 'image/svg+xml'
        : 'image/jpeg';

    const { error } = await supabase.storage
      .from('certificates')
      .upload(fileName, arrayBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.warn('Error uploading file to Supabase Storage:', error.message);
      throw new Error(
        /jwt|token|unauthorized/i.test(error.message)
          ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi gửi hồ sơ.'
          : /abort|timeout|fetch|network/i.test(error.message)
          ? 'Tải minh chứng quá lâu hoặc mất kết nối. Vui lòng kiểm tra mạng và thử lại.'
          : `Không tải được minh chứng: ${error.message}`
      );
    }

    const { data } = supabase.storage.from('certificates').getPublicUrl(fileName);
    return data.publicUrl; // Stable locator only; getPrivateStorageUrl resolves display URLs.
  } catch (err) {
    console.warn('Không tải được tệp minh chứng:', err);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Đọc hoặc tải minh chứng quá lâu. Vui lòng kiểm tra mạng và chọn lại tệp.');
    }
    throw err;
  }
}

/* ============================================================
   1. HỒ SƠ NGƯỜI DÙNG (USERS)
   ============================================================ */
export async function getUserProfile(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('Error fetching user profile:', error);
    return null;
  }
  return data ? { ...data, avatar_url: await getPrivateStorageUrl(data.avatar_url) } : null;
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<Omit<UserRow, 'id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId).select('id').maybeSingle();

  if (error) {
    console.warn('Error updating user profile:', error);
    return false;
  }
  return Boolean(data);
}

export async function getUserByShareCode(shareCode: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('share_code', shareCode)
    .single();

  if (error) {
    console.warn('Error finding user by share code:', error);
    return null;
  }
  return data;
}

/* ============================================================
   2. TỔ CHỨC / TRƯỜNG HỌC / DOANH NGHIỆP (ORGANIZATIONS)
   ============================================================ */
export async function getSchools(): Promise<OrganizationRow[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_demo', false)
    .eq('org_type', 'school')
    .order('name');

  if (error) {
    console.warn('Error fetching schools:', error);
    return [];
  }
  return data ?? [];
}

export async function getCompanies(): Promise<OrganizationRow[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_demo', false)
    .eq('org_type', 'company')
    .order('name');

  if (error) {
    console.warn('Error fetching companies:', error);
    return [];
  }
  return data ?? [];
}

export async function createOtherOrg(orgData: {
  name: string;
  contact_email?: string;
  phone?: string;
  contact_person?: string;
  org_type: 'school' | 'company' | 'other';
  proposed_by_label?: string;
}): Promise<OrganizationRow | null> {
  const { data, error } = await supabase
    .from('organizations')
    .insert([
      {
        ...orgData,
        verification_tier: 'community',
        // Database stores proposals as pending; proposed_by_label distinguishes them in the UI.
        kyc_status: 'pending',
        is_demo: false,
      },
    ])
    .select()
    .single();

  if (error) {
    console.warn('Error creating other organization:', error);
    return null;
  }
  return data;
}

export async function getAllOrganizationsForAdmin(): Promise<OrganizationRow[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_demo', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching organizations for admin:', error);
    return [];
  }
  return Promise.all((data ?? []).map(organizationDisplayRow));
}

export async function registerPartnerOrganization(orgData: {
  name: string;
  org_type: 'school' | 'company';
  tax_code?: string;
  domain?: string;
  contact_email: string;
  phone?: string;
  contact_person?: string;
  wallet_address?: string;
  owner_user_id?: string;
}): Promise<OrganizationRow | null> {
  const { data, error } = await supabase
    .from('organizations')
    .insert([
      {
        ...orgData,
        verification_tier: orgData.org_type === 'school' ? 'academic' : 'enterprise',
        kyc_status: 'pending',
        is_demo: false,
      },
    ])
    .select()
    .single();

  if (error) {
    console.warn('Error registering partner organization:', error);
    return null;
  }
  return data;
}

export async function updateOrganizationKycStatus(
  orgId: string,
  kycStatus: KycStatus,
  verificationTier?: 'community' | 'academic' | 'enterprise',
  options?: {
    whitelistTxHash?: string;
    rejectionReason?: string;
  }
): Promise<boolean> {
  const updates: Record<string, unknown> = { kyc_status: kycStatus };
  if (verificationTier) {
    updates.verification_tier = verificationTier;
  }
  if (kycStatus === 'verified') {
    updates.approved_at = new Date().toISOString();
  }
  if (options?.whitelistTxHash) {
    updates.whitelist_tx_hash = options.whitelistTxHash;
  }
  if (options?.rejectionReason !== undefined) {
    updates.rejection_reason = options.rejectionReason;
  }
  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', orgId).select('id').maybeSingle();

  if (error) {
    console.warn('Error updating organization KYC status:', error);
    return false;
  }
  return Boolean(data);
}

/* ============================================================
   2B. QUẢN TRỊ VIÊN (ADMIN AUDIT LOGS & SYSTEM SETTINGS)
   ============================================================ */
export async function getAdminAuditLogs(): Promise<AdminAuditLogRow[]> {
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('*')
    .eq('is_demo', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching admin audit logs:', error);
    return [];
  }
  return data ?? [];
}

export async function createAdminAuditLog(payload: {
  org_id?: string;
  action: AdminActionType;
  tone: NotificationTone;
  icon: NotificationIcon;
  title: string;
  body: string;
  tx_hash?: string;
}): Promise<AdminAuditLogRow | null> {
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .insert([{ ...payload, is_demo: false }])
    .select()
    .single();

  if (error) {
    console.warn('Error creating admin audit log:', error);
    return null;
  }
  return data;
}

export async function getSystemSettings(): Promise<SystemSettingRow | null> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .eq('key', 'default')
    .single();

  if (error) {
    console.warn('Error fetching system settings:', error);
    return null;
  }
  return data;
}

export async function updateSystemSettings(
  updates: Partial<Pick<SystemSettingRow, 'auto_domain_kyc' | 'gasless_relayer' | 'contract_address' | 'chain_id'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('system_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('key', 'default');

  if (error) {
    console.warn('Error updating system settings:', error);
    return false;
  }
  return true;
}

/* ============================================================
   3. CHỨNG CHỈ / YÊU CẦU XÉT DUYỆT (CERTIFICATES)
   ============================================================ */
export const DEFAULT_STUDENT_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_SCHOOL_ORG_ID = '3ced7f3e-63d8-4639-be5c-8518bf906def';
export const DEFAULT_COMPANY_ORG_ID = '8f5a5776-d039-412c-827d-6bd9e59511c2';

export async function getAllCertificates(): Promise<CertificateRow[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*, evidence_documents(*)')
    .eq('is_demo', false)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.warn('Error fetching all certificates:', error);
    return [];
  }
  return certificateDisplayRows(data ?? []);
}

export async function getStudentCertificates(studentId: string): Promise<CertificateRow[]> {
  if (!studentId || studentId === DEFAULT_STUDENT_ID) return [];
  const { data, error } = await supabase
    .from('certificates')
    .select('*, evidence_documents(*)')
    .eq('is_demo', false)
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.warn('Error fetching student certificates:', error);
    return [];
  }
  return certificateDisplayRows(data ?? []);
}

export async function getOrgCertificateRequests(
  orgId: string,
  filterStatus?: CertificateStatus
): Promise<CertificateRow[]> {
  let query = supabase
    .from('certificates')
    .select('*, evidence_documents(*)')
    .eq('is_demo', false)
    .eq('org_id', orgId);

  if (filterStatus) {
    query = query.eq('status', filterStatus);
  }

  const { data, error } = await query.order('submitted_at', { ascending: false });

  if (error) {
    console.warn('Error fetching org certificate requests:', error);
    return [];
  }
  return certificateDisplayRows(data ?? []);
}

export async function submitCertificate(payload: {
  slug_id?: string;
  student_id?: string;
  org_id?: string;
  title: string;
  org_name?: string;
  org_type?: 'school' | 'company';
  org_type_label?: string;
  student_name?: string;
  student_mssv?: string;
  student_school?: string;
  reviewer_label?: string;
  evidence_name?: string;
  evidence_url?: string;
  issue_date_original?: string;
  time_range?: string;
}): Promise<CertificateRow | null> {
  let resolvedOrgId: string | null = payload.org_id || null;
  if (!resolvedOrgId && payload.org_name) {
    const { data: matchedOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('is_demo', false)
      .ilike('name', payload.org_name.trim())
      .limit(1);
    if (matchedOrg && matchedOrg.length > 0) {
      resolvedOrgId = matchedOrg[0].id;
    }
  }

  const { data, error } = await supabase
    .from('certificates')
    .insert([
      {
        slug_id: payload.slug_id,
        student_id: payload.student_id,
        org_id: resolvedOrgId,
        title: payload.title,
        org_name: payload.org_name,
        org_type: payload.org_type || 'company',
        org_type_label: payload.org_type_label,
        student_name: payload.student_name,
        student_mssv: payload.student_mssv,
        student_school: payload.student_school,
        reviewer_label: payload.reviewer_label,
        evidence_name: payload.evidence_name,
        evidence_url: certificatesStoragePath(payload.evidence_url),
        issue_date_original: payload.issue_date_original,
        time_range: payload.time_range,
        status: 'under_review',
        auto_sync: false,
        is_demo: false,
        submitted_at: new Date().toISOString(),
        expected_result: 'Trong 1–3 ngày',
      },
    ])
    .select()
    .single();

  if (error) {
    console.warn('Error submitting certificate:', error);
    return null;
  }
  return data;
}

export async function approveCertificate(
  certificateIdOrSlug: string,
  txHash?: string,
  reviewerLabel?: string
): Promise<boolean> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certificateIdOrSlug);
  const updates: Record<string, unknown> = {
    status: 'approved',
    tx_hash: txHash,
    reviewed_at: new Date().toISOString(),
  };
  if (reviewerLabel) {
    updates.reviewer_label = reviewerLabel;
  }
  const query = supabase.from('certificates').update(updates);

  const { data, error } = await (isUuid ? query.eq('id', certificateIdOrSlug) : query.eq('slug_id', certificateIdOrSlug))
    .in('status', ['submitted', 'under_review']).select('id').maybeSingle();

  if (error) {
    console.warn('Error approving certificate:', error);
    return false;
  }
  return Boolean(data);
}

export async function rejectCertificate(
  certificateIdOrSlug: string,
  rejectionReason: string,
  fixGuide?: string
): Promise<boolean> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certificateIdOrSlug);
  const query = supabase
    .from('certificates')
    .update({
      status: 'rejected',
      rejection_reason: rejectionReason,
      fix_guide: fixGuide,
      rejected_at: new Date().toISOString(),
    });

  const { data, error } = await (isUuid ? query.eq('id', certificateIdOrSlug) : query.eq('slug_id', certificateIdOrSlug))
    .in('status', ['submitted', 'under_review']).select('id').maybeSingle();

  if (error) {
    console.warn('Error rejecting certificate:', error);
    return false;
  }
  return Boolean(data);
}

/* ============================================================
   4. MINH CHỨNG (EVIDENCE DOCUMENTS)
   ============================================================ */
export async function addEvidenceDocument(evidence: {
  certificate_id: string;
  file_name: string;
  storage_path?: string;
  sha256_hash: string;
  mime_type?: string;
  file_size?: number;
}): Promise<EvidenceDocumentRow | null> {
  const { data, error } = await supabase
    .from('evidence_documents')
    .insert([{ ...evidence, storage_path: certificatesStoragePath(evidence.storage_path) }])
    .select()
    .single();

  if (error) {
    console.warn('Error adding evidence document:', error);
    return null;
  }
  return data;
}

export async function getEvidenceDocuments(certificateId: string): Promise<EvidenceDocumentRow[]> {
  try {
    let resolvedId = certificateId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certificateId);
    if (!isUuid) {
      const { data: certRow } = await supabase
        .from('certificates')
        .select('id')
        .eq('slug_id', certificateId)
        .limit(1);
      if (!certRow?.[0]?.id) return [];
      resolvedId = certRow[0].id;
    }
    const { data } = await supabase
      .from('evidence_documents')
      .select('*')
      .eq('certificate_id', resolvedId)
      .order('created_at', { ascending: true });

    return Promise.all((data ?? []).map(async (doc) => {
      const signed = await getPrivateStorageUrl(doc.storage_path);
      return { ...doc, storage_path: signed, signed_url: signed };
    }));
  } catch (err) {
    console.warn('Error fetching evidence documents:', err);
    return [];
  }
}

/* ============================================================
   5. HUY HIỆU SOULBOUND TOKEN (BADGES)
   ============================================================ */
export async function recordMintedBadge(badge: Omit<BadgeRow, 'id' | 'issued_at' | 'is_revoked'>): Promise<BadgeRow | null> {
  const { data, error } = await supabase
    .from('badges')
    .insert([
      {
        ...badge,
        is_revoked: false,
        issued_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    console.warn('Error recording minted badge:', error);
    return null;
  }

  // Cập nhật trạng thái certificate sang 'issued'
  await supabase
    .from('certificates')
    .update({ status: 'issued' })
    .eq('id', badge.certificate_id);

  return data;
}

export async function getBadgesByStudent(studentId: string): Promise<BadgeRow[]> {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_revoked', false)
    .order('issued_at', { ascending: false });

  if (error) {
    console.warn('Error fetching badges by student:', error);
    return [];
  }
  return data ?? [];
}

/* ============================================================
   6. LINK CHIA SẺ & QR CODE (SHARED LINKS)
   ============================================================ */
export async function getAllSharedLinks(): Promise<SharedLinkRow[]> {
  const { data, error } = await supabase
    .from('shared_links')
    .select('*')
    .eq('is_demo', false)
    .order('shared_at', { ascending: false });

  if (error) {
    console.warn('Error fetching all shared links:', error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    access_mode: (row.access_mode as SharedAccessMode) || 'public',
    allowed_emails: Array.isArray(row.allowed_emails) ? row.allowed_emails : [],
  }));
}

export async function getSharedLinks(userId: string): Promise<SharedLinkRow[]> {
  if (!userId || userId === DEFAULT_STUDENT_ID) return [];
  const { data, error } = await supabase
    .from('shared_links')
    .select('*')
    .eq('is_demo', false)
    .eq('user_id', userId)
    .order('shared_at', { ascending: false });

  if (error) {
    console.warn('Error fetching shared links:', error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    access_mode: (row.access_mode as SharedAccessMode) || 'public',
    allowed_emails: Array.isArray(row.allowed_emails) ? row.allowed_emails : [],
  }));
}

export interface CreateSharedLinkOptions {
  accessMode?: SharedAccessMode;
  allowedEmails?: string[];
}

export async function createSharedLink(
  userId: string,
  targetCompany: string,
  customCode?: string,
  options?: CreateSharedLinkOptions
): Promise<SharedLinkRow | null> {
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = customCode || `SP-${randomSuffix}`;

  const accessMode: SharedAccessMode = options?.accessMode === 'restricted' ? 'restricted' : 'public';
  const allowedEmails: string[] = (options?.allowedEmails || [])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  const payload: Record<string, unknown> = {
    user_id: userId,
    code,
    target_company: targetCompany,
    status: 'active',
    note: accessMode === 'restricted' ? `Giới hạn: ${allowedEmails.length} email` : 'Chưa có lượt xem',
    view_count: 0,
    is_demo: false,
    shared_at: new Date().toISOString(),
  };

  // Thử insert đầy đủ cả access_mode và allowed_emails
  let { data, error } = await supabase
    .from('shared_links')
    .insert([
      {
        ...payload,
        access_mode: accessMode,
        allowed_emails: allowedEmails,
      },
    ])
    .select()
    .single();

  if (error && /column.*access_mode|column.*allowed_emails/i.test(error.message)) {
    // CRITICAL SECURITY FIX: Tuyệt đối KHÔNG downgrade link restricted thành public!
    // Nếu người dùng yêu cầu restricted mà DB chưa có cột, phải throw error/báo lỗi fail-closed.
    if (accessMode === 'restricted') {
      console.error('Bảo mật: Database chưa có cột access_mode/allowed_emails. Từ chối tạo link restricted để chống lộ dữ liệu.');
      return null;
    }

    // Chỉ link public thông thường mới được phép retry bỏ 2 cột mới để tương thích DB cũ
    console.warn('Supabase DB chưa có migration access_mode, retry tạo link public thuần:', error.message);
    const retry = await supabase
      .from('shared_links')
      .insert([payload])
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.warn('Error creating shared link:', error);
    return null;
  }
  return data
    ? {
        ...data,
        access_mode: (data.access_mode as SharedAccessMode) || accessMode,
        allowed_emails: Array.isArray(data.allowed_emails) ? data.allowed_emails : allowedEmails,
      }
    : null;
}

export async function revokeSharedLink(codeOrId: string, userId: string): Promise<boolean> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId);
  const query = supabase
    .from('shared_links')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      note: 'Bạn đã thu hồi liên kết này',
    });

  const { data, error } = await (isUuid ? query.eq('id', codeOrId) : query.eq('code', codeOrId))
    .eq('user_id', userId).select('id').maybeSingle();

  if (error) {
    console.warn('Error revoking shared link:', error);
    return false;
  }
  return Boolean(data);
}

/* ============================================================
   6B. TRUY VẤN XÁC MINH AN TOÀN (RPC SECURITY DEFINER - FEEDBACK #2 & #7)
   Chỉ public approved fields, kiểm tra server-side link active +
   allowed_emails (nếu restricted). Chống bypass direct-anon.
   Nếu RPC lỗi hoặc chưa cài migration: FAIL CLOSED (không fallback direct table).
   ============================================================ */

/**
 * Gọi Edge Function 'shared-evidence-url' để lấy signed URL cho avatar & minh chứng
 */
async function resolveSharedStorageUrls(
  code: string,
  certificateId?: string
): Promise<{ avatarUrl: string | null; evidenceUrls: Map<string, string | null> }> {
  const result = { avatarUrl: null as string | null, evidenceUrls: new Map<string, string | null>() };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/shared-evidence-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, certificate_id: certificateId }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok') {
        result.avatarUrl = data.avatar_url || null;
        if (Array.isArray(data.evidence)) {
          for (const item of data.evidence) {
            if (item.id) result.evidenceUrls.set(item.id, item.signed_url || null);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Edge resolver shared-evidence-url error:', err);
  }
  return result;
}

export async function getSharedProfile(code: string): Promise<SharedProfileResult> {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) return { status: 'not_found' };

  try {
    // Gọi duy nhất RPC get_shared_profile (server-side kiểm chứng quyền, fail-closed)
    const { data, error } = await supabase.rpc('get_shared_profile', { p_code: cleanCode });
    if (error) {
      console.warn('Supabase RPC get_shared_profile failed:', error.message);
      // RPC outage hoặc migration missing: Không trả 'not_found' giả khiến người dùng hiểu nhầm mã sai.
      // Ném Error để Lead viewer catches -> hiển thị SharedAccessGate status 'error'.
      throw new Error(`Dịch vụ xác thực hồ sơ chưa sẵn sàng: ${error.message}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Dịch vụ xác thực hồ sơ không phản hồi dữ liệu hợp lệ');
    }

    const res = data as any;
    const st: SharedAccessStatus = (res.status as SharedAccessStatus) || 'not_found';
    const mode: SharedAccessMode = (res.access_mode as SharedAccessMode) || 'public';

    if (st !== 'ok') {
      return { status: st, access_mode: mode };
    }

    const rawCerts: any[] = Array.isArray(res.certificates) ? res.certificates : [];
    const certRows: CertificateRow[] = rawCerts.map((c) => ({
      id: c.id,
      slug_id: c.slug_id || null,
      student_id: res.profile?.id || '',
      org_id: c.org_id || '',
      title: c.title,
      org_name: c.org_name || null,
      org_type: c.org_type || null,
      org_type_label: c.org_type_label || null,
      issue_date_original: c.issue_date_original || null,
      time_range: c.time_range || null,
      status: c.status || 'issued',
      tx_hash: c.tx_hash || null,
      reviewed_at: c.reviewed_at || null,
      submitted_at: c.submitted_at || null,
      auto_sync: false,
    }));

    // Cố gắng lấy avatar signed URL qua Edge Function nếu có
    let avatarUrl: string | null = null;
    const resolvedUrls = await resolveSharedStorageUrls(cleanCode);
    if (resolvedUrls.avatarUrl) {
      avatarUrl = resolvedUrls.avatarUrl;
    }

    return {
      status: 'ok',
      access_mode: mode,
      link: {
        target_company: res.target_company || null,
        access_mode: mode,
      },
      profile: res.profile
        ? {
            id: res.profile.id,
            full_name: res.profile.full_name || 'Sinh viên',
            mssv: res.profile.mssv || null,
            school_name: res.profile.school_name || null,
            avatar_url: avatarUrl,
            share_code: res.profile.share_code || cleanCode,
            wallet_address: res.profile.wallet_address || null,
            email: res.profile.email || null,
          }
        : undefined,
      certificates: certRows,
    };
  } catch (err: any) {
    console.error('getSharedProfile fail-closed exception:', err);
    // Re-throw để caller (SharedAccessGate / UI screen) nhận biết lỗi hạ tầng thực tế
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function getSharedCertificate(
  code: string,
  certificateIdOrSlug: string
): Promise<SharedCertificateResult> {
  const cleanCode = (code || '').trim().toUpperCase();
  const certRef = (certificateIdOrSlug || '').trim();
  if (!cleanCode || !certRef) return { status: 'not_found' };

  try {
    // Gọi duy nhất RPC get_shared_certificate (server-side kiểm chứng quyền, fail-closed)
    const { data, error } = await supabase.rpc('get_shared_certificate', {
      p_code: cleanCode,
      p_cert: certRef,
    });

    if (error) {
      console.warn('Supabase RPC get_shared_certificate failed:', error.message);
      // RPC outage hoặc migration missing: Ném Error để caller xử lý lỗi kết nối
      throw new Error(`Dịch vụ kiểm tra chứng chỉ chưa sẵn sàng: ${error.message}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Dịch vụ kiểm tra chứng chỉ không phản hồi dữ liệu hợp lệ');
    }

    const res = data as any;
    const st: SharedAccessStatus = (res.status as SharedAccessStatus) || 'not_found';
    const mode: SharedAccessMode = (res.access_mode as SharedAccessMode) || 'public';

    if (st !== 'ok' || !res.certificate) {
      return { status: st, access_mode: mode };
    }

    const c = res.certificate;

    // Lấy signed URLs thực sự qua Edge Function cho minh chứng trong bucket private
    const resolvedUrls = await resolveSharedStorageUrls(cleanCode, c.id);

    const docs: EvidenceDocumentRow[] = (c.evidence_documents || []).map((d: any) => {
      // Never expose a canonical/public locator when the resolver refuses signing.
      const signedUrl = resolvedUrls.evidenceUrls.get(d.id) || null;
      return {
        id: d.id,
        certificate_id: c.id,
        file_name: d.file_name,
        storage_path: signedUrl,
        ipfs_cid: d.ipfs_cid || null,
        sha256_hash: d.sha256_hash,
        mime_type: d.mime_type || null,
        file_size: d.file_size || null,
        created_at: d.created_at,
        signed_url: signedUrl,
      };
    });

    // Xử lý legacy: app cũ lưu ảnh trực tiếp ở cert.evidence_url mà không có bản ghi evidence_documents
    if (c.evidence_url && !docs.some((d) => d.id === 'primary' || d.storage_path === c.evidence_url)) {
      const primarySigned = resolvedUrls.evidenceUrls.get('primary') || null;
      docs.unshift({
        id: 'primary',
        certificate_id: c.id,
        file_name: c.evidence_name || 'Minh chứng đính kèm',
        storage_path: primarySigned,
        sha256_hash: '',
        created_at: c.submitted_at || new Date().toISOString(),
        signed_url: primarySigned,
      });
    }

    const certRow: CertificateRow = {
      id: c.id,
      slug_id: c.slug_id || null,
      student_id: c.student_id || '',
      org_id: c.org_id || '',
      title: c.title,
      org_name: c.org_name || null,
      org_type: c.org_type || null,
      org_type_label: c.org_type_label || null,
      issue_date_original: c.issue_date_original || null,
      time_range: c.time_range || null,
      status: c.status || 'issued',
      tx_hash: c.tx_hash || null,
      reviewed_at: c.reviewed_at || null,
      submitted_at: c.submitted_at || null,
      expected_result: c.expected_result || null,
      evidence_url: resolvedUrls.evidenceUrls.get('primary') || null,
      evidence_name: c.evidence_name || null,
      evidence_documents: docs,
      auto_sync: false,
    };

    return {
      status: 'ok',
      access_mode: mode,
      certificate: certRow,
    };
  } catch (err: any) {
    console.error('getSharedCertificate fail-closed exception:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/* ============================================================
   7. THÔNG BÁO (NOTIFICATIONS)
   ============================================================ */
export async function getAllNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('is_demo', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching all notifications:', error);
    return [];
  }
  return data ?? [];
}

export async function getUserNotifications(userId: string): Promise<NotificationRow[]> {
  if (!userId || userId === DEFAULT_STUDENT_ID) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('is_demo', false)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('Error fetching notifications:', error);
    return [];
  }
  return data ?? [];
}

export async function createNotification(payload: {
  user_id?: string;
  role_target: 'student' | 'business';
  certificate_id?: string;
  tone: NotificationTone;
  icon: NotificationIcon;
  title: string;
  body: string;
  reason?: string;
  target_route?: string;
}): Promise<NotificationRow | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert([
      {
        user_id: payload.user_id,
        role_target: payload.role_target,
        certificate_id: payload.certificate_id,
        tone: payload.tone,
        icon: payload.icon,
        title: payload.title,
        body: payload.body,
        reason: payload.reason,
        target_route: payload.target_route || (payload.role_target === 'business' ? '/biz' : '/home'),
        is_read: false,
        is_demo: false,
      },
    ])
    .select()
    .single();

  if (error) {
    console.warn('Error creating notification:', error);
    return null;
  }
  return data;
}

export async function markNotificationAsRead(notifId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId);

  if (error) {
    console.warn('Error marking notification as read:', error);
    return false;
  }
  return true;
}

export async function updateOrganizationLogo(orgId: string, ownerId: string, logoUrl: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('organizations')
    .update({ logo_url: logoUrl })
    .eq('id', orgId)
    .eq('owner_user_id', ownerId)
    .select('id')
    .maybeSingle();

  return !error && Boolean(data);
}
