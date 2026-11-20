/**
 * Dữ liệu demo offline — lấy nguyên nội dung từ thiết kế
 * design/Skillpass.html (sinh viên) và design/hihi_fixed.html (doanh nghiệp).
 * Bản thật sẽ đọc từ Supabase; file này chỉ để chạy demo không cần backend.
 */

/* ---------- Sinh viên ---------- */

export const student = {
  name: 'Nguyễn Minh Anh',
  mssv: '22520001',
  school: 'Trường ĐH Demo',
  email: 'minhanh@gmail.com',
  initials: 'MA',
  shareCode: 'SP-8F3A21',
};

/** Trạng thái theo ERD badge_requests.status */
export type CertStatus = 'issued' | 'approved' | 'under_review' | 'submitted' | 'rejected';

export interface EvidenceFile {
  id?: string;
  name: string;
  url: string;
  type?: string;
  size?: number;
}

export interface Cert {
  /** id dùng cho route cert/[id] */
  id: string;
  title: string;
  orgType: 'school' | 'company';
  org: string;
  issueDate?: string;
  submittedAt?: string;
  status: CertStatus;
  /** Trường cấp sẵn, tự đồng bộ vào ví */
  autoSync?: boolean;
  reviewedAt?: string;
  reviewer?: string;
  expected?: string;
  txHash?: string;
  rejectionReason?: string;
  fixGuide?: string;
  rejectionAt?: string;
  evidenceName?: string;
  evidenceUrl?: string;
  evidenceFiles?: EvidenceFile[];
}

export const certs: Cert[] = [
  {
    id: 'bang',
    title: 'Bằng Kỹ sư Công nghệ thông tin',
    orgType: 'school',
    org: 'Trường ĐH Demo',
    issueDate: '12/06/2026',
    status: 'issued',
    autoSync: true,
    reviewedAt: '12/06/2026 (duyệt sẵn)',
    reviewer: 'Phòng Đào tạo (ký số)',
  },
  {
    id: 'cdr',
    title: 'Chuẩn đầu ra ngoại ngữ',
    orgType: 'school',
    org: 'Trường ĐH Demo',
    issueDate: '12/06/2026',
    status: 'issued',
    autoSync: true,
    reviewedAt: '12/06/2026 (duyệt sẵn)',
    reviewer: 'Phòng Đào tạo (ký số)',
  },
  {
    id: 'ielts',
    title: 'IELTS Academic 7.0',
    orgType: 'company',
    org: 'British Council',
    issueDate: '15/10/2026',
    submittedAt: '04/11/2026',
    status: 'under_review',
    reviewer: 'Phòng Công tác sinh viên (đang rà soát)',
    expected: 'Trong 1–3 ngày',
  },
  {
    id: 'mos',
    title: 'Chứng chỉ Tin học MOS',
    orgType: 'company',
    org: 'Trung tâm Tin học Mẫu',
    issueDate: '30/10/2026',
    submittedAt: '06/11/2026',
    status: 'under_review',
    reviewer: 'Phòng Đào tạo (đang rà soát)',
    expected: 'Trong 1–3 ngày',
  },
  {
    id: 'aws',
    title: 'AWS Cloud Practitioner',
    orgType: 'company',
    org: 'Amazon Web Services',
    issueDate: '02/11/2026',
    submittedAt: '04/11/2026',
    status: 'approved',
    reviewedAt: '06/11/2026, 08:30',
    reviewer: 'Phòng Công tác sinh viên',
    txHash: '0x7f3a…c21e',
  },
  {
    id: 'mx',
    title: 'Chứng nhận Mùa hè xanh',
    orgType: 'school',
    org: 'Đoàn Thanh niên Trường ĐH Demo',
    issueDate: '20/08/2026',
    submittedAt: '03/11/2026',
    status: 'rejected',
    rejectionAt: '05/11/2026, 16:10',
    reviewer: 'Phòng Công tác sinh viên',
    rejectionReason: 'Ảnh minh chứng bị mờ, không đọc được ngày cấp và con dấu.',
    fixGuide: 'chụp lại ảnh đủ sáng, rõ chữ ở cả bốn góc rồi gửi lại.',
  },
];

