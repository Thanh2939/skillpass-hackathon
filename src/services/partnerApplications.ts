import { fetchWithTimeout, supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import type {
  PartnerApplication,
  PartnerApplicationInput,
  ProvisionedPartnerAccount,
} from '../types/partnerApplications';

export type { PartnerApplication, PartnerApplicationInput, ProvisionedPartnerAccount } from '../types/partnerApplications';

const ENDPOINT = `${SUPABASE_URL}/functions/v1/partner-applications`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function adminToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Vui lòng đăng nhập cổng nội bộ để xử lý hồ sơ đối tác.');
  }
  // Role/authorization is enforced by RLS and auth.getUser() inside the Edge Function.
  return data.session.access_token;
}

function failureMessage(status: number, code?: string, message?: string): string {
  if (code === 'email_exists') return 'Email này đã có tài khoản SkillPass. Nếu hồ sơ cũ đã bị từ chối, hãy tải lại rồi đăng ký lại.';
  if (code === 'account_cleanup_failed') return message || 'Hồ sơ đã bị từ chối nhưng chưa dọn được tài khoản chờ duyệt. Vui lòng thử lại.';
  if (status === 429) return 'Có quá nhiều yêu cầu gửi hồ sơ. Thông tin của bạn vẫn được giữ lại; vui lòng thử lại sau.';
  if (status === 401 || status === 403) return 'Phiên đăng nhập không có quyền xử lý hồ sơ này. Vui lòng đăng nhập lại bằng tài khoản admin.';
  if (status === 409) return 'Hồ sơ đang được xử lý hoặc tài khoản đã tồn tại. Hãy tải lại trạng thái; không bấm cấp tài khoản nhiều lần.';
  if (status === 404) return 'Chưa tìm thấy hồ sơ hoặc dịch vụ tiếp nhận hồ sơ chưa được triển khai.';
  if (status >= 500) return 'Dịch vụ xử lý hồ sơ chưa sẵn sàng. Vui lòng thử lại sau; không có quyền cấp chứng chỉ nào được tự động kích hoạt.';
  return message || 'Không xử lý được hồ sơ đối tác. Vui lòng kiểm tra thông tin và thử lại.';
}

async function request(
  body: Record<string, unknown>,
  accessToken?: string
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchWithTimeout(ENDPOINT, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Chưa nhận được kết quả do kết nối gián đoạn. Vui lòng kiểm tra mạng; không gửi hoặc cấp tài khoản liên tục.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.ok !== true) {
    throw Object.assign(new Error(failureMessage(response.status, result?.code, result?.error)), {
      status: response.status,
      code: result?.code,
    });
  }
  return result;
}

/** The password is sent only to the Edge Function and stored by Supabase Auth. */
export async function submitPartnerApplication(input: PartnerApplicationInput): Promise<void> {
  const payload: PartnerApplicationInput = {
    name: input.name.trim(),
    org_type: input.org_type,
    tax_code: input.tax_code.trim(),
    contact_person: input.contact_person.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
  if (!payload.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      !['school', 'company'].includes(payload.org_type) || payload.password.length < 10 ||
      !/[A-Za-z]/.test(payload.password) || !/[0-9]/.test(payload.password)) {
    throw new Error('Vui lòng nhập tên đơn vị, loại hình và email liên hệ hợp lệ.');
  }
  // Explicit picking prevents runtime callers from passing owner, role, password or approval flags.
  await request({ action: 'submit', payload });
}

export async function getPartnerApplications(): Promise<PartnerApplication[]> {
  await adminToken();
  const { data, error } = await supabase.from('partner_applications')
    .select('*').order('created_at', { ascending: false });
  if (error) throw new Error('Không tải được hàng chờ đăng ký đối tác. Vui lòng thử lại hoặc kiểm tra triển khai database.');
  return data ?? [];
}

export async function getPartnerApplication(id: string): Promise<PartnerApplication | null> {
  if (!UUID.test(id)) throw new Error('Mã hồ sơ đối tác không hợp lệ.');
  await adminToken();
  const { data, error } = await supabase.from('partner_applications')
    .select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('Không tải được hồ sơ đối tác.');
  return data;
}

export async function provisionPartnerApplication(id: string): Promise<ProvisionedPartnerAccount> {
  if (!UUID.test(id)) throw new Error('Mã hồ sơ đối tác không hợp lệ.');
  const result = await request({ action: 'provision', applicationId: id }, await adminToken());
  const account = result.account as ProvisionedPartnerAccount | undefined;
  if (!account?.userId || !account.organizationId || !account.email) {
    throw new Error('Chưa nhận đủ kết quả cấp tài khoản. Hãy tải lại hồ sơ trước khi thực hiện tiếp.');
  }
  // Never log credentials, cache them, or automatically copy them to the clipboard.
  return account;
}

export async function rejectPartnerApplication(id: string, reason: string): Promise<void> {
  if (!UUID.test(id) || !reason.trim()) throw new Error('Vui lòng nhập lý do từ chối hồ sơ.');
  await request({ action: 'reject', applicationId: id, reason: reason.trim() }, await adminToken());
}

/** One-time, unauthenticated: the partner chooses their own password from the setup link. */
export async function completePartnerSetup(token: string, password: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error('Link đặt mật khẩu không hợp lệ. Hãy mở lại đúng đường dẫn Admin đã gửi.');
  }
  const result = await request({ action: 'complete_setup', token: token.toLowerCase(), password });
  return typeof result.email === 'string' ? result.email : '';
}
