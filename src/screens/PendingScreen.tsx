import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Icon } from '../components/Icon';
import { Button, Screen, ScreenHeader } from '../components/ui';
import { CertCard } from '../components/CertCard';
import { certTag } from '../constants/mockData';
import { useApp } from '../store/AppContext';

/** Màn Chứng chỉ chờ duyệt (design #pending) */
export function PendingScreen() {
  const router = useRouter();
  const { certs } = useApp();
  const pending = certs.filter((cert) => cert.status === 'under_review');
  const p = palette(false);

  return (
    <Screen
      header={<ScreenHeader title="Chứng chỉ đang chờ duyệt" back />}
      footer={<Button title="Gửi thêm chứng chỉ" variant="ghost" onPress={() => router.push('/submit')} />}
    >
      <Text style={[styles.sub, { color: p.mut }]}>
        Các hồ sơ đang được trường hoặc doanh nghiệp xem xét.
      </Text>
      {pending.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="award" size={30} color={p.brand} /></View>
          <Text style={styles.emptyTitle}>Không có hồ sơ chờ duyệt</Text>
          <Text style={styles.emptyBody}>Chứng chỉ đã được duyệt nằm trong Ví của bạn. Bạn có thể gửi thêm chứng chỉ bên dưới.</Text>
        </View>
      ) : (
        pending.map((c) => (
          <CertCard
            key={c.id}
            title={c.title}
            subtitle={c.org + " · " + (c.submittedAt ?? "")}
            tag={certTag(c)}
            onPress={() => router.push((c.status === 'rejected' ? `/rejected?id=${encodeURIComponent(c.id)}` : `/cert/${c.id}`) as any)}
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, lineHeight: 21, fontFamily: fonts.sans },
  empty: { padding: 28, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#DCE6FA', alignItems: 'center', gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#EEF4FF', justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 16, color: '#16264F', textAlign: 'center' },
  emptyBody: { fontFamily: fonts.sans, fontSize: 13, color: '#5E6F96', lineHeight: 21, textAlign: 'center' },
});
