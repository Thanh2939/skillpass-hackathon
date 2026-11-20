import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  type Cert,
  type SharedLink,
  type BizRequest,
  type BizNotif,
  type PartnerOrg,
  type AdminLog,
  type EvidenceFile,
} from '../constants/mockData';
import * as supabaseService from '../services/supabase';
import * as pinataService from '../services/pinata';
import * as web3Service from '../services/web3';
import { portalError, type AuthPortal } from '../utils/authPortal';

export interface StudentProfile {
  name: string;
  mssv: string;
  school: string;
  email: string;
  initials: string;
  shareCode: string;
  walletAddress?: string;
}

const emptyStudent: StudentProfile = {
  name: '',
  mssv: '',
  school: '',
  email: '',
  initials: '--',
  shareCode: '',
};

export interface InAppNotif {
  id: string;
  tone: 'ok' | 'bad';
  icon: 'ok' | 'award' | 'x' | 'bell';
  title: string;
  body: string;
  why?: string;
  time: string;
  to: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'student' | 'business' | 'admin';
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  errorCode?: string;
  /** Supabase đang bật "Confirm email": cần mở hộp thư để xác nhận */
  needsConfirm?: boolean;
  role?: AuthUser['role'];
  orgStatus?: PartnerOrg['status'];
}

interface AppState {
  // Tài khoản đăng nhập (Supabase Auth)
  authUser: AuthUser | null;
  authReady: boolean;
  dataReady: boolean;
   signIn: (email: string, password: string, portal?: AuthPortal) => Promise<AuthResult>;
  signUp: (payload: {
    email: string;
    password: string;
    fullName: string;
    role: 'student' | 'business';
    mssv?: string;
    schoolName?: string;
  }) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  student: StudentProfile;
  setStudent: React.Dispatch<React.SetStateAction<StudentProfile>>;
  avatarUri: string | null;
  setAvatarUri: (uri: string) => Promise<void>;
  saveOrganizationAvatar: (orgId: string, uri: string) => Promise<void>;
  certs: Cert[];
  bizRequests: BizRequest[];
  sharedLinks: SharedLink[];
  notifications: InAppNotif[];
  bizNotifs: BizNotif[];
  approved: boolean;
  setApproved: (v: boolean) => void;
  // Quản trị viên (Admin) & Đối tác
  partnerOrgs: PartnerOrg[];
  adminLogs: AdminLog[];
  currentBizOrgId: string | null;
  setCurrentBizOrgId: (id: string | null) => void;
  // Nghiệp vụ
  verifyStudentSchool: (schoolName: string, files: { name: string; uri: string }[], orgId?: string) => Promise<void>;
  submitCertificate: (payload: {
    title: string;
    orgType: 'school' | 'company';
    org: string;
    orgId?: string;
    issueDate: string;
    fileName?: string;
    fileUri?: string;
    files?: { name: string; uri: string; size?: number; type?: string }[];
  }) => Promise<void>;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string, reason: string, fixGuide?: string) => Promise<void>;
  revokeLink: (code: string) => Promise<void>;
  createSharedLink: (company: string, options?: { accessMode: 'public' | 'restricted'; allowedEmails: string[] }) => Promise<string>;
  registerOrganization: (payload: {
    name: string;
    orgType: 'school' | 'company';
    taxCode: string;
    email: string;
    phone: string;
    contactPerson?: string;
  }) => Promise<PartnerOrg>;
  submitPartnerLead: (payload: {
    name: string;
    orgType: 'school' | 'company';
    email: string;
    phone: string;
    contactPerson?: string;
  }) => Promise<void>;
  approveOrganization: (orgId: string) => Promise<void>;
  rejectOrganization: (orgId: string, reason: string) => Promise<void>;
  revokeOrganization: (orgId: string, reason: string) => Promise<void>;
}

