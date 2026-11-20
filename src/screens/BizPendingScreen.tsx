import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Button, Card, KV, Note, Screen, ScreenHeader, Steps } from '../components/ui';
import { useApp } from '../store/AppContext';

/**
 * Màn hình trạng thái thẩm định tài khoản Đối tác (Doanh nghiệp / Trường học)
 * Hiển thị ngay sau khi đăng ký tại BizRegisterScreen hoặc khi đăng nhập lúc chưa được Admin duyệt.
 */
export function BizPendingScreen() {
  const router = useRouter();
  const { partnerOrgs, currentBizOrgId, authUser, signOut, dataReady } = useApp();

  const org =
    partnerOrgs.find((o) => o.id === currentBizOrgId) ??
    (authUser
      ? partnerOrgs.find(
          (o) =>
            o.ownerUserId === authUser.id ||
            o.email.toLowerCase() === authUser.email.toLowerCase()
        )
      : undefined);

  const isVerified = org?.status === 'verified';
  const isRejected = org?.status === 'rejected' || org?.status === 'revoked';

  return (
    <Screen
      biz
      header={<ScreenHeader biz title="Trạng thái Hồ sơ Đối tác" back />}
      footer={
        isVerified ? (
          <Button biz title="Vào Bảng điều khiển Doanh nghiệp" onPress={() => router.replace('/biz')} />
        ) : (
          <Button
            biz
            variant="ghost"
            title="Đăng xuất & Quay lại màn hình chính"
            onPress={async () => {
              await signOut();
              router.replace('/');
            }}
          />
        )
      }
    >
      {!org ? (
        <Note biz tone="info" title={dataReady ? 'Chưa có hồ sơ đối tác' : 'Đang tải hồ sơ'}>
          {dataReady ? 'Tài khoản đã tạo nhưng chưa có hồ sơ được lưu. Hãy hoàn tất thông tin để gửi đến quản trị viên.' : 'Vui lòng chờ trong giây lát.'}
        </Note>
      ) : isVerified ? (
        <Note biz tone="ok" title="Tài khoản Đối tác đã được xác minh!">
          Đơn vị có thể phê duyệt chứng nhận. Admin SkillPass sẽ chi trả gas AVAX qua ví Relayer chung; đơn vị không cần ví riêng.
        </Note>
      ) : isRejected ? (
        <Note biz tone="bad" title="Hồ sơ Đối tác cần bổ sung hoặc tạm khóa">
          {org?.rejectionReason || 'Hồ sơ chưa đáp ứng điều kiện xác thực tên miền của đơn vị.'}
        </Note>
      ) : (
        <Note biz tone="info" title="Chờ xác minh">
          Hồ sơ đã được gửi. Quản trị viên SkillPass đang kiểm tra Mã số thuế và email của đơn vị.
        </Note>
      )}

      {!org && dataReady ? <Button biz title="Hoàn tất hồ sơ đối tác" onPress={() => router.push('/biz/register')} /> : null}
      {org ? (
        <Card biz>
          <KV biz label="Tên đơn vị" value={org.name} />
          <KV biz label="Loại hình" value={org.orgType === 'school' ? 'Trường đại học, cao đẳng' : 'Công ty, doanh nghiệp'} />
          <KV biz label="Mã số thuế / Mã ĐV" value={org.taxCode} />
          <KV biz label="Tên miền xác thực" value={`@${org.domain}`} />
          <KV biz label="Email đại diện" value={org.email} />
          <KV biz label="Người phụ trách" value={org.contactPerson} />
          <KV biz label="Mã định danh đối tác" value={org.id.slice(0, 8).toUpperCase()} />
          <KV
            biz
            label="Trạng thái xác minh"
            value={
              isVerified
                ? 'Đã xác minh'
                : isRejected
                  ? 'Bị từ chối / Đã khóa'
                  : 'Chờ xác minh'
            }
          />
        </Card>
      ) : null}

      <View style={styles.stepsBox}>
        <Text style={styles.stepsTitle}>Quy trình xác minh tài khoản (3 bước)</Text>
        <Steps
          steps={[
            'Gửi xác minh',
            'Chờ xác minh',
            'Đã xác minh',
          ]}
          onCount={isVerified ? 3 : isRejected ? 1 : 2}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepsBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2ebf0',
    gap: 10,
  },
  stepsTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#102c42',
  },
});
