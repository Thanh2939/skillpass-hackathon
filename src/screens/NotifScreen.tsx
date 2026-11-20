import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Screen, ScreenHeader } from '../components/ui';
import { Icon } from '../components/Icon';
import { FloatingTabs } from '../components/FloatingTabs';
import { useApp } from '../store/AppContext';

/** Màn Thông báo — lịch sử duyệt chứng chỉ (design #notif) */
export function NotifScreen() {
  const router = useRouter();
  const { notifications } = useApp();
  const p = palette(false);

  return (
    <Screen
      header={<ScreenHeader title="Thông báo" />}
      padTabs
      tabBar={
        <FloatingTabs
          activeKey="notif"
          items={[
            { key: 'home', icon: 'wallet', label: 'Ví' },
            { key: 'notif', icon: 'bell', label: 'Thông báo' },
            { key: 'profile', icon: 'user', label: 'Hồ sơ' },
          ]}
          onSelect={(k) => router.replace(k === 'home' ? '/home' : `/${k}`)}
        />
      }
    >
      <Text style={styles.section}>Lịch sử</Text>
      {notifications.length === 0 ? (
        <View style={styles.nt}>
          <Text style={[styles.ntBody, { color: p.mut }]}>Chưa có thông báo nào.</Text>
        </View>
      ) : null}
      {notifications.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => router.push(n.to as any)}
          style={[styles.nt, n.tone === 'bad' && { borderColor: '#F6C3C6' }]}
        >
          <View style={[styles.ntIcon, { backgroundColor: n.tone === 'ok' ? p.okbg : p.badbg }]}>
            <Icon name={n.icon} size={20} color={n.tone === 'ok' ? p.ok : p.bad} />
          </View>
          <View style={styles.ntText}>
            <Text style={[styles.ntTitle, { color: p.ink }]}>{n.title}</Text>
            <Text style={[styles.ntBody, { color: p.mut }]}>{n.body}</Text>
            {n.why ? (
              <Text style={[styles.why, { color: '#8F2022' }]}>{n.why}</Text>
            ) : null}
            <Text style={[styles.ntTime, { color: p.mut }]}>{n.time}</Text>
            {n.why ? (
              <View style={styles.ntMiniBtn}>
                <Text style={[styles.ntLink, { color: p.brand }]}>Xem thông tin và nguyên nhân</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingLeft: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2F66F0',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.display,
    color: '#16264F',
    lineHeight: 17,
  },
  nt: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
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
  ntIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  ntText: { flex: 1, gap: 4 },
  ntTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
  ntBody: { fontSize: 13, fontFamily: fonts.sans, lineHeight: 19 },
  why: {
    fontSize: 13,
    fontFamily: fonts.sans,
    lineHeight: 19,
    padding: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFE4E6',
  },
  ntTime: { fontSize: 12, fontFamily: fonts.sans },
  ntMiniBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#CBDAFB',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  ntLink: { fontSize: 13.5, fontWeight: '600', fontFamily: fonts.semibold },
});
