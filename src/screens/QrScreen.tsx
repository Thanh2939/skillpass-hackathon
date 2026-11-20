import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'qrcode';
import { fonts, palette } from '../theme';
import { Button, Note, Screen, ScreenHeader, TextField } from '../components/ui';
import { QrCode } from '../components/QrCode';
import { Icon } from '../components/Icon';
import { useApp } from '../store/AppContext';

/** Màn Xuất mã QR / link xác thực hồ sơ cho sinh viên (design #qr) */
export function QrScreen() {
  const router = useRouter();
  const { code, create } = useLocalSearchParams<{ code?: string; create?: string }>();
  const { sharedLinks, createSharedLink } = useApp();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');
  const [accessMode, setAccessMode] = useState<'public' | 'restricted'>('public');
  const [recipients, setRecipients] = useState('');
  const [saving, setSaving] = useState(false);
  const p = palette(false);
  const activeLink = create === '1' ? undefined : sharedLinks.find((item) => item.status === 'active' && (code ? item.code === code : item.company === 'Chia sẻ hồ sơ'));
  const activeCode = activeLink?.code;
  const appOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://skillpass-app-sooty.vercel.app';
  const link = `${appOrigin}/verify/${activeCode}`;

  const copy = async () => {
    if (!activeCode) return;
    try {
      if (await Clipboard.setStringAsync(link)) {
        setCopyStatus('Đã sao chép liên kết');
        return;
      }
    } catch {
      // Trình duyệt có thể từ chối quyền clipboard.
    }
    setCopyStatus('Không sao chép được. Bạn có thể chọn và sao chép link ở trên.');
  };

  const generate = async () => {
    if (saving) return;
    setCreateError('');
    setSaving(true);
    try {
      const newCode = await createSharedLink('Chia sẻ hồ sơ', { accessMode, allowedEmails: recipients.split(/[,;\n]+/).map((email) => email.trim()).filter(Boolean) });
      router.replace({ pathname: '/qr', params: { code: newCode } });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Không tạo được liên kết. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  if (!activeCode) {
    return (
      <Screen header={<ScreenHeader title="Mã QR của tôi" back />} footer={<Button title={saving ? 'Đang tạo...' : 'Tạo link và QR'} disabled={saving} onPress={generate} />}>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="qr" size={48} color={p.brand} /></View>
          <Text style={styles.emptyTitle}>Chia sẻ hồ sơ của bạn</Text>
          <Text style={[styles.sub, { color: p.mut }]}>Tạo mã QR và liên kết để nhà tuyển dụng xem các chứng chỉ đã được xác thực.</Text>
        </View>
        <Text style={styles.emptyTitle}>Ai được phép xem?</Text>
        <Button title={accessMode === 'public' ? '✓ Bất kỳ ai có link hoặc QR' : 'Bất kỳ ai có link hoặc QR'} variant={accessMode === 'public' ? 'primary' : 'ghost'} onPress={() => setAccessMode('public')} />
        <Button title={accessMode === 'restricted' ? '✓ Chỉ người nhận được chỉ định' : 'Chỉ người nhận được chỉ định'} variant={accessMode === 'restricted' ? 'primary' : 'ghost'} onPress={() => setAccessMode('restricted')} />
        {accessMode === 'restricted' ? <TextField label="Email người được xem" placeholder="hr@congty.vn, reviewer@truong.edu.vn" value={recipients} onChangeText={setRecipients} keyboardType="email-address" autoCapitalize="none" /> : null}
        <Note tone="info" title="Bạn kiểm soát quyền chia sẻ">{accessMode === 'restricted' ? 'Người nhận cần đăng nhập bằng email đã xác thực trong danh sách. Các email phân cách bằng dấu phẩy. Bạn có thể thu hồi và tạo lại để đổi quyền.' : 'Ai có liên kết hoặc mã QR đều có thể xem hồ sơ cho đến khi bạn thu hồi.'}</Note>
        {createError ? <Note tone="bad" title="Không tạo được liên kết">{createError}</Note> : null}
      </Screen>
    );
  }

  const saveQr = async () => {
    try {
      const png = await QRCode.toDataURL(link, { width: 512, margin: 4 });
      const download = document.createElement('a');
      download.href = png;
      download.download = `SkillPass-QR-${activeCode}.png`;
      download.click();
    } catch {
      setCopyStatus('Không tải được ảnh QR. Bạn vẫn có thể sao chép liên kết.');
    }
  };

  return (
    <Screen
      header={<ScreenHeader title="Mã QR của tôi" back />}
      footer={
        <>
          {Platform.OS === "web" ? <Button title="Lưu ảnh mã QR về máy" onPress={saveQr} /> : null}
          <Button
            title="Quản lý link và QR để chia sẻ"
            variant="ghost"
            onPress={() => router.push('/shared')}
          />
        </>
      }
      contentStyle={styles.center}
    >
      <Text style={[styles.sub, { color: p.mut }]}>
        Đưa mã này cho nhà tuyển dụng hoặc dán link vào CV để kiểm chứng trực tiếp.
      </Text>

      <View style={styles.qrbox}>
        <QrCode value={link} size={192} />
      </View>

      <View style={styles.linkBox}>
        <Text selectable style={[styles.linkText, { color: p.ink }]}>
          {link}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Sao chép liên kết hồ sơ" onPress={copy} hitSlop={8} style={styles.copyBtnWrap}>
          <Text style={[styles.copyBtn, { color: p.brand }]}>Sao chép</Text>
        </Pressable>
      </View>

      {copyStatus ? <Text accessibilityLiveRegion="polite" style={styles.copyStatus}>{copyStatus}</Text> : null}
      <Note tone="ok" title={activeLink?.accessMode === 'restricted' ? 'Chia sẻ có giới hạn' : 'Sẵn sàng chia sẻ hồ sơ'}>
        {activeLink?.accessMode === 'restricted' ? `Chỉ các email sau được đăng nhập để xem: ${(activeLink.allowedEmails || []).join(', ')}` : 'Ai có liên kết hoặc QR có thể xem danh sách chứng chỉ đã được phê duyệt.'}
      </Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center', gap: 14 },
  sub: { fontSize: 14, lineHeight: 22, fontFamily: fonts.sans, textAlign: 'center', maxWidth: 300 },
  empty: { alignItems: 'center', gap: 16, paddingVertical: 32, paddingHorizontal: 18, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#DCE6FA' },
  emptyIcon: { width: 100, height: 100, backgroundColor: '#EEF4FF', borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#16264F', fontSize: 20, fontFamily: fonts.bold, textAlign: 'center' },
  copyStatus: { fontFamily: fonts.medium, color: '#38578A', fontSize: 12, lineHeight: 19, textAlign: 'center' },
  qrbox: {
    width: 220,
    height: 220,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2F66F0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  linkBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    alignSelf: 'stretch',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#DCE6FA',
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  linkText: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold },
  copyBtnWrap: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#EEF4FF',
  },
  copyBtn: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold },
});