export interface SharedLink {
  company: string;
  code: string;
  sharedAt: string;
  note: string;
  status: 'active' | 'revoked' | 'expired';
  revokedAt?: string;
  /**
   * Quyền truy cập: public = bất kỳ ai có link/QR; restricted = chỉ email được chỉ định.
   * Feedback #2: người dùng có thể lựa chọn phạm vi chia sẻ.
   */
  accessMode?: 'public' | 'restricted';
  /** Danh sách email được phép xem khi accessMode = 'restricted'. */
  allowedEmails?: string[];
}

export const sharedLinks: SharedLink[] = [
  {
    company: 'Công ty ABC',
    code: 'SP-8F3A21',
    sharedAt: '05/11/2026',
    note: 'HR đã xem 2 lần',
    status: 'active',
    accessMode: 'public',
    allowedEmails: [],
  },
  {
    company: 'Công ty XYZ',
    code: 'SP-3C71D9',
    sharedAt: '01/11/2026',
    note: 'Bạn đã thu hồi ngày 03/11/2026',
    status: 'revoked',
    revokedAt: '03/11/2026',
    accessMode: 'restricted',
    allowedEmails: ['recruiter@xyz.vn', 'hr-dept@xyz.vn'],
  },
  {
    company: 'Startup Delta',
    code: 'SP-91B0E4',
    sharedAt: '10/10/2026',
    note: 'Đã quá thời hạn xem',
    status: 'expired',
    accessMode: 'restricted',
    allowedEmails: ['talent@delta.io'],
  },
];

export const schools = [
  'Trường ĐH Á Châu Mẫu',
  'Trường ĐH Bình Minh Mẫu',
  'Trường ĐH Công nghệ Mẫu',
  'Trường ĐH Demo',
  'Trường ĐH Đại Việt Mẫu',
  'Trường ĐH Giao thông Mẫu',
  'Trường ĐH Hoa Sen Mẫu',
  'Trường ĐH Kinh tế Mẫu',
  'Trường ĐH Nam Sơn Mẫu',
  'Trường ĐH Sư phạm Mẫu',
  'Trường ĐH Y Dược Mẫu',
  'Trường CĐ Du lịch Mẫu',
  'Trường CĐ Kỹ thuật Mẫu',
  'Trường CĐ Nghề Mẫu',
];

export const companies = [
  'Công ty Mẫu A',
  'Tập đoàn Mẫu B',
  'Công ty Công nghệ Mẫu C',
  'Trung tâm Anh ngữ Mẫu',
  'Ngân hàng Mẫu D',
  'Công ty Đào tạo Mẫu E',
];

export const rejectReasons = [
  'Ảnh minh chứng bị mờ, không đọc được ngày cấp',
  'Sai tên đợt thực tập hoặc mã số nhân sự',
  'Chưa hoàn thành đủ số giờ thực tập quy định',
  'Khác (nhập chi tiết bên dưới)',
];

/* ---------- Doanh nghiệp ---------- */

export const bizCompany = {
  name: 'Công ty Công nghệ Mẫu C',
  mst: '0312345678',
  email: 'hr@congtymaauc.vn',
  admin: 'Lê Hoàng Nam',
  initials: 'MC',
};

export const bizStats = { verified: 28, issued: 14, pending: 1 };

export interface BizRequest {
  id: string;
  /** UUID raw từ Supabase để map chính xác với notification.certificate_id */
  certificateId?: string;
  title: string;
  student: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  rejectedAt?: string;
  fixGuide?: string;
  icon: 'award' | 'ok';
  mssv?: string;
  school?: string;
  org?: string;
  timeRange?: string;
  evidence?: string;
  evidenceUrl?: string;
  evidenceFiles?: EvidenceFile[];
  /** id Supabase của sinh viên gửi yêu cầu */
  studentId?: string;
}

export const bizRequests: BizRequest[] = [
  {
    id: 'r1',
    title: 'Thực tập sinh Front-end',
    student: 'Nguyễn Minh Anh',
    date: '08/11/2026',
    status: 'pending',
    icon: 'award',
    mssv: '22520001',
    school: 'Trường ĐH Demo',
    org: 'Công ty Công nghệ Mẫu C',
    timeRange: '06/2026 – 09/2026',
    evidence: 'Giay_xac_nhan_thuc_tap.pdf',
  },
  {
    id: 'r2',
    title: 'Khóa đào tạo Agile Scrum',
    student: 'Phạm Gia Huy',
    date: '06/11/2026',
    status: 'approved',
    icon: 'ok',
  },
];

