import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { fonts } from '../theme';
import { Button, Card, KV, LoadingScreen, Note, Screen, ScreenHeader, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';
import {
  getPartnerApplication,
  provisionPartnerApplication,
  rejectPartnerApplication,
} from '../services/partnerApplications';
import type { PartnerApplication, ProvisionedPartnerAccount } from '../types/partnerApplications';

/**
 * Chi tiết hồ sơ đăng ký tài khoản đối tác (/admin/application/[id]).
 *
 * Nguyên tắc bảo mật:
 * - Chỉ Admin đã đăng nhập mới xem được (layout /admin đã chặn, màn này kiểm tra lại).
 * - Duyệt hồ sơ xác minh đơn vị, mở khóa tài khoản và kích hoạt quyền đối tác.
 * - Link đặt mật khẩu một lần chỉ hiện MỘT LẦN trong state React:
 *   không lưu storage, không log; chỉ bị sao chép khi Admin chủ động bấm.
 * - Hồ sơ không tự tạo tài khoản khi mở màn; chỉ tạo khi Admin bấm duyệt.
 */

const STATUS_META: Record<
  PartnerApplication['status'],
  { label: string; noteTitle: string; noteTone: 'ok' | 'bad' | 'info' }
> = {
  pending: {
    label: 'Chờ xác minh',
    noteTitle: 'Hồ sơ đang chờ Admin xác minh',
    noteTone: 'info',
  },
  provisioning: {
    label: 'Đang xác minh',
    noteTitle: 'Hệ thống đang xử lý xác minh',
    noteTone: 'info',
  },
  account_created: {
    label: 'Đã xác minh',
    noteTitle: 'Tài khoản đối tác đã được xác minh',
    noteTone: 'ok',
  },
  rejected: {
    label: 'Đã từ chối',
    noteTitle: 'Hồ sơ đã bị từ chối',
    noteTone: 'bad',
  },
};

const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yandex.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
];

