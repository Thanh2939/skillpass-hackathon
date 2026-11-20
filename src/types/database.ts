export type UserRole = 'student' | 'business' | 'admin';
export type OrgType = 'school' | 'company' | 'other';
export type VerificationTier = 'community' | 'academic' | 'enterprise';
export type KycStatus = 'pending' | 'verified' | 'lead' | 'rejected' | 'revoked';
export type MemberRole = 'owner' | 'reviewer' | 'viewer';
export type MemberStatus = 'invited' | 'active' | 'revoked';
export type CertificateStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'issued';
export type SharedLinkStatus = 'active' | 'revoked' | 'expired';
/** Quyền truy cập của link: public = ai có link/QR; restricted = allowlist email đã đăng nhập. */
export type SharedAccessMode = 'public' | 'restricted';
/**
 * Kết quả tra cứu hồ sơ/chứng chỉ qua link chia sẻ (fail-closed).
 * SharedAccessStatus là alias chính thức thống nhất với Tech Lead.
 */
export type SharedAccessStatus = 'ok' | 'not_found' | 'revoked' | 'expired' | 'login_required' | 'denied';
export type SharedLookupStatus = SharedAccessStatus;
export type NotificationTone = 'ok' | 'bad' | 'info';
export type NotificationIcon = 'ok' | 'award' | 'x' | 'bell';
export type AdminActionType = 'register_org' | 'propose_lead' | 'approve_org' | 'reject_org' | 'revoke_org' | 'update_setting';

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  mssv?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  wallet_address?: string | null;
  share_code?: string | null;
  push_enabled: boolean;
  school_name?: string | null;
  school_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  domain?: string | null;
  phone?: string | null;
  tax_code?: string | null;
  org_type: OrgType;
  verification_tier: VerificationTier;
  kyc_status: KycStatus;
  wallet_address?: string | null;
  logo_url?: string | null;
  contact_email?: string | null;
  contact_person?: string | null;
  owner_user_id?: string | null;
  proposed_by_student_id?: string | null;
  proposed_by_label?: string | null;
  reviewed_by_admin_id?: string | null;
  approved_at?: string | null;
  whitelist_tx_hash?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AdminAuditLogRow {
  id: string;
  admin_id?: string | null;
  org_id?: string | null;
  action: AdminActionType;
  tone: NotificationTone;
  icon: NotificationIcon;
  title: string;
  body: string;
  tx_hash?: string | null;
  created_at: string;
}

export interface SystemSettingRow {
  key: string;
  auto_domain_kyc: boolean;
  gasless_relayer: boolean;
  contract_address: string;
  chain_id: number;
  updated_by?: string | null;
  updated_at: string;
}

export interface OrganizationMemberRow {
  id: string;
  org_id: string;
  user_id: string;
  member_role: MemberRole;
  status: MemberStatus;
  joined_at: string;
}

export interface CertificateRow {
  id: string;
  slug_id?: string | null;
  student_id: string;
  org_id: string;
  reviewer_id?: string | null;
  title: string;
  org_name?: string | null;
  org_type?: 'school' | 'company' | null;
  org_type_label?: string | null;
  student_name?: string | null;
  student_mssv?: string | null;
  student_school?: string | null;
  reviewer_label?: string | null;
  tx_hash?: string | null;
  evidence_name?: string | null;
  evidence_url?: string | null;
  evidence_documents?: EvidenceDocumentRow[];
  issue_date_original?: string | null;
  auto_sync: boolean;
  time_range?: string | null;
  status: CertificateStatus;
  rejection_reason?: string | null;
  fix_guide?: string | null;
  expected_result?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  rejected_at?: string | null;
}

export interface EvidenceDocumentRow {
  id: string;
  certificate_id: string;
  file_name: string;
  storage_path?: string | null;
  ipfs_cid?: string | null;
  sha256_hash: string;
  mime_type?: string | null;
  file_size?: number | null;
  created_at: string;
  /**
   * URL tạm thời (signed) do service tạo khi bucket minh chứng đã chuyển private.
   * UI nên ưu tiên signed_url, fallback storage_path khi null.
   */
  signed_url?: string | null;
}