export interface RecentCandidate {
  initials: string;
  muted?: boolean;
  name: string;
  sub: string;
  tagTone: 'ok' | 'bad';
  tagLabel: string;
}

export const recentCandidates: RecentCandidate[] = [
  { initials: 'MA', name: 'Nguyễn Minh Anh', sub: 'SP-8F3A21 · 3 chứng nhận', tagTone: 'ok', tagLabel: 'Hợp lệ' },
  { initials: 'QB', muted: true, name: 'Trần Quốc Bảo', sub: 'SP-3C71D9 · 03/11/2026', tagTone: 'bad', tagLabel: 'Thu hồi' },
];

export interface BizNotif {
  id?: string;
  certificateId?: string;
  targetRoute?: string;
  tone: 'ok' | 'bad';
  icon: 'ok' | 'award' | 'x';
  title: string;
  body: string;
  why?: string;
  time: string;
}

export const bizNotifs: BizNotif[] = [
  {
    id: 'bn-1',
    targetRoute: '/biz',
    tone: 'ok',
    icon: 'ok',
    title: 'Đã kiểm chứng hồ sơ SP-8F3A21',
    body: 'Ứng viên: Nguyễn Minh Anh (Trường ĐH Demo) – 3 chứng chỉ hợp lệ.',
    time: 'Hôm nay, 09:30',
  },
  {
    id: 'bn-2',
    certificateId: 'r2',
    targetRoute: '/biz',
    tone: 'ok',
    icon: 'award',
    title: 'Đã ký số chứng nhận đào tạo',
    body: 'Cấp cho sinh viên Phạm Gia Huy trên mạng lưới Avalanche.',
    time: 'Hôm qua, 15:20',
  },
  {
    id: 'bn-3',
    certificateId: 'c3',
    targetRoute: '/biz',
    tone: 'bad',
    icon: 'x',
    title: 'Từ chối minh chứng của Lê Văn Tùng',
    body: 'Ảnh chụp giấy xác nhận thiếu trang có chữ ký giám đốc.',
    why: 'Lý do: Ảnh chụp giấy xác nhận thiếu trang có chữ ký giám đốc.',
    time: '05/11/2026, 11:05',
  },
];

/* ---------- Trạng thái hiển thị (thay class .tag) ---------- */

export function certTag(c: Cert): { tone: 'ok' | 'wait' | 'bad'; label: string } {
  if (c.status === 'issued') return { tone: 'ok', label: 'Đã duyệt sẵn' };
  if (c.status === 'approved') return { tone: 'ok', label: 'Đã duyệt' };
  if (c.status === 'rejected') return { tone: 'bad', label: 'Bị từ chối' };
  return { tone: 'wait', label: 'Chờ duyệt 1–3 ngày' };
}

export function orgTypeLabel(c: Cert): string {
  return c.orgType === 'school' ? 'Trường đại học, cao đẳng' : 'Công ty, doanh nghiệp';
}

/* ---------- Quản trị viên (Admin) — Duyệt Tổ chức / Doanh nghiệp ---------- */

export type PartnerOrgStatus = 'pending' | 'verified' | 'lead' | 'rejected' | 'revoked';

export interface PartnerOrg {
  logoUrl?: string;
  id: string;
  name: string;
  orgType: 'school' | 'company';
  taxCode: string;
  domain: string;
  email: string;
  phone: string;
  contactPerson: string;
  /** Legacy only; business accounts use the shared Admin relayer. */
  walletAddress?: string;
  tier: 'enterprise' | 'academic' | 'community';
  status: PartnerOrgStatus;
  submittedAt: string;
  approvedAt?: string;
  txHash?: string;
  rejectionReason?: string;
  /** Nếu do sinh viên đề xuất từ màn "Trường chưa hợp tác" / "Đơn vị khác" */
  proposedByStudent?: string;
  /** Tài khoản Supabase sở hữu đơn vị (đăng ký qua BizRegister) */
  ownerUserId?: string;
}

