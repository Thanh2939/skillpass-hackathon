import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Screen, SearchField } from '../components/ui';
import { Icon } from '../components/Icon';
import { Duck } from '../components/Duck';
import { CertCard } from '../components/CertCard';
import { FloatingTabs } from '../components/FloatingTabs';
import { PushBanner } from '../components/PushBanner';
import { useApp } from '../store/AppContext';

/**
 * Bảng điều khiển Doanh nghiệp / Trường học (hihi_fixed.html #home)
 */

function normalize(value: string): string {
  const s = value.toLocaleLowerCase('vi');
  try {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  } catch {
    return s;
  }
}

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Đã từ chối' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

export function BizHomeScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const p = palette(true);
  const { bizRequests, partnerOrgs, currentBizOrgId, authUser, authReady } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<FilterKey>('all');

  const activeOrg =
    partnerOrgs.find((o) => o.id === currentBizOrgId) ??
    (authUser
      ? partnerOrgs.find(
          (o) =>
            o.ownerUserId === authUser.id ||
            o.email.toLowerCase() === authUser.email.toLowerCase()
        )
      : undefined);

  // Chỉ xử lý khi màn đang hiển thị: tránh màn hidden (sau logout) đẩy ngược về /biz/login.
  useEffect(() => {
    if (!authReady || !focused) return;
    if (!authUser || authUser.role !== 'business') {
      router.replace('/');
      return;
    }
    if (activeOrg && activeOrg.status !== 'verified') {
      router.replace('/biz/pending' as any);
    }
  }, [authReady, focused, authUser, activeOrg, router]);

  const pendingCount = bizRequests.filter((r) => r.status === 'pending').length;
  const approvedCount = bizRequests.filter((r) => r.status === 'approved').length;
  const totalCount = bizRequests.length;
  const orgName = activeOrg ? activeOrg.name : 'Đơn vị đối tác';
  const orgAdmin = activeOrg ? activeOrg.contactPerson : authUser?.email || 'Ban Quản trị';
  const orgInitials = activeOrg
    ? activeOrg.name
        .split(' ')
        .slice(-2)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
    : 'BP';
  const firstPending = bizRequests.find((r) => r.status === 'pending');

  const items = useMemo(() => {
    const q = normalize(query.trim());
    return bizRequests.filter((r) => {
      const status: FilterKey = r.status;
      const haystack = normalize(`${r.title} ${r.student} ${r.mssv ?? ''} ${r.school ?? ''}`);
      return (active === 'all' || active === status) && haystack.includes(q);
    });
  }, [query, active, bizRequests]);

  return (
    <Screen
      biz
      padTabs
      overlay={
        firstPending ? (
          <PushBanner
            biz
            icon="bell"
            title="Yêu cầu xác thực chứng nhận mới"
            message={`${firstPending.student} vừa gửi: ${firstPending.title}`}
            onPress={() => router.push({ pathname: "/biz/review", params: { id: firstPending.id } })}
          />
        ) : undefined
      }
      tabBar={
        <FloatingTabs
          biz
          activeKey="home"
          items={[
            { key: 'home', icon: 'wallet', label: 'Tổng quan' },
            { key: 'notif', icon: 'bell', label: 'Hoạt động' },
            { key: 'profile', icon: 'user', label: 'Đơn vị' },
          ]}
          onSelect={(k) => router.replace(k === 'home' ? '/biz' : `/biz/${k}`)}
        />
      }
    >
      {/* Đầu trang thương hiệu */}
      <View style={styles.brandHeader}>
        <View style={styles.brandMark}>
          <Icon name="ok" size={25} color="#fff" />
        </View>
        <View style={styles.brandName}>
          <Text style={styles.brandStrong}>SkillPass</Text>
          <Text style={styles.brandSpan}>BUSINESS</Text>
        </View>
        <View style={styles.spacer} />
        <Pressable onPress={() => router.replace('/biz/notif')} style={styles.topBtn} accessibilityLabel="Thông báo">
          <Icon name="bell" size={19} color="#4d6b7d" />
          {pendingCount > 0 ? <View style={styles.topDot} /> : null}
        </Pressable>
        <Pressable onPress={() => router.replace('/biz/profile')} style={styles.topAvatar}>
          <Text style={styles.topAvatarText}>{orgInitials}</Text>
        </Pressable>
      </View>

      {/* Khung chào doanh nghiệp */}
      <LinearGradient colors={p.helloGradient} style={styles.hello}>
        <View pointerEvents="none" style={styles.ring1}>
          <View style={styles.ring2}>
            <View style={styles.ring3} />
          </View>
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTopLabel}>
              {activeOrg?.orgType === 'school' ? 'TÀI KHOẢN TRƯỜNG ĐẠI HỌC' : 'TÀI KHOẢN DOANH NGHIỆP'}
            </Text>
            <View style={styles.verified}>
              <Icon name="ok" size={12} color="#9df0d6" />
              <Text style={styles.verifiedText}>Đã xác thực</Text>
            </View>
          </View>
          <Text style={styles.heroGreeting}>Xin chào, đối tác</Text>
          <Text style={styles.helloName}>{orgName}</Text>
          <Text style={styles.admin}>Quản trị viên: {orgAdmin}</Text>
          <View style={styles.heroSecurity}>
            <Icon name="ok" size={14} color="#b0f5d8" />
            <Text style={styles.heroSecurityText}>Gas AVAX do Admin SkillPass tài trợ</Text>
          </View>
        </View>
        <View style={styles.peek}>
          <Duck variant="tie" width={108} height={108} bob />
        </View>
        <View style={styles.helloDivider} />
      </LinearGradient>

      {/* Thống kê */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statSmall}>Tổng hồ sơ</Text>
          <Text style={styles.statStrong}>{totalCount < 10 ? `0${totalCount}` : totalCount}</Text>
          <Text style={styles.statSub}>Đã tiếp nhận</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statSmall}>Chứng nhận</Text>
          <Text style={styles.statStrong}>{approvedCount < 10 ? `0${approvedCount}` : approvedCount}</Text>
          <Text style={styles.statSub}>Đã phê duyệt</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statSmall}>Yêu cầu mới</Text>
          <Text style={[styles.statStrong, styles.statGold]}>{pendingCount < 10 ? `0${pendingCount}` : pendingCount}</Text>
          <Text style={styles.statSub}>Chờ xử lý</Text>
        </View>
      </View>

      {/* Thao tác nhanh */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <Text style={styles.sectionSpan}>Truy cập tiện ích</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Duyệt yêu cầu mới"
        onPress={() => {
          if (firstPending) {
            router.push({ pathname: '/biz/review', params: { id: firstPending.id } });
          } else {
            router.push('/biz/notif');
          }
        }}
      >
        <LinearGradient colors={['#ebf9f9', '#e9f5f4']} style={styles.quickAction} pointerEvents="none">
          <View style={styles.actionIcon}>
            <Icon name="ok" size={22} color="#008c88" />
          </View>
          <View style={styles.quickText}>
            <Text style={styles.quickTitle}>Duyệt yêu cầu</Text>
            <Text style={styles.quickSub}>
              {pendingCount > 0 ? `Có ${pendingCount} hồ sơ đang chờ thẩm định & phê duyệt` : 'Hiện chưa có yêu cầu mới chờ duyệt'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </LinearGradient>
      </Pressable>

      {/* Yêu cầu phê duyệt */}
      <View style={[styles.sectionHead, styles.requestHeading]}>
        <Text style={styles.sectionTitle}>Danh sách tài liệu sinh viên gửi</Text>
        <Text style={styles.requestCount}>{items.length} yêu cầu</Text>
      </View>
      <SearchField
        biz
        value={query}
        onChangeText={setQuery}
        placeholder="Tìm tên, MSSV, chứng nhận..."
        accessibilityLabel="Tìm yêu cầu sinh viên"
      />
      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const isActive = active === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setActive(f.key)}
              style={[styles.chip, isActive && styles.chipActive]}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>Chưa có yêu cầu nào được sinh viên gửi tới đơn vị của bạn.</Text>
      ) : (
        items.map((r) => {
          const isApproved = r.status === 'approved';
          return (
            <CertCard
              key={r.id}
              biz
              icon={r.icon}
              title={r.title}
              subtitle={`${r.student}${r.mssv ? ` (${r.mssv})` : ''} · ${r.date}`}
              tag={r.status === 'rejected' ? { tone: 'bad', label: 'Đã từ chối' } : isApproved ? { tone: 'ok', label: 'Đã duyệt' } : { tone: 'wait', label: 'Chờ duyệt' }}
              onPress={() => router.push({ pathname: "/biz/review", params: { id: r.id } })}
            />
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 3 },
  brandMark: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#102d42', alignItems: 'center', justifyContent: 'center' },
  brandName: { gap: 1 },
  brandStrong: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: -0.8, color: '#102c42' },
  brandSpan: { fontSize: 9, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 1.6, color: '#6389a2' },
  spacer: { flex: 1 },
  topBtn: {
    position: 'relative',
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e9ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topDot: { position: 'absolute', right: 9, top: 9, width: 5, height: 5, borderRadius: 3, backgroundColor: '#de8548' },
  topAvatar: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#def0ec', alignItems: 'center', justifyContent: 'center' },
  topAvatarText: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: '#08766e' },
  hello: { position: 'relative', minHeight: 206, overflow: 'hidden', paddingHorizontal: 19, paddingTop: 20, borderRadius: 21 },
  ring1: {
    position: 'absolute',
    right: -105,
    top: -28,
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: 'rgba(200,246,240,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring2: { width: 206, height: 206, borderRadius: 103, borderWidth: 1, borderColor: 'rgba(255,255,255,0.015)', alignItems: 'center', justifyContent: 'center' },
  ring3: { width: 152, height: 152, borderRadius: 76, borderWidth: 1, borderColor: 'rgba(255,255,255,0.018)' },
  heroCopy: { zIndex: 2 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  heroTopLabel: { fontSize: 9, letterSpacing: 1, fontWeight: '700', fontFamily: fonts.bold, color: '#9ed6e6' },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 30,
    backgroundColor: 'rgba(8,144,127,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(122,230,202,0.3)',
  },
  verifiedText: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, color: '#9df0d6' },
  heroGreeting: { fontSize: 12, fontFamily: fonts.sans, color: '#e2eef4', marginTop: 16 },
  helloName: { fontSize: 23, lineHeight: 30, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: -1.1, color: '#fff', marginVertical: 8 },
  admin: { fontSize: 11, fontFamily: fonts.sans, color: '#d4e4ed' },
  heroSecurity: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  heroSecurityText: { fontSize: 10, fontFamily: fonts.sans, color: '#c0d6df' },
  peek: { position: 'absolute', right: 6, bottom: 36, zIndex: 1 },
  helloDivider: { position: 'absolute', left: 19, right: 19, bottom: 30, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  stats: { flexDirection: 'row', gap: 9 },
  stat: {
    flex: 1,
    minHeight: 111,
    justifyContent: 'space-between',
    padding: 13,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e0e8ec',
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: 'rgba(28,57,80,0.035)',
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  statSmall: { fontSize: 10, fontFamily: fonts.medium, color: '#102c42' },
  statStrong: { fontSize: 28, lineHeight: 32, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: -1.8, color: '#102c42' },
  statGold: { color: '#b4811a' },
  statSub: { fontSize: 10, fontFamily: fonts.sans, color: '#7590a5' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: '#0c293f' },
  sectionSpan: { fontSize: 10, fontFamily: fonts.sans, color: '#8c9fb0' },
  sectionSpanSubtle: { fontSize: 10, fontFamily: fonts.semibold, color: '#008e87' },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#cfe8e8',
    borderRadius: 16,
    minHeight: 77,
  },
  actionIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#d8f0ee', alignItems: 'center', justifyContent: 'center' },
  quickText: { flex: 1, gap: 5 },
  quickTitle: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, color: '#123349' },
  quickSub: { fontSize: 10, fontFamily: fonts.sans, color: '#7890a4' },
  chevron: { fontSize: 24, color: '#7a9fa3' },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e7ec',
    borderRadius: 16,
    minHeight: 76,
  },
  candidateAvatar: { width: 43, height: 43, borderRadius: 12, backgroundColor: '#e6f2f7', alignItems: 'center', justifyContent: 'center' },
  candidateAvatarMuted: { backgroundColor: '#edf0f3' },
  candidateAvatarText: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: '#165477' },
  candidateAvatarTextMuted: { color: '#617a8f' },
  candidateData: { flex: 1, gap: 5 },
  candidateName: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, color: '#102c42' },
  candidateSub: { fontSize: 10, fontFamily: fonts.sans, color: '#7890a4' },
  requestHeading: { marginTop: 2 },
  requestCount: { fontSize: 10, fontFamily: fonts.sans, color: '#8c9fb0' },
  filters: { flexDirection: 'row', gap: 7 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: '#dce7eb', borderRadius: 999, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#e1f4f1', borderColor: '#9dd8d0' },
  chipText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, color: '#698297' },
  chipTextActive: { color: '#007c75' },
  empty: {
    padding: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#e0e9ef',
    borderRadius: 16,
    color: '#7890a4',
    textAlign: 'center',
    fontSize: 13,
    fontFamily: fonts.sans,
  },
});
