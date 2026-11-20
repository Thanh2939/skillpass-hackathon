import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Screen, ScreenHeader, Tag } from '../components/ui';
import type { SharedLink } from '../constants/mockData';
import { useApp } from '../store/AppContext';
import { Icon } from '../components/Icon';

function tagOf(l: SharedLink): { tone: 'ok' | 'bad' | 'gray'; label: string } {
  if (l.status === 'active') return { tone: 'ok', label: 'Đang hoạt động' };
  if (l.status === 'revoked') return { tone: 'bad', label: 'Đã thu hồi' };
  return { tone: 'gray', label: 'Hết hạn' };
}

/** Màn Link và QR đã chia sẻ (design #shared) */
export function SharedScreen() {
  const router = useRouter();
  const { sharedLinks } = useApp();
  const p = palette(false);

  return (
    <Screen header={<ScreenHeader title="Quản lý chia sẻ" back />} footer={<Button title="Tạo liên kết và chọn quyền xem" onPress={() => router.push({ pathname: '/qr', params: { create: '1' } })} />}>
      <View style={styles.access}>
        <View style={styles.accessIcon}><Icon name="link" color={p.brand} size={24} /></View>
        <View style={styles.cardText}>
          <Text style={[styles.title, { color: p.ink }]}>Bạn chọn người được xem</Text>
          <Text style={[styles.small, { color: p.mut }]}>Tạo liên kết công khai hoặc giới hạn theo email người nhận. Link và QR dùng cùng quyền truy cập.</Text>
        </View>
      </View>
      {sharedLinks.length === 0 ? <View style={styles.empty}><Icon name="qr" size={40} color={p.brand} /><Text style={styles.emptyTitle}>Chưa có liên kết chia sẻ</Text><Text style={styles.emptyBody}>Tạo một mã QR để chia sẻ hồ sơ trên CV hoặc gửi cho nhà tuyển dụng.</Text></View> : null}
      {sharedLinks.map((l) => (
        <View key={l.code} style={styles.card}>
          <View style={[styles.stripe, { backgroundColor: p.brand }]} />
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={[styles.title, { color: p.ink }]}>{l.company}</Text>
              <Text selectable style={[styles.small, { color: p.mut }]}>{l.code} · {l.sharedAt}</Text>
            </View>
          </View>
           <View style={styles.statusRow}><Tag tone={tagOf(l).tone}>{tagOf(l).label}</Tag><Text style={[styles.small, { color: p.mut }]}>{l.note}</Text></View>
           <Text style={[styles.small, { color: p.mut }]}>{l.accessMode === 'restricted' ? `Chỉ người nhận: ${(l.allowedEmails || []).join(', ')}` : 'Bất kỳ ai có liên kết hoặc QR'}</Text>
          {l.status === 'active' ? (
            <>
            <Button title="Mở link và QR" variant="ghost" onPress={() => router.push({ pathname: "/qr", params: { code: l.code } })} />
            <Pressable onPress={() => router.push(`/revoke?code=${l.code}` as any)} style={styles.revokeBtn}>
              <Text style={[styles.revokeText, { color: p.bad }]}>Vô hiệu hóa liên kết</Text>
            </Pressable>
            </>
          ) : null}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, lineHeight: 21, fontFamily: fonts.sans },
  access: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#F8FAFF', borderWidth: 1, borderColor: '#DCE6FA' },
  accessIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#E7EFFF', alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginVertical: 12 },
  empty: { alignItems: 'center', gap: 14, padding: 28, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE6FA' },
  emptyTitle: { fontFamily: fonts.semibold, color: '#16264F', fontSize: 16, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.sans, color: '#5E6F96', fontSize: 13, lineHeight: 21, textAlign: 'center' },
  card: {
    position: 'relative',
    padding: 14,
    paddingLeft: 20,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 18,
    backgroundColor: '#fff',
    shadowColor: 'rgba(40,60,140,0.07)',
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, marginBottom: 2 },
  small: { fontSize: 12.5, lineHeight: 20, fontFamily: fonts.sans, flexShrink: 1 },
  revokeBtn: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#F3B5B8',
    borderRadius: 12,
    alignItems: 'center',
  },
  revokeText: { fontSize: 13.5, fontWeight: '600', fontFamily: fonts.semibold },
});