const AppContext = createContext<AppState>({} as AppState);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [student, setStudentState] = useState<StudentProfile>(emptyStudent);
  const [avatarUri, setAvatarUriState] = useState<string | null>(null);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [bizRequests, setBizRequests] = useState<BizRequest[]>([]);
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [notifications, setNotifications] = useState<InAppNotif[]>([]);
  const [bizNotifs, setBizNotifs] = useState<BizNotif[]>([]);
  const [approved, setApproved] = useState(false);
  const [partnerOrgs, setPartnerOrgs] = useState<PartnerOrg[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [currentBizOrgId, setCurrentBizOrgId] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  // Ref để các hàm async luôn đọc được tài khoản / đơn vị hiện tại
  const authRef = useRef<AuthUser | null>(null);
  const passwordSignInPending = useRef(false);
  const bizOrgRef = useRef<string | null>(currentBizOrgId);
  useEffect(() => { authRef.current = authUser; }, [authUser]);
  useEffect(() => { bizOrgRef.current = currentBizOrgId; }, [currentBizOrgId]);

  /** id sinh viên dùng để đọc/ghi Supabase */
  const studentUid = () => (authRef.current?.role === 'student' ? authRef.current.id : '');

  /** Đưa toàn bộ state về trạng thái trống hoàn toàn */
  const resetToEmpty = () => {
    setDataReady(false);
    setStudentState(emptyStudent);
    setAvatarUriState(null);
    setCerts([]);
    setBizRequests([]);
    setSharedLinks([]);
    setNotifications([]);
    setBizNotifs([]);
    setApproved(false);
    setCurrentBizOrgId(null);
    bizOrgRef.current = null;
    setPartnerOrgs([]);
    setAdminLogs([]);
  };

  /** Xóa dữ liệu cũ để tài khoản thật bắt đầu từ hồ sơ trống của chính mình */
  const clearForRealAccount = () => {
    setDataReady(false);
    setStudentState(emptyStudent);
    setCerts([]);
    setBizRequests([]);
    setSharedLinks([]);
    setNotifications([]);
    setBizNotifs([]);
    setApproved(false);
    setAvatarUriState(null);
  };

  /** Nạp vai trò + đơn vị của tài khoản từ Supabase */
  const resolveAccount = async (id: string, email: string, portal?: AuthPortal) => {
    const profile = await supabaseService.getUserProfile(id);
    if (!profile) throw new Error('Không tải được quyền tài khoản. Vui lòng đăng nhập lại.');
    const role = profile.role as AuthUser['role'];
    const deniedPortal = portalError(role, portal);
    if (deniedPortal) throw new Error(deniedPortal);
    let orgStatus: PartnerOrg['status'] | undefined;
    if (role === 'business') {
      const org = await supabaseService.getOrganizationForUser(id, email);
      if (org) {
        setCurrentBizOrgId(org.id);
        bizOrgRef.current = org.id;
        orgStatus = org.kyc_status as PartnerOrg['status'];
      } else {
        setCurrentBizOrgId(null);
        bizOrgRef.current = null;
      }
    } else if (role === 'student' && profile) {
      const fullName = profile.full_name || email.split('@')[0];
      const words = fullName.trim().split(/\s+/);
      const initials =
        words.length >= 2
          ? `${words[words.length - 2][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase()
          : fullName.slice(0, 2).toUpperCase();
      let shareCode = profile.share_code;
      if (!shareCode) {
        shareCode = `SP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        supabaseService.updateUserProfile(id, { share_code: shareCode }).catch(() => {});
      }
      setStudentState({
        name: fullName,
        mssv: profile.mssv || '',
        school: profile.school_name || '',
        email: profile.email || email,
        initials,
        shareCode,
        walletAddress: profile.wallet_address ?? undefined,
      });
      setAvatarUriState(profile.avatar_url || null);
    }
    const user: AuthUser = { id, email, role };
    authRef.current = user;
    setAuthUser(user);
    return { role, orgStatus };
  };

  // Khôi phục phiên đăng nhập (web lưu trong localStorage) & lắng nghe thay đổi
  useEffect(() => {
    let active = true;
    supabaseService.supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const u = data.session?.user;
        if (u && active) {
          clearForRealAccount();
          await resolveAccount(u.id, u.email ?? '');
        }
      })
      .catch(() => {})
      .finally(() => active && setAuthReady(true));

    const { data: sub } = supabaseService.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        authRef.current = null;
        setAuthUser(null);
        resetToEmpty();
      } else if (event === 'SIGNED_IN' && !passwordSignInPending.current && session?.user && authRef.current?.id !== session.user.id) {
        clearForRealAccount();
        resolveAccount(session.user.id, session.user.email ?? '').catch(() => {});
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const authenticate = async (email: string, password: string, portal: AuthPortal = 'student'): Promise<AuthResult> => {
    const { data, error } = await supabaseService.supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      const msg = error?.message ?? '';
      if (/confirm/i.test(msg)) {
        return { ok: false, needsConfirm: true, error: 'Email chưa được xác nhận. Vui lòng mở hộp thư và bấm vào link xác nhận.' };
      }
      if (/invalid/i.test(msg)) {
        return { ok: false, error: 'Sai email hoặc mật khẩu.' };
      }
      return { ok: false, error: msg || 'Không đăng nhập được, vui lòng thử lại.' };
    }
    clearForRealAccount();
    try {
      const { role, orgStatus } = await resolveAccount(data.user.id, data.user.email ?? email, portal);
      return { ok: true, role, orgStatus };
    } catch (error) {
      await signOut();
      return { ok: false, error: error instanceof Error ? error.message : 'Không xác định được loại tài khoản.' };
    }
  };

  const signIn: AppState['signIn'] = async (email, password, portal) => {
    if (passwordSignInPending.current) return { ok: false, error: 'Đang xử lý đăng nhập.' };
    passwordSignInPending.current = true;
    try {
      return await authenticate(email, password, portal);
    } catch {
      return { ok: false, error: 'Không hoàn tất được đăng nhập. Vui lòng thử lại.' };
    } finally {
      passwordSignInPending.current = false;
    }
  };

  const signUp: AppState['signUp'] = async (payload) => {
    if (payload.password.length < 6) {
      return { ok: false, error: 'Mật khẩu cần tối thiểu 6 ký tự.' };
    }
    if (passwordSignInPending.current) return { ok: false, error: 'Đang xử lý xác thực. Vui lòng chờ.' };
    passwordSignInPending.current = true;
    try {
      const res = await supabaseService.signUpWithEmail({
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        fullName: payload.fullName,
        role: payload.role,
        mssv: payload.mssv,
        schoolName: payload.schoolName,
      });
      if (res.error || !res.user) {
        return { ok: false, error: res.error ?? 'Không tạo được tài khoản.', errorCode: res.errorCode };
      }
      if (!res.session) {
        return { ok: true, needsConfirm: true, role: payload.role };
      }
      clearForRealAccount();
      const { role } = await resolveAccount(res.user.id, res.user.email ?? payload.email);
      return { ok: true, role };
    } catch {
      return { ok: false, error: 'Chưa hoàn tất đăng ký. Nếu đã nhận email xác nhận, hãy mở liên kết trong email rồi đăng nhập; không cần đăng ký lại.' };
    } finally {
      passwordSignInPending.current = false;
    }
  };

  const signOut = async () => {
    await supabaseService.signOutUser();
    authRef.current = null;
    setAuthUser(null);
    resetToEmpty();
  };

  // Wrapper cho setStudent để đồng bộ lên Supabase khi thay đổi hồ sơ trên bất kỳ máy nào
  const setStudent: React.Dispatch<React.SetStateAction<StudentProfile>> = (updater) => {
    setStudentState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const uid = studentUid();
      if (uid) {
        supabaseService
          .updateUserProfile(uid, {
            full_name: next.name,
            mssv: next.mssv,
            school_name: next.school,
            share_code: next.shareCode,
            wallet_address: next.walletAddress,
          })
          .catch(() => {});
      }
      return next;
    });
  };

  // Wrapper cho setAvatarUri để đồng bộ avatar lên Supabase
  const setAvatarUri = async (uri: string) => {
    const uid = studentUid();
    if (!uid) throw new Error('Phiên đăng nhập đã hết hạn.');
    const url = await supabaseService.uploadFileToStorage(uri, 'avatars');
    if (!url || !await supabaseService.updateUserProfile(uid, { avatar_url: url })) {
      throw new Error('Không lưu được ảnh.');
    }
    if (studentUid() === uid) setAvatarUriState(await supabaseService.getPrivateStorageUrl(url));
  };

  const saveOrganizationAvatar = async (orgId: string, uri: string) => {
    const user = authRef.current;
    if (user?.role !== 'business') throw new Error('Phiên đăng nhập không hợp lệ.');
    const url = await supabaseService.uploadFileToStorage(uri, 'avatars');
    if (!url || !await supabaseService.updateOrganizationLogo(orgId, user.id, url)) {
      throw new Error('Không lưu được ảnh đơn vị.');
    }
    const displayUrl = await supabaseService.getPrivateStorageUrl(url);
    setPartnerOrgs((previous) => previous.map((org) => org.id === orgId ? { ...org, logoUrl: displayUrl ?? undefined } : org));
  };

  // Khởi tạo & đồng bộ dữ liệu đa thiết bị (Realtime + Polling) từ Supabase
  useEffect(() => {
    if (!authReady) return;
    // Public receivers load only the shared-link RPC, not all application tables.
    if (!authUser) {
      return;
    }
    let isMounted = true;
    let syncInProgress = false;

    async function loadRemoteData() {
      if (!isMounted || syncInProgress || !supabaseService.isSupabaseConfigured) {
        return;
      }
      syncInProgress = true;
      try {
        const me = authRef.current;
        const uid = me?.role === 'student' ? me.id : '';
        const bizOrg = bizOrgRef.current;

        const [
          remoteUser,
          studentCertRows,
          orgCertRows,
          remoteLinks,
          remoteNotifs,
          remoteOrgs,
          remoteLogs,
        ] = await Promise.all([
          uid ? supabaseService.getUserProfile(uid) : Promise.resolve(null),
          uid ? supabaseService.getStudentCertificates(uid) : Promise.resolve([]),
          supabaseService.getAllCertificates(),
          uid ? supabaseService.getSharedLinks(uid) : Promise.resolve([]),
          supabaseService.getAllNotifications(),
          supabaseService.getAllOrganizationsForAdmin(),
          supabaseService.getAdminAuditLogs(),
        ]);

        if (!isMounted) return;
        if (authRef.current?.id !== me?.id) return;

        // 1. Đồng bộ thông tin Sinh viên
        if (remoteUser && uid) {
          const fullName = remoteUser.full_name || remoteUser.email.split('@')[0];
          const words = fullName.trim().split(/\s+/);
          const initials =
            words.length >= 2
              ? `${words[words.length - 2][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase()
              : fullName.slice(0, 2).toUpperCase();
          let shareCode = remoteUser.share_code;
          if (!shareCode) {
            shareCode = `SP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            supabaseService.updateUserProfile(uid, { share_code: shareCode }).catch(() => {});
          }
          setStudentState({
            name: fullName,
            mssv: remoteUser.mssv || '',
            school: remoteUser.school_name || '',
            email: remoteUser.email || '',
            initials,
            shareCode,
            walletAddress: remoteUser.wallet_address ?? undefined,
          });
          setAvatarUriState(remoteUser.avatar_url || null);
        }

        const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('vi-VN') : undefined);
        const fmtTime = (v?: string | null) =>
          v
            ? `${new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}, ${new Date(v).toLocaleDateString('vi-VN')}`
            : 'Vừa xong';

        // 2a. Chứng chỉ của sinh viên
        const mappedCerts: Cert[] = studentCertRows.map((row) => {
          const docList: EvidenceFile[] = (row.evidence_documents || []).map((e: any) => ({
            id: e.id,
            name: e.file_name,
            url: e.storage_path,
            size: e.file_size,
          }));
          if (row.evidence_url && !docList.some((d) => d.url === row.evidence_url)) {
            docList.unshift({
              id: 'primary',
              name: row.evidence_name || 'Minh chứng đính kèm',
              url: row.evidence_url,
            });
          }
          return {
            id: row.slug_id || row.id,
            title: row.title,
            orgType: row.org_type === 'school' ? 'school' : 'company',
            org: row.org_name || (row.org_type === 'school' ? 'Trường đại học' : 'Đơn vị cấp'),
            issueDate: row.issue_date_original ?? undefined,
            submittedAt: fmtDate(row.submitted_at),
            status: (row.status === 'draft' ? 'under_review' : row.status === 'issued' ? 'approved' : row.status) as Cert['status'],
            autoSync: row.auto_sync,
            reviewedAt: fmtDate(row.reviewed_at),
            reviewer: row.reviewer_label || (row.org_type === 'school' ? 'Phòng Đào tạo' : 'Đơn vị cấp'),
            expected: row.expected_result ?? undefined,
            txHash: row.tx_hash ?? undefined,
            rejectionReason: row.rejection_reason ?? undefined,
            fixGuide: row.fix_guide ?? undefined,
            rejectionAt: fmtDate(row.rejected_at),
            evidenceName: row.evidence_name ?? undefined,
            evidenceUrl: row.evidence_url ?? docList[0]?.url,
            evidenceFiles: docList,
          };
        });
        setCerts(mappedCerts);

        // 5. Đồng bộ Tổ chức / Đối tác (Admin & Doanh nghiệp)
        const mappedOrgs: PartnerOrg[] = remoteOrgs.map((row) => ({
          id: row.id,
          name: row.name,
          logoUrl: row.logo_url ?? undefined,
          orgType: row.org_type === 'school' ? 'school' : 'company',
          taxCode: row.tax_code || 'Đang cập nhật',
          domain: row.domain || (row.contact_email?.split('@')[1] ?? 'donvi.vn'),
          email: row.contact_email || `info@${row.domain ?? 'donvi.vn'}`,
          phone: row.phone || 'Đang cập nhật',
          contactPerson: row.contact_person || 'Ban Quản trị / Đào tạo',
          tier: row.verification_tier,
          status:
            row.kyc_status === 'pending' && row.proposed_by_label
              ? 'lead'
              : (row.kyc_status as PartnerOrg['status']),
          submittedAt: row.created_at
            ? new Date(row.created_at).toLocaleDateString('vi-VN')
            : 'Hôm nay',
          approvedAt: row.approved_at
            ? new Date(row.approved_at).toLocaleDateString('vi-VN')
            : undefined,
          rejectionReason: row.rejection_reason ?? undefined,
          proposedByStudent: row.proposed_by_label ?? undefined,
          ownerUserId: row.owner_user_id ?? undefined,
        }));
        setPartnerOrgs(mappedOrgs);

        const activeOrgObj =
          mappedOrgs.find((o) => o.id === bizOrg) ||
          (me?.role === 'business'
            ? mappedOrgs.find(
                (o) =>
                  o.ownerUserId === me.id ||
                  o.email.toLowerCase() === me.email.toLowerCase()
              )
            : undefined);

        if (activeOrgObj && activeOrgObj.id !== bizOrgRef.current) {
          setCurrentBizOrgId(activeOrgObj.id);
          bizOrgRef.current = activeOrgObj.id;
        }

        // 2b. Yêu cầu duyệt của Doanh nghiệp / Trường học (chỉ các yêu cầu gửi tới đơn vị đang đăng nhập)
        const filteredOrgCertRows = activeOrgObj
          ? orgCertRows.filter(
              (row) =>
                row.org_id === activeOrgObj.id
            )
          : me?.role === 'admin'
            ? orgCertRows
            : [];

        const mappedBizReqs: BizRequest[] = filteredOrgCertRows
          .filter(
            (row) =>
              !row.auto_sync &&
              (row.status === 'under_review' ||
                row.status === 'submitted' ||
                row.status === 'approved' ||
                row.status === 'issued' || row.status === 'rejected')
          )
          .map((row) => {
            const isApproved = row.status === 'approved' || row.status === 'issued';
            const docList: EvidenceFile[] = (row.evidence_documents || []).map((e: any) => ({
              id: e.id,
              name: e.file_name,
              url: e.storage_path,
              size: e.file_size,
            }));
            if (row.evidence_url && !docList.some((d) => d.url === row.evidence_url)) {
              docList.unshift({
                id: 'primary',
                name: row.evidence_name || 'Minh chứng đính kèm',
                url: row.evidence_url,
              });
            }
            const evidenceLabel =
              docList.length > 1
                ? `${docList.length} tài liệu minh chứng`
                : row.evidence_name || docList[0]?.name || 'Minh_chung_dinh_kem.pdf';

            return {
              id: row.slug_id || row.id,
              certificateId: row.id,
              studentId: row.student_id,
              title: row.title,
              student: row.student_name || 'Sinh viên',
              mssv: row.student_mssv || '',
              school: row.student_school || '',
              org: row.org_name || '',
              timeRange: row.time_range || row.issue_date_original || '',
              evidence: evidenceLabel,
              evidenceUrl: row.evidence_url || docList[0]?.url,
              evidenceFiles: docList,
              date: fmtDate(row.submitted_at) ?? 'Hôm nay',
              status: row.status === 'rejected' ? ('rejected' as const) : isApproved ? ('approved' as const) : ('pending' as const),
              rejectionReason: row.rejection_reason ?? undefined,
              rejectedAt: fmtDate(row.rejected_at),
              fixGuide: row.fix_guide ?? undefined,
              icon: isApproved ? ('ok' as const) : ('award' as const),
            };
          });
        setBizRequests(mappedBizReqs);

        // 3. Đồng bộ Link chia sẻ & Mã QR (Shared Links)
        setSharedLinks(
          remoteLinks.map((row) => ({
            company: row.target_company || 'Nhà tuyển dụng đối tác',
            code: row.code,
            sharedAt: fmtDate(row.shared_at) ?? 'Hôm nay',
            note: row.note || 'Chưa có lượt xem',
             status: row.status,
             accessMode: row.access_mode || 'public',
             allowedEmails: row.allowed_emails || [],
            revokedAt: fmtDate(row.revoked_at),
          }))
        );

        // 4. Đồng bộ Thông báo (Sinh viên & Doanh nghiệp)
        const studentNotifRows = uid
          ? remoteNotifs.filter((n) => n.role_target !== 'business' && n.user_id === uid)
          : [];
        const bizNotifRows = activeOrgObj
          ? remoteNotifs.filter(
              (n) =>
                n.role_target === 'business' &&
                (!n.user_id ||
                  n.user_id === activeOrgObj.ownerUserId ||
                  n.body.toLowerCase().includes(activeOrgObj.name.toLowerCase()))
            )
          : [];

        setNotifications(
          studentNotifRows.map((n) => ({
            id: n.id,
            tone: n.tone === 'bad' ? 'bad' : 'ok',
            icon: n.icon,
            title: n.title,
            body: n.body,
            why: n.reason ?? undefined,
            time: fmtTime(n.created_at),
            to: n.target_route || '/home',
          }))
        );

        setBizNotifs(
         bizNotifRows.map((n) => ({
           id: n.id,
           certificateId: n.certificate_id ?? undefined,
           targetRoute: n.target_route ?? undefined,
           tone: n.tone === 'bad' ? 'bad' : 'ok',
            icon: n.icon === 'bell' ? 'award' : n.icon,
            title: n.title,
            body: n.body,
            why: n.reason ?? undefined,
            time: fmtTime(n.created_at),
          }))
        );

        // 6. Đồng bộ Nhật ký Admin
        const mappedLogs: AdminLog[] = remoteLogs.map((l) => ({
          id: l.id,
          tone: l.tone === 'bad' ? 'bad' : 'ok',
          icon: l.icon,
          title: l.title,
          body: l.body,
          time: l.created_at
            ? new Date(l.created_at).toLocaleDateString('vi-VN')
            : 'Vừa xong',
          txHash: l.tx_hash ?? undefined,
        }));
        setAdminLogs(mappedLogs);
      } catch (err) {
        console.log('Error syncing remote data:', err);
      } finally {
        syncInProgress = false;
        if (isMounted) setDataReady(true);
      }
    }

    loadRemoteData();

    // Lắng nghe thay đổi Realtime từ Supabase trên mọi bảng
    const channel = supabaseService.supabase
      .channel('skillpass-multi-device-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => loadRemoteData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificates' }, () => loadRemoteData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_links' }, () => loadRemoteData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => loadRemoteData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => loadRemoteData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_audit_logs' }, () => loadRemoteData())
      .subscribe();

    // Cơ chế Polling dự phòng mỗi 3 giây (đảm bảo đồng bộ tức thì kể cả khi mạng chặn WebSocket)
    const pollTimer = setInterval(() => {
      loadRemoteData();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
      supabaseService.supabase.removeChannel(channel);
    };
  }, [authReady, authUser, currentBizOrgId]);

  /**
   * Sinh viên gửi thẻ sinh viên để xác nhận trường đang theo học
   */
  const verifyStudentSchool = async (schoolName: string, files: { name: string; uri: string }[], orgId?: string) => {
    const matchedSchool = partnerOrgs.find(
      (o) => o.orgType === 'school' && o.status === 'verified' &&
        (orgId ? o.id === orgId : o.name.trim().toLowerCase() === schoolName.trim().toLowerCase())
    );
    if (!matchedSchool) throw new Error('Vui lòng chọn một trường đã được SkillPass xác minh.');
    if (!files.length) throw new Error('Vui lòng chọn minh chứng sinh viên trước khi gửi.');

    await submitCertificate({
      title: `Xác nhận sinh viên — ${schoolName}`,
      orgType: 'school',
      org: matchedSchool.name,
      orgId: matchedSchool.id,
      issueDate: new Date().toLocaleDateString('vi-VN'),
      files,
    });

    setStudentState((prev) => ({
      ...prev,
      school: matchedSchool.name,
    }));

    const uid = studentUid();
    if (uid) {
      // The certificate is already saved. A profile refresh must not block success.
      void supabaseService.updateUserProfile(uid, {
        school_name: matchedSchool.name,
        school_verified: false,
      }).catch((error) => console.warn('Chưa đồng bộ tên trường trong hồ sơ:', error));
    }
  };

  /**
   * Sinh viên nộp chứng chỉ / đề nghị xét duyệt mới -> Đồng bộ sang máy Doanh nghiệp / Trường ngay lập tức
   */
  const submitCertificate = async (payload: {
    title: string;
    orgType: 'school' | 'company';
    org: string;
    orgId?: string;
    issueDate: string;
    fileName?: string;
    fileUri?: string;
    files?: { name: string; uri: string; size?: number; type?: string }[];
  }) => {
    if (!studentUid()) throw new Error('Vui lòng đăng nhập lại để gửi hồ sơ.');
    const newId = `cert_${Date.now()}`;
    const nowStr = new Date().toLocaleDateString('vi-VN');
    const reviewerLabel =
      payload.orgType === 'school' ? `${payload.org} (đang rà soát)` : `${payload.org} (đang rà soát)`;

    const inputFiles =
      payload.files && payload.files.length > 0
        ? payload.files
        : payload.fileUri
        ? [{ name: payload.fileName || 'minh_chung.jpg', uri: payload.fileUri }]
        : [];

    const localDocList = inputFiles.map((f, idx) => ({
      id: `local_${idx}`,
      name: f.name,
      url: f.uri,
      size: f.size,
    }));

    const newCert: Cert = {
      id: newId,
      title: payload.title,
      orgType: payload.orgType,
      org: payload.org,
      issueDate: payload.issueDate,
      submittedAt: nowStr,
      status: 'under_review',
      reviewer: reviewerLabel,
      expected: 'Trong 1–3 ngày',
      evidenceName: inputFiles.length > 1 ? `${inputFiles.length} tài liệu minh chứng` : inputFiles[0]?.name,
      evidenceUrl: inputFiles[0]?.uri,
      evidenceFiles: localDocList,
    };

    // Cập nhật danh sách chứng chỉ sinh viên

    const matchedOrg = partnerOrgs.find(
      (o) => o.id === payload.orgId || o.name.trim().toLowerCase() === payload.org.trim().toLowerCase()
    );

    // Ghi nhận lên Supabase + Storage để đồng bộ sang các thiết bị khác
    try {
      const uploadedDocs: { name: string; url: string; size?: number }[] = [];

      for (const f of inputFiles) {
        const publicUrl = await supabaseService.uploadFileToStorage(f.uri, 'evidence', f.name);
        if (!publicUrl) throw new Error(`Không tải được tệp ${f.name}.`);
        uploadedDocs.push({ name: f.name, url: publicUrl, size: f.size });
      }

      const primaryUrl = uploadedDocs[0]?.url;
      const primaryName =
        inputFiles.length > 1
          ? `${inputFiles.length} tài liệu minh chứng (${inputFiles.map((f) => f.name).join(', ')})`
          : inputFiles[0]?.name ?? 'minh_chung.pdf';

      const created = await supabaseService.submitCertificate({
        slug_id: newId,
        student_id: studentUid(),
        org_id: payload.orgId || matchedOrg?.id,
        title: payload.title,
        org_name: payload.org,
        org_type: payload.orgType,
        org_type_label: payload.orgType === 'school' ? 'Trường đại học, cao đẳng' : 'Công ty, doanh nghiệp',
        student_name: student.name,
        student_mssv: student.mssv,
        student_school: student.school || (payload.orgType === 'school' ? payload.org : ''),
        reviewer_label: reviewerLabel,
        evidence_name: primaryName,
        evidence_url: primaryUrl ?? undefined,
        issue_date_original: payload.issueDate,
        time_range: payload.issueDate,
      });

      if (!created?.id) throw new Error('Không lưu được hồ sơ.');
      if (uploadedDocs.length > 0) {
        for (const doc of uploadedDocs) {
          const hash = await pinataService.calculateSha256(doc.name + doc.url + Date.now());
          const saved = await supabaseService.addEvidenceDocument({
            certificate_id: created.id,
            file_name: doc.name,
            storage_path: doc.url,
            sha256_hash: hash,
            file_size: doc.size,
          });
          if (!saved) throw new Error(`Không lưu được minh chứng ${doc.name}.`);
        }
      }

      setCerts((prev) => [newCert, ...prev]);
      // Do not leave a successfully submitted certificate spinning on an ancillary notification.
      void supabaseService.createNotification({
        user_id: matchedOrg?.ownerUserId,
        role_target: 'business',
        certificate_id: created?.id,
        tone: 'ok',
        icon: 'award',
        title: `Yêu cầu duyệt mới: ${payload.title}`,
        body: `Sinh viên ${student.name || 'mới'} (${student.mssv || 'Chưa có MSSV'}) vừa gửi ${uploadedDocs.length || 1} tài liệu minh chứng đến ${payload.org}.`,
        target_route: `/biz/review?id=${encodeURIComponent(newId)}`,
      }).catch((error) => console.warn('Chưa gửi được thông báo hồ sơ mới:', error));
    } catch (e) {
      throw e;
    }
  };

  /**
   * Doanh nghiệp / Tổ chức duyệt chứng chỉ & mint Soulbound Token trên Avalanche
   */
  const approveRequest = async (requestId: string) => {
    const req = bizRequests.find((r) => r.id === requestId && r.status === 'pending');
    if (!req || authRef.current?.role !== 'business' || !currentBizOrgId) {
      throw new Error('Không tìm thấy hồ sơ đang chờ duyệt của đơn vị.');
    }
    const targetId = req.id;
    const activeOrg = partnerOrgs.find((o) => o.id === currentBizOrgId);
    const approverName = activeOrg?.name || req?.org || 'Đơn vị cấp';

    // 1. Mint Soulbound Token THẬT trên Avalanche Fuji qua Relayer
    const proofSource = `${req?.title ?? 'cert'}|${req?.mssv ?? ''}|${req?.evidence ?? ''}|${targetId}`;
    const proofHash = await pinataService.calculateSha256(proofSource);
    const mintResult = await web3Service.issueBadgeOnChain({
      certificateId: targetId,
      recipient: req?.studentId || req?.mssv || targetId,
      tier: activeOrg?.orgType === 'school' ? 1 : 2,
      proofHash: proofHash.startsWith('0x') ? proofHash : `0x${proofHash}`,
    });

    setApproved(true);

    // 2. Cập nhật trạng thái yêu cầu doanh nghiệp
    setBizRequests((prev) =>
      prev.map((r) => (r.id === targetId ? { ...r, status: 'approved' as const, icon: 'ok' as const } : r))
    );

    const nowStr = new Date().toLocaleDateString('vi-VN');

    // 3. Cập nhật chứng chỉ của sinh viên sang 'approved'
    setCerts((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              status: 'approved' as const,
              reviewedAt: nowStr,
              reviewer: `${approverName} (Đã ký số)`,
              txHash: mintResult.txHash,
            }
          : c
      )
    );

    // 4. Bắn thông báo về cho sinh viên
    const newNotif: InAppNotif = {
      id: `notif_${Date.now()}`,
      tone: 'ok',
      icon: 'ok',
      title: `${req?.title ?? 'Chứng chỉ'} đã được ${approverName} ký duyệt!`,
      body: `${approverName} đã ký số và ghi nhận Soulbound Token lên Avalanche Fuji.`,
      time: 'Vừa xong',
      to: `/cert/${targetId}`,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    // 5. Thêm vào nhật ký hoạt động của doanh nghiệp
    const newBizNotif: BizNotif = {
      tone: 'ok',
      icon: 'ok',
      title: `Đã ký số chứng nhận cho ${req?.student ?? 'Sinh viên'}`,
      body: `${req?.title ?? 'Chứng chỉ'} · Tx Avalanche: ${mintResult.txHash}`,
      time: 'Vừa xong',
    };
    setBizNotifs((prev) => [newBizNotif, ...prev]);

    // 6. Lưu lên Supabase để đồng bộ tức thì sang máy Sinh viên & HR
    try {
      if (req?.studentId && (activeOrg?.orgType === 'school' || req?.title?.startsWith('Xác nhận sinh viên'))) {
        await supabaseService.updateUserProfile(req.studentId, {
          school_name: approverName,
          school_verified: true,
        });
      }
      await Promise.all([
        supabaseService.createNotification({
          user_id: req?.studentId || studentUid(),
          role_target: 'student',
          tone: 'ok',
          icon: 'ok',
          title: newNotif.title,
          body: newNotif.body,
          target_route: newNotif.to,
        }),
        supabaseService.createNotification({
          user_id: activeOrg?.ownerUserId || authRef.current?.id,
          role_target: 'business',
          tone: 'ok',
          icon: 'ok',
          title: newBizNotif.title,
          body: `${approverName}: ${newBizNotif.body}`,
          target_route: '/biz',
        }),
      ]);
    } catch (e) {
      console.log('Supabase approveRequest sync skipped:', e);
    }
  };

  /**
   * Doanh nghiệp / Tổ chức từ chối yêu cầu
   */
  const rejectRequest = async (requestId: string, reason: string, fixGuide?: string) => {
    const req = bizRequests.find((r) => r.id === requestId && r.status === 'pending');
    if (!req || authRef.current?.role !== 'business' || !currentBizOrgId) {
      throw new Error('Không tìm thấy hồ sơ đang chờ duyệt của đơn vị.');
    }
    const targetId = req.id;
    const nowStr = `${new Date().toLocaleDateString('vi-VN')}, ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

    if (!await supabaseService.rejectCertificate(targetId, reason, fixGuide)) {
      throw new Error('Không lưu được kết quả từ chối.');
    }

    // 1. Cập nhật danh sách doanh nghiệp
    setBizRequests((prev) => prev.map((r) => r.id === targetId ? { ...r, status: 'rejected', rejectionReason: reason, rejectedAt: nowStr, fixGuide } : r));

    // 2. Cập nhật cert sinh viên sang 'rejected'
    setCerts((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              status: 'rejected' as const,
              rejectionAt: nowStr,
              rejectionReason: reason || 'Ảnh minh chứng bị mờ, không đọc được thông tin.',
              fixGuide: fixGuide || 'Chụp lại ảnh đủ sáng, rõ chữ ở cả bốn góc rồi gửi lại.',
            }
          : c
      )
    );

    // 3. Thông báo cho sinh viên
    const newNotif: InAppNotif = {
      id: `notif_${Date.now()}`,
      tone: 'bad',
      icon: 'x',
      title: `Yêu cầu "${req?.title ?? 'chứng nhận'}" bị từ chối`,
      body: reason || 'Minh chứng không hợp lệ.',
      why: `Lý do: ${reason}`,
      time: 'Vừa xong',
      to: `/rejected?id=${encodeURIComponent(targetId)}`,
    };
    setNotifications((prev) => [newNotif, ...prev]);

    // 4. Nhật ký doanh nghiệp
    const newBizNotif: BizNotif = {
      tone: 'bad',
      icon: 'x',
      title: `Từ chối minh chứng của ${req?.student ?? student.name}`,
      body: reason,
      why: `Lý do: ${reason}`,
      time: 'Vừa xong',
    };
    setBizNotifs((prev) => [newBizNotif, ...prev]);

    // 5. Đồng bộ lên Supabase
    try {
      await Promise.all([
        supabaseService.createNotification({
          user_id: req?.studentId || studentUid(),
          role_target: 'student',
          tone: 'bad',
          icon: 'x',
          title: newNotif.title,
          body: newNotif.body,
          reason: newNotif.why,
          target_route: newNotif.to,
        }),
        supabaseService.createNotification({
          role_target: 'business',
          tone: 'bad',
          icon: 'x',
          title: newBizNotif.title,
          body: newBizNotif.body,
          reason: newBizNotif.why,
          target_route: '/biz',
        }),
      ]);
    } catch (e) {
      console.log('Supabase rejectRequest sync skipped:', e);
    }
  };

  /**
   * Sinh viên vô hiệu hóa link / mã QR đã chia sẻ -> Đồng bộ sang máy HR
   */
  const revokeLink = async (code: string) => {
    const uid = studentUid();
    if (!uid || !await supabaseService.revokeSharedLink(code, uid)) {
      throw new Error('Không thể thu hồi liên kết này.');
    }
    setSharedLinks((prev) =>
      prev.map((l) => (l.code === code ? { ...l, status: 'revoked' as const, note: 'Bạn đã thu hồi liên kết này' } : l))
    );
  };

  /**
   * Tạo link chia sẻ mới -> Lưu lên Supabase để máy HR quét được ngay
   */
  const createSharedLink: AppState['createSharedLink'] = async (company, options) => {
    const accessMode = options?.accessMode || 'public';
    const allowedEmails = [...new Set((options?.allowedEmails || []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (accessMode === 'restricted' && (!allowedEmails.length || allowedEmails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
      throw new Error('Vui lòng nhập email người được phép xem.');
    }
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const code = `SP-${randomSuffix}`;
    const newLink: SharedLink = {
      company,
      code,
      sharedAt: new Date().toLocaleDateString('vi-VN'),
      note: 'Chưa có lượt xem',
       status: 'active',
       accessMode,
       allowedEmails: accessMode === 'restricted' ? allowedEmails : [],
    };
    const uid = studentUid();
    if (!uid || !await supabaseService.createSharedLink(uid, company, code, { accessMode, allowedEmails })) {
      throw new Error('Không thể tạo liên kết chia sẻ.');
    }
    setSharedLinks((prev) => [newLink, ...prev]);
    return code;
  };

  /**
   * Doanh nghiệp / Trường học đăng ký tài khoản Đối tác mới -> vào trạng thái 'pending' chờ Admin duyệt
   */
  const registerOrganization = async (payload: {
    name: string;
    orgType: 'school' | 'company';
    taxCode: string;
    email: string;
    phone: string;
    contactPerson?: string;
  }): Promise<PartnerOrg> => {
    const emailParts = payload.email.trim().split('@');
    const domain = emailParts.length > 1 ? emailParts[1].toLowerCase() : 'congty.vn';
    const newOrg: PartnerOrg = {
      id: `org_${Date.now()}`,
      name: payload.name.trim(),
      orgType: payload.orgType,
      taxCode: payload.taxCode.trim() || 'Đang cập nhật',
      domain,
      email: payload.email.trim(),
      phone: payload.phone.trim(),
      contactPerson: payload.contactPerson?.trim() || 'Người đại diện pháp luật',
      tier: payload.orgType === 'school' ? 'academic' : 'enterprise',
      status: 'pending',
      submittedAt: 'Vừa xong',
    };

    if (authRef.current?.role !== 'business') throw new Error('Vui lòng đăng nhập tài khoản đối tác trước khi gửi hồ sơ.');
    const existing = await supabaseService.getOrganizationForUser(authRef.current.id);
    if (existing) { setCurrentBizOrgId(existing.id); return { ...newOrg, id: existing.id }; }
    const created = await supabaseService.registerPartnerOrganization({
      name: newOrg.name, org_type: newOrg.orgType, tax_code: newOrg.taxCode,
      domain: newOrg.domain, contact_email: newOrg.email, phone: newOrg.phone,
      contact_person: newOrg.contactPerson,
      owner_user_id: authRef.current.id,
    });
    if (!created) throw new Error('Tài khoản đã được tạo nhưng hồ sơ chưa lưu được. Kiểm tra tên miền đã đăng ký và bấm gửi lại.');
    newOrg.id = created.id;
    newOrg.ownerUserId = authRef.current.id;
    setPartnerOrgs((prev) => [newOrg, ...prev]);
    setCurrentBizOrgId(created.id);
    bizOrgRef.current = created.id;

    return newOrg;
  };

  /**
   * Sinh viên gửi thông tin Trường / Đơn vị chưa hợp tác để Admin liên hệ
   */
  const submitPartnerLead = async (payload: {
    name: string;
    orgType: 'school' | 'company';
    email: string;
    phone: string;
    contactPerson?: string;
  }) => {
    const emailParts = payload.email.trim().split('@');
    const domain = emailParts.length > 1 ? emailParts[1].toLowerCase() : 'donvi.vn';
    const newLead: PartnerOrg = {
      id: `lead_${Date.now()}`,
      name: payload.name.trim() || 'Đơn vị sinh viên đề xuất',
      orgType: payload.orgType,
      taxCode: 'Đang cập nhật',
      domain,
      email: payload.email.trim() || 'lienhe@donvi.vn',
      phone: payload.phone.trim() || 'Đang cập nhật',
      contactPerson: payload.contactPerson?.trim() || 'Phòng Đào tạo / Nhân sự',
      tier: payload.orgType === 'school' ? 'academic' : 'enterprise',
      status: 'lead',
      submittedAt: 'Vừa xong',
      proposedByStudent: `${student.name} (MSSV ${student.mssv})`,
    };


    const newLog: AdminLog = {
      id: `alog_${Date.now()}`,
      tone: 'ok',
      icon: 'bell',
      title: `Sinh viên đề xuất liên hệ: ${newLead.name}`,
      body: `Người gửi: ${student.name} · Liên hệ: ${newLead.email} (${newLead.phone})`,
      time: 'Vừa xong',
    };

    const saved = await supabaseService.createOtherOrg({
        name: newLead.name,
        contact_email: payload.email.trim() || undefined,
        phone: payload.phone.trim() || undefined,
        contact_person: newLead.contactPerson,
        org_type: newLead.orgType,
        proposed_by_label: newLead.proposedByStudent,
    });
    if (!saved) throw new Error('Không lưu được thông tin đơn vị. Vui lòng thử lại.');
    setPartnerOrgs((prev) => [{ ...newLead, id: saved.id }, ...prev]);
    setAdminLogs((prev) => [newLog, ...prev]);
  };

  /**
   * Admin xác minh đối tác và cấp quyền dùng relayer chung do SkillPass tài trợ AVAX.
   * Đối tác không có ví hoặc private key riêng.
   */
  const approveOrganization = async (orgId: string) => {
    const target = partnerOrgs.find((o) => o.id === orgId);
    if (!target) return;

    if (!await supabaseService.updateOrganizationKycStatus(orgId, 'verified', target.tier)) {
      throw new Error('Chưa lưu được quyền sử dụng gas AVAX cho đối tác.');
    }
    const nowStr = `${new Date().toLocaleDateString('vi-VN')}, ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

    setPartnerOrgs((prev) =>
      prev.map((o) =>
        o.id === orgId
          ? {
              ...o,
              status: 'verified' as const,
              approvedAt: nowStr,
              rejectionReason: undefined,
            }
          : o
      )
    );

    const newLog: AdminLog = {
      id: `alog_${Date.now()}`,
      tone: 'ok',
      icon: 'ok',
      title: `Đã xác minh & cấp gas AVAX: ${target.name}`,
      body: 'Đối tác được dùng relayer chung của SkillPass; Admin chi trả gas AVAX, không cấp ví riêng.',
      time: 'Vừa xong',
    };
    setAdminLogs((prev) => [newLog, ...prev]);

    try {
      await supabaseService.createAdminAuditLog({
        action: 'approve_org',
        org_id: orgId,
        tone: 'ok',
        icon: 'ok',
        title: newLog.title,
        body: newLog.body,
      });
    } catch (e) {
      console.log('Supabase approveOrganization skipped:', e);
    }
  };

  /**
   * Admin từ chối hồ sơ đăng ký của đối tác
   */
  const rejectOrganization = async (orgId: string, reason: string) => {
    const target = partnerOrgs.find((o) => o.id === orgId);
    if (!target) return;

    if (!await supabaseService.updateOrganizationKycStatus(orgId, 'rejected', undefined, {
        rejectionReason: reason,
      })) throw new Error('Chưa lưu được trạng thái đối tác. Vui lòng thử lại.');

    setPartnerOrgs((prev) =>
      prev.map((o) =>
        o.id === orgId
          ? {
              ...o,
              status: 'rejected' as const,
              rejectionReason: reason,
            }
          : o
      )
    );

    const newLog: AdminLog = {
      id: `alog_${Date.now()}`,
      tone: 'bad',
      icon: 'x',
      title: `Từ chối hồ sơ đối tác: ${target.name}`,
      body: `Lý do: ${reason}`,
      time: 'Vừa xong',
    };
    setAdminLogs((prev) => [newLog, ...prev]);

    try {
      await supabaseService.createAdminAuditLog({
        action: 'reject_org',
        tone: 'bad',
        icon: 'x',
        title: newLog.title,
        body: newLog.body,
      });
    } catch (e) {
      console.log('Supabase rejectOrganization skipped:', e);
    }
  };

  /**
   * Admin khóa quyền dùng relayer chung của đối tác.
   */
  const revokeOrganization = async (orgId: string, reason: string) => {
    const target = partnerOrgs.find((o) => o.id === orgId);
    if (!target) return;

    if (!await supabaseService.updateOrganizationKycStatus(orgId, 'revoked', undefined, {
        rejectionReason: reason,
      })) throw new Error('Chưa lưu được trạng thái đối tác. Vui lòng thử lại.');

    setPartnerOrgs((prev) =>
      prev.map((o) =>
        o.id === orgId
          ? {
              ...o,
              status: 'revoked' as const,
              rejectionReason: reason,
            }
          : o
      )
    );

    const newLog: AdminLog = {
      id: `alog_${Date.now()}`,
      tone: 'bad',
      icon: 'x',
      title: `Đã thu hồi quyền dùng gas AVAX: ${target.name}`,
      body: `Tài khoản không còn được gọi relayer chung của SkillPass. Lý do: ${reason}`,
      time: 'Vừa xong',
    };
    setAdminLogs((prev) => [newLog, ...prev]);

    try {
      await supabaseService.createAdminAuditLog({
        action: 'revoke_org',
        org_id: orgId,
        tone: 'bad',
        icon: 'x',
        title: newLog.title,
        body: newLog.body,
      });
    } catch (e) {
      console.log('Supabase revokeOrganization skipped:', e);
    }
  };

  // Actions must capture current state, including the latest registration session.
  const value: AppState = {
      authUser,
      authReady,
      dataReady: authUser ? dataReady : authReady,
      signIn,
      signUp,
      signOut,
      student,
      setStudent,
      avatarUri,
      setAvatarUri,
      saveOrganizationAvatar,
      certs,
      bizRequests,
      sharedLinks,
      notifications,
      bizNotifs,
      approved,
      setApproved,
      partnerOrgs,
      adminLogs,
      currentBizOrgId,
      setCurrentBizOrgId,
      verifyStudentSchool,
      submitCertificate,
      approveRequest,
      rejectRequest,
      revokeLink,
      createSharedLink,
      registerOrganization,
      submitPartnerLead,
      approveOrganization,
      rejectOrganization,
      revokeOrganization,
    };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  return useContext(AppContext);
}
