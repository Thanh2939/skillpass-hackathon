import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Button, Card, KV, Note, Screen, ScreenHeader, SelectField, Steps, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';
import type { PartnerOrg } from '../constants/mockData';
import * as supabaseService from '../services/supabase';

const ADMIN_REJECT_REASONS = [
  'Email đăng ký là email cá nhân (@gmail.com), không thuộc tên miền doanh nghiệp/trường học',
  'Mã số thuế không tồn tại hoặc không khớp với tên pháp nhân đăng ký',
  'Chưa cung cấp giấy ủy quyền đại diện ký số của đơn vị',
  'Khác (nhập chi tiết bên dưới)',
];

/**
 * Màn hình Chi tiết Thẩm định Tổ chức / Doanh nghiệp dành cho Admin (/admin/org/[id])
 * Cho phép Admin:
 * - Duyệt hồ sơ và cấp quyền dùng relayer AVAX chung do Admin quản lý
 * - Xác nhận đơn vị do sinh viên đề xuất (Lead) -> nâng cấp thành Đối tác chính thức
 * - Từ chối hồ sơ hoặc thu hồi quyền dùng relayer nếu đối tác vi phạm
 */
export function AdminOrgDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { partnerOrgs, approveOrganization, rejectOrganization, revokeOrganization } = useApp();
  const [remoteOrg, setRemoteOrg] = useState<PartnerOrg | null>(null);
  const [fetchingRemote, setFetchingRemote] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState(ADMIN_REJECT_REASONS[0]);
  const [customNote, setCustomNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const org = partnerOrgs.find((o) => o.id === id) || remoteOrg;

  useEffect(() => {
    let active = true;
    async function fetchOrgById() {
      if (!id || org) return;
      setFetchingRemote(true);
      try {
        const { data } = await supabaseService.supabase
          .from('organizations')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (data && active) {
          setRemoteOrg({
            id: data.id,
            name: data.name,
            orgType: data.org_type === 'school' ? 'school' : 'company',
            taxCode: data.tax_code || 'Đang cập nhật',
            domain: data.domain || '',
            email: data.contact_email || '',
            phone: data.phone || '',
            contactPerson: data.contact_person || '',
            status: data.kyc_status as PartnerOrg['status'],
            tier: (data.verification_tier as PartnerOrg['tier']) || 'academic',
            submittedAt: data.created_at ? new Date(data.created_at).toLocaleDateString('vi-VN') : '',
            approvedAt: data.approved_at ? new Date(data.approved_at).toLocaleDateString('vi-VN') : undefined,
            rejectionReason: data.rejection_reason || undefined,
            proposedByStudent: data.proposed_by_label || undefined,
          });
        }
      } catch (err) {
        console.warn('Error fetching organization by ID:', err);
      } finally {
        if (active) setFetchingRemote(false);
      }
    }

    fetchOrgById();
    return () => {
      active = false;
    };
  }, [id, org]);

  if (fetchingRemote && !org) {
    return (
      <Screen biz header={<ScreenHeader biz title="Đang tải dữ liệu" back />}>
        <View style={{ padding: 40, alignItems: 'center', gap: 14 }}>
          <ActivityIndicator size="large" color="#008d83" />
          <Text style={{ fontSize: 14, fontFamily: fonts.medium, color: '#7890a4' }}>
            Đang tải hồ sơ thẩm định đối tác...
          </Text>
        </View>
      </Screen>
    );
  }

  if (!org) {
    return (
      <Screen
        biz
        header={<ScreenHeader biz title="Không tìm thấy đơn vị" back />}
        footer={<Button biz title="Quay lại Quản trị" onPress={() => router.replace('/admin' as any)} />}
      >
        <Note biz tone="bad" title="Không tìm thấy tổ chức">
          Không tìm thấy thông tin đơn vị đối tác với mã định danh {id}. Hồ sơ có thể đã bị xóa hoặc đường dẫn không chính xác.
        </Note>
      </Screen>
    );
  }

  const isPersonalDomain = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(org.domain.toLowerCase());

  const handleApprove = async () => {
    setActionError(null);
    setLoading(true);
    try {
      await approveOrganization(org.id);
      Alert.alert(
        'Đã phê duyệt & Kích hoạt đối tác',
        `Đơn vị "${org.name}" đã được kích hoạt thành công. Bây giờ đơn vị có thể đăng nhập và thực hiện thẩm định, phê duyệt chứng nhận.`,
      );
    } catch (err: any) {
      setActionError(err?.message ?? 'Không phê duyệt được đối tác. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectOrRevoke = async () => {
    if (loading) return;
    setActionError(null);
    if (reason === ADMIN_REJECT_REASONS[3] && !customNote.trim()) {
      setActionError('Vui lòng nhập lý do cụ thể.');
      return;
    }
    const finalReason = customNote.trim() ? `${reason} (${customNote.trim()})` : reason;
    setLoading(true);
    try {
      if (org.status === 'verified') {
        await revokeOrganization(org.id, finalReason);
        setShowRejectForm(false);
        Alert.alert('Đã tạm khóa đối tác', `Đã khóa quyền phê duyệt của "${org.name}".`);
      } else {
        await rejectOrganization(org.id, finalReason);
        setShowRejectForm(false);
        Alert.alert('Đã từ chối hồ sơ', `Đã từ chối hồ sơ đăng ký của "${org.name}".`);
      }
    } catch (err: any) {
      setActionError(err?.message ?? 'Chưa lưu được kết quả xử lý. Vui lòng thử lại.');
      Alert.alert('Thao tác thất bại', err?.message ?? 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      biz
      header={<ScreenHeader biz title="Thẩm định Đối tác" back />}
      scrollFooter
      footer={
        showRejectForm ? (
          <>
            <Button
              biz
              variant="danger"
              title={loading ? 'Đang xử lý...' : org.status === 'verified' ? 'Xác nhận Khóa đối tác' : 'Xác nhận Từ chối hồ sơ'}
              disabled={loading}
              onPress={handleRejectOrRevoke}
            />
            <Button biz variant="ghost" title="Hủy bỏ" onPress={() => setShowRejectForm(false)} />
          </>
        ) : org.status === 'pending' ? (
          <>
            <Button
              biz
              title={loading ? 'Đang kích hoạt...' : 'Phê duyệt & Kích hoạt đối tác'}
              disabled={loading}
              onPress={handleApprove}
            />
            <Button biz variant="danger" title="Từ chối hồ sơ đăng ký" onPress={() => setShowRejectForm(true)} />
          </>
        ) : org.status === 'lead' ? (
          <>
            <Button
              biz
              title={loading ? 'Đang kích hoạt...' : 'Đã liên hệ & Kích hoạt thành Đối tác'}
              disabled={loading}
              onPress={handleApprove}
            />
            <Button biz variant="danger" title="Đánh dấu không hợp lệ" onPress={() => setShowRejectForm(true)} />
          </>
        ) : org.status === 'verified' ? (
          <>
            <Button
              biz
              variant="danger"
              title="Tạm khóa quyền đối tác"
              onPress={() => setShowRejectForm(true)}
            />
            <Button biz variant="ghost" title="Quay lại danh sách" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Button
              biz
              title={loading ? 'Đang cấp lại quyền...' : 'Khôi phục kích hoạt đối tác'}
              disabled={loading}
              onPress={handleApprove}
            />
            <Button biz variant="ghost" title="Quay lại danh sách" onPress={() => router.back()} />
          </>
        )
      }
    >
      {/* Thông báo trạng thái */}
      {actionError ? <Note biz tone="bad" title="Chưa thể kích hoạt đối tác">{actionError}</Note> : null}
      {org.status === 'verified' ? (
        <Note biz tone="ok" title="Đối tác chính thức đã kích hoạt">
          Đơn vị được phê duyệt chứng nhận; mọi phí AVAX do ví Relayer của Admin SkillPass chi trả.
        </Note>
      ) : org.status === 'pending' ? (
        <Note biz tone="info" title="Hồ sơ đang chờ Admin thẩm định">
          Vui lòng kiểm tra tên miền email (@{org.domain}) và Mã số thuế ({org.taxCode}) trước khi kích hoạt tài khoản đối tác.
        </Note>
      ) : org.status === 'lead' ? (
        <Note biz tone="info" title="Đơn vị do Sinh viên đề xuất">
          Sinh viên {org.proposedByStudent} đã gửi thông tin để đội ngũ SkillPass liên hệ xác thực và mời trường/đơn vị tham gia mạng lưới.
        </Note>
      ) : (
        <Note biz tone="bad" title={org.status === 'revoked' ? 'Đã tạm khóa đối tác' : 'Hồ sơ đăng ký đã bị từ chối'}>
          {org.rejectionReason || 'Không đáp ứng tiêu chuẩn xác thực đối tác của SkillPass.'}
        </Note>
      )}

      {/* Cảnh báo nếu dùng email cá nhân */}
      {isPersonalDomain ? (
        <Note biz tone="bad" title="Cảnh báo tên miền đăng ký">
          Đơn vị này đang dùng tên miền email cá nhân (@{org.domain}). Theo quy chuẩn xác thực SkillPass, nên yêu cầu tên miền chính thức của tổ chức (@congty.vn, @edu.vn).
        </Note>
      ) : null}

      {/* Thông tin pháp nhân & kỹ thuật */}
      <Card biz>
        <KV biz label="Tên đơn vị" value={org.name} />
        <KV biz label="Loại hình" value={org.orgType === 'school' ? 'Trường đại học, cao đẳng' : 'Công ty, doanh nghiệp'} />
        <KV
          biz
          label="Phân hạng (Tier)"
          value={org.tier === 'academic' ? 'Academic Verified (Tier 1)' : 'Enterprise Verified (Tier 2)'}
        />
        <KV biz label="Mã số thuế / Mã ĐV" value={org.taxCode} />
        <KV biz label="Tên miền (Domain)" value={`@${org.domain}`} />
        <KV biz label="Email liên hệ" value={org.email} />
        <KV biz label="Số điện thoại" value={org.phone} />
        <KV biz label="Người đại diện" value={org.contactPerson} />
        {org.proposedByStudent ? <KV biz label="Sinh viên đề xuất" value={org.proposedByStudent} /> : null}
        <KV biz label="Mã định danh đối tác" value={org.id.slice(0, 8).toUpperCase()} />
        <KV biz label="Thời gian gửi" value={org.submittedAt} />
        {org.approvedAt ? <KV biz label="Ngày kích hoạt" value={org.approvedAt} /> : null}
      </Card>

      {/* Form nhập lý do từ chối / thu hồi */}
      {showRejectForm ? (
        <View style={styles.rejectBox}>
          <Text style={styles.rejectTitle}>
            {org.status === 'verified' ? 'Lý do tạm khóa đối tác' : 'Lý do từ chối hồ sơ đối tác'}
          </Text>
          <SelectField
            label="Chọn lý do"
            placeholder="Chọn lý do"
            value={reason}
            onChange={setReason}
            options={ADMIN_REJECT_REASONS.map((r) => ({ label: r, value: r }))}
          />
          <TextField
            label="Ghi chú chi tiết gửi tới đơn vị"
            placeholder="Nhập hướng dẫn bổ sung hồ sơ (nếu có)..."
            value={customNote}
            onChangeText={setCustomNote}
            multiline
            numberOfLines={3}
          />
        </View>
      ) : (
        <View style={styles.checkBox}>
          <Text style={styles.checkTitle}>Quy trình kiểm tra 3 bước</Text>
          <Steps
            steps={[
              `Kiểm tra Domain: @${org.domain} (${isPersonalDomain ? 'Chưa đạt' : 'Hợp lệ'})`,
              `Đối chiếu Mã số thuế / Pháp nhân: ${org.taxCode}`,
              `Cấp quyền dùng gas AVAX từ Relayer Admin`,
            ]}
            onCount={org.status === 'verified' ? 3 : isPersonalDomain ? 1 : 2}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2ebf0',
    gap: 10,
  },
  checkTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#102c42',
  },
  rejectBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    gap: 12,
  },
  rejectTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#991B1B',
  },
});
