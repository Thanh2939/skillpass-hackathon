import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Avatar, Screen } from '../components/ui';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { Duck } from '../components/Duck';
import { CertCard } from '../components/CertCard';
import { FloatingTabs } from '../components/FloatingTabs';
import { PushBanner } from '../components/PushBanner';
import { useApp } from '../store/AppContext';
import { certTag } from '../constants/mockData';

/** Màn hình chính — Ví chứng chỉ (design #home) */

const ACTIONS: { icon: IconName; label: string; to: string }[] = [
  { icon: 'up', label: 'Gửi chứng chỉ', to: '/submit' },
  { icon: 'qr', label: 'Xuất mã QR', to: '/qr' },
  { icon: 'bell', label: 'Chờ duyệt', to: '/pending' },
];

export function HomeScreen() {
  const router = useRouter();
  const { avatarUri, student, certs, notifications, authUser, authReady } = useApp();
  const p = palette(false);
  const focused = useIsFocused();

  React.useEffect(() => {
    if (focused && authReady && !authUser) {
      router.replace('/');
    }
  }, [focused, authReady, authUser, router]);

  const schoolCerts = certs.filter((c) => c.orgType === 'school' || c.autoSync);
  const external = certs.filter((c) => c.orgType !== 'school' && !c.autoSync);
  const signedCount = certs.filter((c) => c.status === 'approved' || c.status === 'issued').length;
  const latestNotif = notifications[0];

  return (
    <Screen
      padTabs
      overlay={
        latestNotif ? (
          <PushBanner
            icon={latestNotif.icon}
            title={latestNotif.title}
            message={latestNotif.body}
            onPress={() => router.push(latestNotif.to as any)}
          />
        ) : undefined
      }
      tabBar={
        <FloatingTabs
          activeKey="home"
          items={[
            { key: 'home', icon: 'wallet', label: 'Hồ sơ' },
            { key: 'notif', icon: 'bell', label: 'Thông báo' },
            { key: 'profile', icon: 'user', label: 'Cá nhân' },
          ]}
          onSelect={(k) => router.replace(k === 'home' ? '/home' : `/${k}`)}
        />
      }
    >
      {/* Khung đầu trang */}
      <LinearGradient colors={p.helloGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hello}>
        <View pointerEvents="none" style={styles.helloCircle} />
        <View style={styles.helloMain}>
          <Pressable onPress={() => router.push('/profile')} style={styles.avatarWrap}>
            <Avatar initials={student.initials} uri={avatarUri} size={52} />
          </Pressable>
          <Text style={styles.helloSmall}>Xin chào,</Text>
          <Text style={[styles.helloName, { fontFamily: fonts.displaybold }]}>{student.name || 'Sinh viên'}</Text>
          {student.mssv ? <Text style={styles.helloSmall}>MSSV {student.mssv}</Text> : null}
          <Text style={styles.helloSmall}>{student.school || 'Chưa liên kết trường đại học'}</Text>
        </View>
        <View style={styles.peek}>
          <Duck variant="plain" width={112} height={112} bob />
        </View>
        <View style={styles.side}>
          <Pressable onPress={() => router.replace('/notif')} style={styles.bell} accessibilityLabel="Thông báo">
            <Icon name="bell" size={22} color="#fff" />
            {notifications.length > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>
      </LinearGradient>

      {/* Tổng quan hồ sơ */}
      <View style={styles.sync}>
        <View style={styles.syncIcon}>
          <Icon name="ok" size={22} color={p.brand} />
        </View>
        <View style={styles.syncText}>
          <Text style={[styles.syncTitle, { color: p.ink }]}>Tổng quan chứng chỉ số</Text>
          <Text style={[styles.syncSub, { color: p.mut }]}>
            {signedCount > 0
              ? `${signedCount} chứng chỉ đã được phê duyệt chính thức`
              : 'Chưa có chứng chỉ nào. Hãy gửi yêu cầu để nhà trường hoặc doanh nghiệp phê duyệt'}
          </Text>
        </View>
      </View>
      <Pressable onPress={() => router.push('/school')} style={styles.sync}>
        <View style={styles.syncIcon}>
          <Icon name="user" size={22} color={p.brand} />
        </View>
        <View style={styles.syncText}>
          <Text style={[styles.syncTitle, { color: p.ink }]}>Xác nhận thông tin sinh viên</Text>
          <Text style={[styles.syncSub, { color: p.mut }]}>Gửi thông tin thẻ sinh viên để trường xác nhận</Text>
        </View>
        <Text style={[styles.syncChev, { color: p.mut }]}>›</Text>
      </Pressable>

      {/* Thao tác nhanh */}
      <View style={styles.acts}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.to}
            onPress={() => router.push(a.to as any)}
            style={styles.act}
          >
            <Icon name={a.icon} size={22} color={p.brand} />
            <Text style={[styles.actLabel, { color: p.brand }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Nhà trường cấp / xác thực */}
      <Text style={styles.section}>Trường đại học chứng nhận ({schoolCerts.length})</Text>
      {schoolCerts.map((c) => (
        <CertCard
          key={c.id}
          title={c.title}
          subtitle={
            c.status === 'approved' || c.status === 'issued'
              ? `${c.org} · Đã duyệt ngày ${c.reviewedAt ?? c.issueDate ?? c.submittedAt}`
              : c.status === 'rejected'
                ? `${c.org} · Cần bổ sung`
                : `Đã gửi tới ${c.org} ngày ${c.submittedAt}`
          }
          tag={certTag(c)}
          onPress={() => router.push((c.status === 'rejected' ? `/rejected?id=${encodeURIComponent(c.id)}` : `/cert/${c.id}`) as any)}
        />
      ))}

      {/* Chứng chỉ doanh nghiệp / ngoài */}
      <Text style={styles.section}>Chứng chỉ & Thực tập doanh nghiệp ({external.length})</Text>
      {external.map((c) => (
        <CertCard
          key={c.id}
          title={c.title}
          subtitle={
            c.status === 'rejected'
              ? `${c.org} · ${c.rejectionReason || 'Cần bổ sung'}`
              : c.status === 'approved' || c.status === 'issued'
                ? `${c.org} · Đã duyệt ngày ${c.reviewedAt ?? c.submittedAt}`
                : `Đã gửi tới ${c.org} ngày ${c.submittedAt}`
          }
          tag={certTag(c)}
          onPress={() => router.push((c.status === 'rejected' ? `/rejected?id=${encodeURIComponent(c.id)}` : `/cert/${c.id}`) as any)}
        />
      ))}
      <CertCard dashed title="+ Gửi yêu cầu chứng chỉ mới" onPress={() => router.push('/submit')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    minHeight: 180,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 22,
    overflow: 'hidden',
  },
  helloMain: { maxWidth: '58%', zIndex: 1 },
  helloCircle: {
    position: 'absolute',
    right: -14,
    bottom: -34,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  avatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: 'rgba(10,25,80,0.35)',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  helloSmall: { fontSize: 13, fontFamily: fonts.sans, color: '#D3E2FF' },
  helloName: { fontSize: 27, lineHeight: 31, color: '#fff', marginTop: 2, marginBottom: 8 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1 },
  peek: { position: 'absolute', right: 18, bottom: 10, zIndex: 1 },
  bell: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: { position: 'absolute', top: 10, right: 11, width: 10, height: 10, borderRadius: 5, backgroundColor: '#F2545B' },
  sync: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  syncIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3ECFF', alignItems: 'center', justifyContent: 'center' },
  syncText: { flex: 1 },
  syncTitle: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold },
  syncSub: { fontSize: 12.5, fontFamily: fonts.sans, marginTop: 1 },
  syncChev: { fontSize: 22 },
  acts: { flexDirection: 'row', gap: 10 },
  act: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
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
  actLabel: { fontSize: 12.5, fontWeight: '500', fontFamily: fonts.medium, lineHeight: 16.5, textAlign: 'center' },
  section: {
    marginTop: 4,
    paddingLeft: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2F66F0',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.display,
    color: '#16264F',
    lineHeight: 17,
  },
});
