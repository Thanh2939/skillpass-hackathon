import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Note, Screen, ScreenHeader } from '../components/ui';
import { Icon } from '../components/Icon';
import { useApp } from '../store/AppContext';

/** Màn Xác nhận vô hiệu hóa link (design #revoke, checkbox #rv1) */
export function RevokeScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { revokeLink, sharedLinks } = useApp();
  const p = palette(false);
  const [revoked, setRevoked] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeLink = sharedLinks.find((l) => l.code === code);
  const targetCode = activeLink?.code;
  const targetCompany = activeLink?.company || 'Nhà tuyển dụng';

  const handleRevoke = async () => {
    if (!targetCode || saving) return;
    setError(null);
    setSaving(true);
    try {
      await revokeLink(targetCode);
      setRevoked(true);
    } catch {
      setError('Không thu hồi được liên kết. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<ScreenHeader title="Vô hiệu hóa link" back={!revoked} />}
      footer={
        revoked ? (
          <Button title="Về danh sách link" onPress={() => router.replace('/shared')} />
        ) : (
          <>
            <Button title="Vô hiệu hóa liên kết" variant="danger" disabled={!targetCode || saving} onPress={handleRevoke} />
            <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
              <Text style={[styles.cancel, { color: p.brand }]}>Giữ lại link</Text>
            </Pressable>
          </>
        )
      }
    >
      {error ? <Note tone="bad" title="Thu hồi thất bại">{error}</Note> : null}
      {revoked ? (
        <Note tone="ok" title="Đã vô hiệu hóa liên kết">
          Link {targetCode} đã bị khóa. {targetCompany} không còn xem được hồ sơ của bạn.
        </Note>
      ) : (
        <Note tone="bad" title={`Thu hồi link của ${targetCompany}?`}>
          Sau khi xác nhận, link và mã QR này không xem được nữa. Bạn vẫn có thể tạo link mới cho công ty khác.
        </Note>
      )}
      <Text style={styles.lbl}>Khi HR mở lại link cũ, họ sẽ thấy</Text>
      <View style={styles.hrview}>
        <Icon name="lock" size={36} color={p.bad} />
        <Text style={[styles.hrTitle, { color: p.ink }]}>Liên kết này đã hết hạn hoặc bị chủ sở hữu thu hồi</Text>
        <Text style={[styles.hrLink, { color: p.mut }]}>Mã chia sẻ {targetCode}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cancelBtn: { alignItems: 'center', paddingVertical: 4 },
  cancel: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
  lbl: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, color: '#16264F' },
  hrview: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9D2EE',
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  hrTitle: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  hrLink: { fontSize: 12.5, fontFamily: fonts.sans },
});