export const initialPartnerOrgs: PartnerOrg[] = [
  {
    id: 'org_fpt',
    name: 'Công ty Phần mềm FPT Software',
    orgType: 'company',
    taxCode: '0101248141',
    domain: 'fpt.com',
    email: 'hr-recruitment@fpt.com',
    phone: '02473007300',
    contactPerson: 'Trần Minh Tuấn (Giám đốc Nhân sự)',
    tier: 'enterprise',
    status: 'pending',
    submittedAt: 'Hôm nay, 09:15',
  },
  {
    id: 'org_vng',
    name: 'Công ty Cổ phần VNG',
    orgType: 'company',
    taxCode: '0303490096',
    domain: 'vng.com.vn',
    email: 'campus@vng.com.vn',
    phone: '02839623888',
    contactPerson: 'Nguyễn Thu Hà (Talent Acquisition)',
    tier: 'enterprise',
    status: 'pending',
    submittedAt: 'Hôm qua, 16:40',
  },
  {
    id: 'org_lead_abc',
    name: 'Trường Cao đẳng Kỹ thuật Công nghệ ABC',
    orgType: 'school',
    taxCode: 'Đang cập nhật',
    domain: 'abc.edu.vn',
    email: 'phongdaotao@abc.edu.vn',
    phone: '02838112233',
    contactPerson: 'Cô Nguyễn Thị Lan, Phòng Đào tạo',
    tier: 'academic',
    status: 'lead',
    submittedAt: '08/11/2026',
    proposedByStudent: 'Nguyễn Minh Anh (MSSV 22520001)',
  },
  {
    id: 'org_mauc',
    name: 'Công ty Công nghệ Mẫu C',
    orgType: 'company',
    taxCode: '0312345678',
    domain: 'congtymaauc.vn',
    email: 'hr@congtymaauc.vn',
    phone: '02839102030',
    contactPerson: 'Lê Hoàng Nam',
    tier: 'enterprise',
    status: 'verified',
    submittedAt: '01/10/2026',
    approvedAt: '02/10/2026, 10:00',
    txHash: '0x9b2e4f1a8c...d301',
  },
  {
    id: 'org_dhdemo',
    name: 'Trường ĐH Demo',
    orgType: 'school',
    taxCode: '0309876543',
    domain: 'dhdemo.edu.vn',
    email: 'daotao@dhdemo.edu.vn',
    phone: '02837244555',
    contactPerson: 'PGS.TS Phạm Văn Khoa (Phòng Đào tạo)',
    tier: 'academic',
    status: 'verified',
    submittedAt: '15/09/2026',
    approvedAt: '16/09/2026, 14:20',
    txHash: '0x5a1c7d8e2b...f412',
  },
];

export interface AdminLog {
  id: string;
  tone: 'ok' | 'bad';
  icon: 'ok' | 'award' | 'x' | 'bell';
  title: string;
  body: string;
  time: string;
  txHash?: string;
}

export const initialAdminLogs: AdminLog[] = [
  {
    id: 'alog_1',
    tone: 'ok',
    icon: 'ok',
    title: 'Đã cấp quyền dùng gas AVAX cho Công ty Công nghệ Mẫu C',
    body: 'Đã xác minh MST 0312345678 & tên miền @congtymaauc.vn. Cho phép dùng gas AVAX từ Relayer Admin.',
    time: '02/10/2026, 10:00',
  },
  {
    id: 'alog_2',
    tone: 'ok',
    icon: 'award',
    title: 'Đã cấp quyền dùng gas AVAX cho Trường ĐH Demo',
    body: 'Đã xác minh tên miền @dhdemo.edu.vn. Cho phép đồng bộ văn bằng tự động.',
    time: '16/09/2026, 14:20',
  },
  {
    id: 'alog_3',
    tone: 'bad',
    icon: 'x',
    title: 'Từ chối hồ sơ Trung tâm Đào tạo X',
    body: 'Lý do: Sử dụng email cá nhân (@gmail.com), không trùng khớp tên miền doanh nghiệp và thiếu mã số thuế.',
    time: '04/11/2026, 11:15',
  },
];