function formatDateTime(value?: string | null): string {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEmailDomain(email: string): string {
  const parts = email.trim().toLowerCase().split('@');
  return parts.length > 1 ? parts[1] : '';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Service gắn status/code vào Error khi backend trả 409 (đã xử lý ở phiên khác). */
function isConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  if (candidate.status === 409 || candidate.code === 409 || candidate.code === '409') return true;
  if (typeof candidate.code === 'string' && /conflict/i.test(candidate.code)) return true;
  return typeof candidate.message === 'string' && /(^|\D)409(\D|$)|conflict|đã được xử lý/i.test(candidate.message);
}

export function AdminPartnerApplicationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authUser, authReady } = useApp();

  const [application, setApplication] = useState<PartnerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'provision' | 'reject' | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  /** Chỉ giữ trong state của màn này; cleanup khi rời màn sẽ xóa ngay. */
  const [oneTimeAccount, setOneTimeAccount] = useState<ProvisionedPartnerAccount | null>(null);
  const [copied, setCopied] = useState(false);

  const actionLockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Mật khẩu khởi tạo chỉ tồn tại khi màn còn hiển thị; rời màn là mất, không thể xem lại.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setOneTimeAccount(null);
      };
    }, []),
  );

  const loadApplication = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!id) {
        setLoadError('Mã hồ sơ đối tác không hợp lệ.');
        setLoading(false);
        return;
      }
      if (authUser?.role !== 'admin') return;
      if (mode === 'initial') {
        setLoading(true);
        setLoadError(null);
      } else {
        setRefreshing(true);
      }
      try {
        const result = await getPartnerApplication(id);
        if (!mountedRef.current) return;
        setApplication(result);
        setLoadError(result ? null : 'Không tìm thấy hồ sơ đăng ký tài khoản với mã này.');
      } catch (error) {
        if (!mountedRef.current) return;
        setLoadError(errorMessage(error, 'Không tải được hồ sơ đăng ký tài khoản đối tác.'));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [id, authUser?.role],
  );

  const isAdmin = authUser?.role === 'admin';
  useFocusEffect(
    useCallback(() => {
      if (!isAdmin || !id) return;
      void loadApplication('initial');
    }, [id, isAdmin, loadApplication]),
  );

  const reloadAfterConflict = useCallback(
    async (applicationId: string, clearIfMissing = false) => {
      try {
        const fresh = await getPartnerApplication(applicationId);
        if (!mountedRef.current) return fresh;
        if (fresh) {
          setApplication(fresh);
          setLoadError(null);
        } else if (clearIfMissing) {
          setApplication(null);
          setLoadError('Không tìm thấy hồ sơ đăng ký tài khoản với mã này.');
        }
        return fresh;
      } catch {
        // Giữ nguyên trạng thái cũ và thông báo conflict; Admin có thể bấm Làm mới.
        return null;
      }
    },
    [],
  );

  const handleProvision = async () => {
    if (!application || application.status !== 'pending') return;
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setBusy('provision');
    setActionError(null);
    setCopied(false);
    try {
      const result = await provisionPartnerApplication(application.id);
      if (!mountedRef.current) return;
      // Kết quả chỉ nằm trong state để hiển thị một lần; không lưu/log.
      setOneTimeAccount(result);
      setApplication((previous) =>
        previous && previous.id === application.id
          ? {
              ...previous,
              status: 'account_created',
              organization_id: result.organizationId,
              user_id: result.userId,
              reviewed_at: new Date().toISOString(),
            }
          : previous,
      );
      // Đồng bộ lại hồ sơ để lấy trạng thái/người duyệt chính thức; lỗi mạng không xóa kết quả vừa cấp.
      await reloadAfterConflict(application.id);
    } catch (error) {
      if (!mountedRef.current) return;
      if (isConflictError(error)) {
        setActionError(
          'Hồ sơ đã được xử lý ở một phiên khác. Đang tải lại trạng thái mới nhất; không bấm cấp tài khoản lần nữa.',
        );
        await reloadAfterConflict(application.id, true);
      } else {
        setActionError(errorMessage(error, 'Chưa cấp được tài khoản đối tác. Vui lòng thử lại.'));
      }
    } finally {
      actionLockRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const handleCopySetupLink = async () => {
    const url = oneTimeAccount?.setupUrl;
    if (!url) return;
    try {
      await Clipboard.setStringAsync(url);
      if (mountedRef.current) setCopied(true);
    } catch {
      if (mountedRef.current) setCopied(false);
    }
  };

  const handleReject = async () => {
    if (!application || application.status !== 'pending') return;
    if (actionLockRef.current) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setReasonError('Vui lòng nhập lý do từ chối hồ sơ.');
      return;
    }
    setReasonError(undefined);
    actionLockRef.current = true;
    setBusy('reject');
    setActionError(null);
    try {
      await rejectPartnerApplication(application.id, trimmedReason);
      if (!mountedRef.current) return;
      setApplication((previous) =>
        previous && previous.id === application.id
          ? {
              ...previous,
              status: 'rejected',
              rejection_reason: trimmedReason,
              reviewed_at: new Date().toISOString(),
            }
          : previous,
      );
      setShowRejectForm(false);
      setReason('');
      await reloadAfterConflict(application.id);
    } catch (error) {
      if (!mountedRef.current) return;
      if (isConflictError(error)) {
        setShowRejectForm(false);
        setActionError(
          'Hồ sơ đã thay đổi trạng thái ở một phiên khác. Đang tải lại trạng thái mới nhất; không gửi lại thao tác.',
        );
        await reloadAfterConflict(application.id, true);
      } else {
        setActionError(errorMessage(error, 'Chưa lưu được kết quả từ chối. Vui lòng thử lại.'));
      }
    } finally {
      actionLockRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  if (!authReady) return <LoadingScreen />;
  if (authUser?.role !== 'admin') return <Redirect href="/staff/login" />;

  if (loading && !application) {
    return (
      <Screen biz header={<ScreenHeader biz title="Hồ sơ đăng ký đối tác" back />}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#008d83" />
          <Text style={styles.centerText}>Đang tải hồ sơ đăng ký tài khoản...</Text>
        </View>
      </Screen>
    );
  }

  if (!application) {
    return (
      <Screen
        biz
        header={<ScreenHeader biz title="Hồ sơ đăng ký đối tác" back />}
        footer={
          <>
            <Button
              biz
              title={loading ? 'Đang tải...' : 'Thử lại'}
              disabled={loading}
              onPress={() => {
                void loadApplication('initial');
              }}
            />
            <Button biz variant="ghost" title="Quay lại Quản trị" onPress={() => router.replace('/admin' as any)} />
          </>
        }
      >
        <Note biz tone="bad" title="Không tải được hồ sơ">
          {loadError || 'Không tìm thấy hồ sơ đăng ký tài khoản với mã này.'}
        </Note>
      </Screen>
    );
  }

  const statusMeta = STATUS_META[application.status];
  const emailDomain = getEmailDomain(application.email);
  const isPersonalEmail = PERSONAL_EMAIL_DOMAINS.includes(emailDomain);
  const isPending = application.status === 'pending';
  const organizationId = application.organization_id ?? oneTimeAccount?.organizationId ?? null;
  const isReviewing = isPending || application.status === 'provisioning';

  let footer: React.ReactNode = null;
  if (showRejectForm && isPending) {
    footer = (
      <>
        <Button
          biz
          variant="danger"
          title={busy === 'reject' ? 'Đang từ chối...' : 'Xác nhận từ chối hồ sơ'}
          disabled={Boolean(busy)}
          onPress={handleReject}
        />
        <Button
          biz
          variant="ghost"
          title="Hủy bỏ"
          disabled={Boolean(busy)}
          onPress={() => {
            setShowRejectForm(false);
            setReasonError(undefined);
          }}
        />
      </>
    );
  } else if (isPending) {
    footer = (
      <>
        <Button
          biz
          title={busy === 'provision' ? 'Đang xác minh...' : 'Xác minh & cấp tài khoản'}
          disabled={Boolean(busy)}
          onPress={handleProvision}
        />
        <Button
          biz
          variant="danger"
          title="Từ chối hồ sơ"
          disabled={Boolean(busy)}
          onPress={() => {
            setShowRejectForm(true);
            setActionError(null);
          }}
        />
      </>
    );
  } else if (application.status === 'provisioning') {
    footer = (
      <Button
        biz
        title={refreshing ? 'Đang tải trạng thái...' : 'Làm mới trạng thái'}
        disabled={refreshing}
        onPress={() => {
          void loadApplication('refresh');
        }}
      />
    );
  } else {
    footer = (
      <Button biz variant="ghost" title="Quay lại hàng chờ" onPress={() => router.replace('/admin' as any)} />
    );
  }

  return (
    <Screen
      biz
      header={
        <ScreenHeader
          biz
          title="Hồ sơ đăng ký đối tác"
          back
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Làm mới hồ sơ đăng ký"
              accessibilityState={{ disabled: refreshing }}
              disabled={refreshing}
              onPress={() => {
                void loadApplication('refresh');
              }}
              style={styles.headerRefresh}
            >
              <Text style={styles.headerRefreshText}>{refreshing ? 'Đang tải...' : 'Làm mới'}</Text>
            </Pressable>
          }
        />
      }
      scrollFooter
      footer={footer}
    >
      {actionError ? (
        <Note biz tone="bad" title="Thao tác chưa hoàn tất">
          {actionError}
        </Note>
      ) : null}

      {loadError ? (
        <Note biz tone="bad" title="Không làm mới được hồ sơ">
          {loadError}
        </Note>
      ) : null}

      {oneTimeAccount?.setupUrl ? (
        <View style={styles.oneTimeBox}>
          <Text style={styles.oneTimeTitle}>Link đặt mật khẩu (chỉ hiển thị một lần)</Text>
          <Text style={styles.oneTimeWarning}>
            Gửi link này cho đối tác ngoài hệ thống. Link chỉ dùng được một lần và hết hạn sau 24 giờ. Rời màn hình
            này là không thể xem lại; nếu mất, hãy dùng quy trình cấp lại qua Admin.
          </Text>

          <View style={styles.credentialRow}>
            <Text style={styles.credentialLabel}>Email đăng nhập</Text>
            <Text style={styles.credentialValue}>{oneTimeAccount.email}</Text>
          </View>

          {oneTimeAccount.setupUrl ? (
            <View style={styles.credentialRow}>
              <Text style={styles.credentialLabel}>Link đặt mật khẩu</Text>
              <Text selectable style={styles.setupLink}>{oneTimeAccount.setupUrl}</Text>
              {oneTimeAccount.setupExpiresAt ? (
                <Text style={styles.setupExpiry}>
                  {`Hết hạn: ${new Date(oneTimeAccount.setupExpiresAt).toLocaleString('vi-VN')}`}
                </Text>
              ) : null}
              <Button
                biz
                variant="ghost"
                title={copied ? 'Đã sao chép link' : 'Sao chép link'}
                onPress={handleCopySetupLink}
              />
            </View>
          ) : (
            <Note biz tone="bad" title="Không có link đặt mật khẩu trong kết quả">
              Hệ thống không trả về link cho lần cấp tài khoản này và không thể hiển thị lại. Đối tác có thể dùng
              chức năng quên mật khẩu hoặc liên hệ Admin để cấp lại.
            </Note>
          )}

          <Text style={styles.loginHint}>
            Đường dẫn đăng nhập đối tác: /biz/login. Đối tác mở link, tự đặt mật khẩu rồi đăng nhập.
          </Text>

          <Button
            biz
            variant="ghost"
            title="Tôi đã gửi link cho đối tác"
            onPress={() => {
              setOneTimeAccount(null);
              setCopied(false);
            }}
          />
        </View>
      ) : null}
      {oneTimeAccount && !oneTimeAccount.setupUrl ? (
        <Note biz tone="ok" title="Đã duyệt và mở khóa tài khoản">
          {`Đối tác ${oneTimeAccount.email} có thể đăng nhập bằng mật khẩu đã chọn khi gửi hồ sơ.`}
        </Note>
      ) : null}

      <Note biz tone={statusMeta.noteTone} title={statusMeta.noteTitle}>
        {application.status === 'pending'
          ? application.user_id
            ? 'Tài khoản đã được tạo và khóa đăng nhập. Admin kiểm tra hồ sơ trước khi mở khóa.'
            : 'Hồ sơ cũ đang chờ Admin kiểm tra thông tin liên hệ trước khi cấp tài khoản đăng nhập.'
          : application.status === 'provisioning'
            ? 'Lần xử lý trước có thể bị gián đoạn. Bấm "Làm mới" để đồng bộ trạng thái; không bấm cấp tài khoản lặp lại.'
            : application.status === 'account_created'
              ? `Tài khoản ${application.email} đã được xác minh và có thể đăng nhập cổng đối tác.`
              : application.rejection_reason ||
                'Hồ sơ không đáp ứng yêu cầu xác thực đối tác của SkillPass.'}
      </Note>

      {isReviewing ? (
        <Note biz tone="info" title="Email chưa được xác minh tự động">
          {`Hệ thống chỉ ghi nhận email liên hệ @${emailDomain || 'không xác định'}. Hãy kiểm tra tên miền, mã số thuế và liên hệ đơn vị ngoài hệ thống trước khi cấp tài khoản.`}
        </Note>
      ) : null}

      {isReviewing && isPersonalEmail ? (
        <Note biz tone="bad" title="Cảnh báo email cá nhân">
          {`Email @${emailDomain} là email cá nhân, không phải tên miền chính thức của tổ chức. Cần xác minh thêm trước khi cấp tài khoản đối tác.`}
        </Note>
      ) : null}

      <Note biz tone="info" title="Ba bước xác minh tài khoản">
        Gửi xác minh → Chờ xác minh → Đã xác minh. Khi Admin duyệt, tài khoản được mở khóa và đơn vị có thể
        đăng nhập cổng đối tác.
      </Note>

      <Card biz>
        <KV biz label="Tên đơn vị" value={application.name} />
        <KV
          biz
          label="Loại hình"
          value={application.org_type === 'school' ? 'Trường đại học, cao đẳng' : 'Công ty, doanh nghiệp'}
        />
        <KV biz label="Email liên hệ" value={application.email} />
        <KV biz label="Tên miền email" value={emailDomain ? `@${emailDomain}` : 'Không xác định'} />
        <KV biz label="Mã số thuế / Mã đơn vị" value={application.tax_code || 'Chưa cung cấp'} />
        <KV biz label="Người đại diện / Phụ trách" value={application.contact_person || 'Chưa cung cấp'} />
        <KV biz label="Số điện thoại" value={application.phone || 'Chưa cung cấp'} />
        <KV biz label="Trạng thái" value={statusMeta.label} />
        <KV biz label="Thời gian gửi" value={formatDateTime(application.created_at)} />
        {application.reviewed_at ? <KV biz label="Thời gian xử lý" value={formatDateTime(application.reviewed_at)} /> : null}
        {application.reviewed_by ? <KV biz label="Người xử lý" value={application.reviewed_by} /> : null}
        {organizationId ? <KV biz label="Mã tổ chức" value={organizationId} /> : null}
        <KV biz label="Mã hồ sơ" value={application.id} />
      </Card>

      {showRejectForm && isPending ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectTitle}>Từ chối hồ sơ đăng ký tài khoản</Text>
          <TextField
            biz
            label="Lý do từ chối (bắt buộc)"
            placeholder="Nêu rõ lý do để lưu vết và đối soát..."
            value={reason}
            onChangeText={(value) => {
              setReason(value);
              if (reasonError) setReasonError(undefined);
            }}
            error={reasonError}
            multiline
            numberOfLines={4}
          />
          <Text style={styles.rejectHint}>
            Lý do được lưu cùng hồ sơ. Không nhập mật khẩu hoặc dữ liệu nhạy cảm vào ô này.
          </Text>
        </View>
      ) : null}

      {organizationId ? (
        <>
          <Note biz tone="ok" title="Tổ chức đã được xác minh">
            Admin đã hoàn tất xác minh và mở khóa tài khoản đối tác. Đơn vị có thể đăng nhập bằng mật khẩu đã đăng ký.
          </Note>
          <Button
            biz
            variant="ghost"
            title="Xem hồ sơ tổ chức"
            onPress={() => router.push(`/admin/org/${organizationId}` as any)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: 'center', gap: 14 },
  centerText: { fontSize: 14, fontFamily: fonts.medium, color: '#7890a4', textAlign: 'center' },
  headerRefresh: { paddingHorizontal: 8, paddingVertical: 6 },
  headerRefreshText: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold, color: '#008d83' },
  oneTimeBox: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    gap: 10,
  },
  oneTimeTitle: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#065F46' },
  oneTimeWarning: { fontSize: 12.5, lineHeight: 18.5, fontFamily: fonts.sans, color: '#047857' },
  credentialRow: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 4,
  },
  credentialLabel: { fontSize: 11.5, fontFamily: fonts.medium, color: '#047857' },
  credentialValue: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#064E3B' },
  setupLink: { fontSize: 13, lineHeight: 19, fontFamily: fonts.sans, color: '#0F766E' },
  setupExpiry: { fontSize: 11.5, fontFamily: fonts.sans, color: '#047857' },
  loginHint: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sans, color: '#065F46' },
  rejectBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    gap: 10,
  },
  rejectTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: '#991B1B' },
  rejectHint: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sans, color: '#991B1B' },
});