export interface BadgeRow {
  id: string;
  certificate_id: string;
  student_id: string;
  org_id: string;
  token_id: string;
  contract_address: string;
  chain_id: number;
  tx_hash: string;
  metadata_uri: string;
  proof_hash: string;
  tier: VerificationTier;
  is_revoked: boolean;
  revocation_reason?: string | null;
  issued_at: string;
  revoked_at?: string | null;
}

export interface SharedLinkRow {
  id: string;
  user_id: string;
  code: string;
  target_company?: string | null;
  status: SharedLinkStatus;
  note?: string | null;
  view_count: number;
  shared_at: string;
  revoked_at?: string | null;
  expires_at?: string | null;
  /** public = ai có link/QR; restricted = chỉ email trong allowed_emails đã đăng nhập. */
  access_mode: SharedAccessMode;
  /** Danh sách email được phép xem (chữ thường). Rỗng khi public. */
  allowed_emails: string[];
}

/* ------------------------------------------------------------
   Hợp đồng dữ liệu RPC xác minh link chia sẻ
   Tương thích 100% với đề xuất của Tech Lead để tích hợp AppContext / VerifyResult / CertDetail.
   ------------------------------------------------------------ */

/** Thông tin link đi kèm trong kết quả getSharedProfile */
export interface SharedLinkMeta {
  target_company?: string | null;
  access_mode: SharedAccessMode;
}

/** Profile tối thiểu trả về cho người xem link (chỉ trường công khai). */
export interface SharedProfileRow {
  id?: string;
  full_name: string;
  mssv: string | null;
  school_name: string | null;
  avatar_url: string | null;
  share_code?: string | null;
  wallet_address: string | null;
  /** null ở chế độ restricted để giảm lộ dữ liệu. */
  email: string | null;
}

/** Chứng chỉ đã duyệt hiển thị trong danh sách xác minh. */
export interface SharedCertificateSummaryRow {
  id: string;
  slug_id: string | null;
  title: string;
  org_name: string | null;
  org_type: 'school' | 'company' | null;
  org_type_label: string | null;
  issue_date_original: string | null;
  time_range: string | null;
  status: CertificateStatus;
  tx_hash: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
}

export interface SharedProfileResult {
  status: SharedAccessStatus;
  access_mode?: SharedAccessMode;
  link?: SharedLinkMeta;
  profile?: SharedProfileRow;
  /**
   * CertificateRow[] đầy đủ (hoặc summary) để Lead map thẳng vào AppContext / VerifyResult
   */
  certificates?: CertificateRow[];
  message?: string;
}

/** Chi tiết minh chứng trả qua RPC (có signed_url / storage_path đã ký). */
export interface SharedEvidenceRow {
  id: string;
  file_name: string;
  storage_path: string | null;
  ipfs_cid: string | null;
  sha256_hash: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  signed_url?: string | null;
}

export interface SharedCertificateDetailRow extends SharedCertificateSummaryRow {
  student_id?: string;
  org_id?: string;
  student_name?: string | null;
  student_mssv?: string | null;
  student_school?: string | null;
  reviewer_label?: string | null;
  expected_result: string | null;
  evidence_url: string | null;
  evidence_name: string | null;
  evidence_documents: EvidenceDocumentRow[];
}

export interface SharedCertificateResult {
  status: SharedAccessStatus;
  access_mode?: SharedAccessMode;
  /**
   * Trả về CertificateRow hoàn chỉnh để màn /shared-cert/[id]?code=
   * tái sử dụng trực tiếp layout CertDetailScreen của Lead mà không cần chuyển đổi.
   */
  certificate?: CertificateRow;
  message?: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  role_target?: 'student' | 'business' | null;
  certificate_id?: string | null;
  tone: NotificationTone;
  icon: NotificationIcon;
  title: string;
  body: string;
  reason?: string | null;
  target_route?: string | null;
  is_read: boolean;
  created_at: string;
}
