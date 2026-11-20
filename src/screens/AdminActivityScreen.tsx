import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Screen, ScreenHeader, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { FloatingTabs } from '../components/FloatingTabs';
import { useApp } from '../store/AppContext';

/**
 * Màn hình Nhật ký Quản trị & quyền sử dụng relayer Avalanche (/admin/activity)
 */
export function AdminActivityScreen() {
  const router = useRouter();
  const p = palette(true);
  const { adminLogs, partnerOrgs } = useApp();
  const pendingOrgs = partnerOrgs.filter((o) => o.status === 'pending' || o.status === 'lead');

  return (
    <Screen
      biz
      header={<ScreenHeader biz title="Nhật ký Quản trị" />}
      padTabs
      tabBar={
        <FloatingTabs
          biz
          activeKey="activity"
          items={[
            { key: 'home', icon: 'biz', label: 'Đối tác' },
            { key: 'activity', icon: 'bell', label: 'Nhật ký' },
            { key: 'profile', icon: 'user', label: 'Hệ thống' },
          ]}
          onSelect={(k) => router.replace((k === 'home' ? '/admin' : `/admin/${k}`) as any)}
        />
      }
    >
      {pendingOrgs.length > 0 ? (
        <>
          <Text style={styles.section}>Hồ sơ cần xử lý ({pendingOrgs.length})</Text>
          {pendingOrgs.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => router.push(`/admin/org/${o.id}` as any)}
              style={styles.pendingCard}
            >
              <View style={styles.pendingIcon}>
                <Icon name="bell" size={20} color="#D97706" />
              </View>
              <View style={styles.pendingText}>
                <Text style={styles.pendingTitle}>{o.name}</Text>
                <Text style={styles.pendingSub}>
                  {o.status === 'lead' ? `Đề xuất bởi ${o.proposedByStudent}` : `MST: ${o.taxCode} · @${o.domain}`}
                </Text>
              </View>
              <Tag tone="wait" biz>
                {o.status === 'lead' ? 'SV đề xuất' : 'Chờ duyệt'}
              </Tag>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={styles.section}>Nhật ký hoạt động & Phê duyệt</Text>
      {adminLogs.map((log) => (
        <View key={log.id} style={styles.logCard}>
          <View style={[styles.logIcon, { backgroundColor: log.tone === 'ok' ? p.okbg : p.badbg }]}>
            <Icon name={log.icon} size={20} color={log.tone === 'ok' ? p.ok : p.bad} />
          </View>
          <View style={styles.logBody}>
            <Text style={[styles.logTitle, { color: p.ink }]}>{log.title}</Text>
            <Text style={[styles.logText, { color: p.mut }]}>{log.body}</Text>
            {log.txHash ? (
              <Text style={styles.txBadge}>
                Mã xác nhận: {log.txHash.length > 20 ? `${log.txHash.slice(0, 10)}...${log.txHash.slice(-6)}` : log.txHash}
              </Text>
            ) : null}
            <Text style={[styles.logTime, { color: p.mut }]}>{log.time}</Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#0F172A' },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  pendingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingText: { flex: 1, gap: 2 },
  pendingTitle: { fontSize: 13.5, fontWeight: '700', fontFamily: fonts.bold, color: '#0F172A' },
  pendingSub: { fontSize: 12, fontFamily: fonts.sans, color: '#475569' },
  logCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  logIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  logBody: { flex: 1, gap: 4 },
  logTitle: { fontSize: 13.5, fontWeight: '600', fontFamily: fonts.semibold },
  logText: { fontSize: 12.5, fontFamily: fonts.sans, lineHeight: 18 },
  txBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    color: '#4338CA',
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: fonts.semibold,
  },
  logTime: { fontSize: 11.5, fontFamily: fonts.sans },
});
