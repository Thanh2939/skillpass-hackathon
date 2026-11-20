import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Screen, SearchField, Tag } from '../components/ui';
import type { TagTone } from '../components/ui';
import { Icon } from '../components/Icon';
import { FloatingTabs } from '../components/FloatingTabs';
import { useApp } from '../store/AppContext';
import type { PartnerOrg, PartnerOrgStatus } from '../constants/mockData';
import { getPartnerApplications } from '../services/partnerApplications';
import type { PartnerApplication } from '../types/partnerApplications';

/**
 * Bảng điều khiển Quản trị viên (Admin Dashboard)
 * Duyệt tài khoản Doanh nghiệp / Trường học, xử lý đề xuất đơn vị chưa hợp tác từ sinh viên,
 * và quản lý quyền sử dụng relayer Avalanche do Admin tài trợ gas.
 *
 * Hồ sơ đăng ký tài khoản đối tác (partner applications) là một hàng chờ RIÊNG:
 * - Chỉ Admin mới tải qua service partnerApplications.
 * - Không trộn với partnerOrgs, không dùng approveOrganization cho application id.
 * - Mỗi hồ sơ mở màn riêng /admin/application/[id].
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
  { key: 'pending', label: 'Đối tác đăng ký' },
  { key: 'lead', label: 'Đề xuất từ sinh viên' },
  { key: 'verified', label: 'Đã cấp quyền' },
  { key: 'rejected', label: 'Đã từ chối' },
  { key: 'revoked', label: 'Đã thu hồi' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const APPLICATION_STATUS: Record<PartnerApplication['status'], { tone: TagTone; label: string }> = {
  pending: { tone: 'wait', label: 'Chờ xác minh' },
  provisioning: { tone: 'wait', label: 'Đang xác minh' },
  account_created: { tone: 'ok', label: 'Đã xác minh' },
  rejected: { tone: 'bad', label: 'Đã từ chối' },
};

/** Làm mới hàng chờ định kỳ, không chồng lấn request. */
const APPLICATIONS_REFRESH_MS = 60_000;

function formatApplicationTime(value?: string | null): string {
  if (!value) return 'Không rõ thời gian';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusTag(status: PartnerOrgStatus): { tone: TagTone; label: string } {
  if (status === 'verified') return { tone: 'ok', label: 'Đã xác minh' };
  if (status === 'pending') return { tone: 'wait', label: 'Chờ xác minh' };
  if (status === 'lead') return { tone: 'wait', label: 'SV đề xuất' };
  if (status === 'revoked') return { tone: 'bad', label: 'Đã thu hồi' };
  return { tone: 'bad', label: 'Đã từ chối' };
}

export function AdminHomeScreen() {
  const router = useRouter();
  const { partnerOrgs, certs, authUser } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<FilterKey>('all');
  const isAdmin = authUser?.role === 'admin';

  const [applications, setApplications] = useState<PartnerApplication[] | null>(null);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsUpdatedAt, setApplicationsUpdatedAt] = useState<Date | null>(null);
  const applicationsInFlight = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadApplications = useCallback(
    async (mode: 'initial' | 'manual' | 'background') => {
      if (!isAdmin) return;
      // Chặn request chồng lấn: nếu đang tải thì bỏ qua lượt mới.
      if (applicationsInFlight.current) return;
      applicationsInFlight.current = true;
      if (mountedRef.current) {
        setApplicationsLoading(true);
        if (mode !== 'background') setApplicationsError(null);
      }
      try {
        const list = await getPartnerApplications();
        if (!mountedRef.current) return;
        setApplications(list);
        setApplicationsError(null);
        setApplicationsUpdatedAt(new Date());
      } catch (error) {
        if (!mountedRef.current) return;
        // Giữ danh sách cũ (nếu có) nhưng không hiển thị "0 hồ sơ" như thành công.
        setApplicationsError(
          error instanceof Error && error.message
            ? error.message
            : 'Không tải được danh sách hồ sơ đăng ký tài khoản đối tác.',
        );
      } finally {
        applicationsInFlight.current = false;
        if (mountedRef.current) setApplicationsLoading(false);
      }
    },
    [isAdmin],
  );

  useFocusEffect(
    useCallback(() => {
      if (!isAdmin) return;
      void loadApplications('initial');
      const timer = setInterval(() => {
        void loadApplications('background');
      }, APPLICATIONS_REFRESH_MS);
      return () => clearInterval(timer);
    }, [isAdmin, loadApplications]),
  );

  const pendingCount = partnerOrgs.filter((o) => o.status === 'pending').length;
  const verifiedCount = partnerOrgs.filter((o) => o.status === 'verified').length;
  const leadCount = partnerOrgs.filter((o) => o.status === 'lead').length;
  const sbtCount = certs.filter((c) => c.status === 'issued' || c.status === 'approved').length;

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return partnerOrgs.filter((o) => {
      const matchTab = (active === 'all' && o.status !== 'lead') || (active !== 'all' && o.status === active);
      const haystack = normalize(`${o.name} ${o.taxCode} ${o.domain} ${o.email} ${o.contactPerson}`);
      return matchTab && haystack.includes(q);
    });
  }, [partnerOrgs, query, active]);
  const studentSuggestions = useMemo(() => partnerOrgs.filter((o) => o.status === 'lead'), [partnerOrgs]);

  /** Hàng chờ luôn ưu tiên hồ sơ mới, sau đó tới lịch sử đã xử lý. */
  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    const rank: Record<PartnerApplication['status'], number> = {
      pending: 0,
      provisioning: 1,
      account_created: 2,
      rejected: 3,
    };
    return [...applications].sort((a, b) => {
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });
  }, [applications]);

  const applicationQueue = useMemo(
    () => sortedApplications.filter((a) => a.status === 'pending' || a.status === 'provisioning'),
    [sortedApplications],
  );
  const applicationQueueCount = applicationQueue.length;

  const showApplicationSection = isAdmin && (active === 'all' || active === 'pending');
  const visibleApplications = active === 'pending' ? applicationQueue : sortedApplications;

  const applicationSummary =
    applications === null
      ? applicationsError
        ? 'Chưa tải được hàng chờ'
        : 'Đang tải hồ sơ...'
      : active === 'pending'
        ? `${applicationQueueCount} hồ sơ cần xử lý`
        : `${applicationQueueCount} cần xử lý · ${sortedApplications.length} tổng hồ sơ`;

  return (
    <Screen
      biz
      padTabs
      tabBar={
        <FloatingTabs
          biz
          activeKey="home"
          items={[
            { key: 'home', icon: 'biz', label: 'Đối tác' },
            { key: 'activity', icon: 'bell', label: 'Nhật ký' },
            { key: 'profile', icon: 'user', label: 'Hệ thống' },
          ]}
          onSelect={(k) => router.replace((k === 'home' ? '/admin' : `/admin/${k}`) as any)}
        />
      }
    >
      {/* Đầu trang thương hiệu Admin */}
      <View style={styles.brandHeader}>
        <View style={styles.brandMark}>
          <Icon name="ok" size={24} color="#fff" />
        </View>
        <View style={styles.brandName}>
          <Text style={styles.brandStrong}>SkillPass</Text>
          <Text style={styles.brandSpan}>SUPER ADMIN</Text>
        </View>
        <View style={styles.spacer} />
        <Pressable onPress={() => router.replace('/admin/activity' as any)} style={styles.topBtn} accessibilityLabel="Nhật ký">
          <Icon name="bell" size={19} color="#1E293B" />
          {pendingCount + applicationQueueCount > 0 ? <View style={styles.topDot} /> : null}
        </Pressable>
        <Pressable onPress={() => router.replace('/admin/profile' as any)} style={styles.topAvatar}>
          <Text style={styles.topAvatarText}>AD</Text>
        </Pressable>
      </View>

      {/* Banner Quản trị hệ thống */}
      <LinearGradient colors={['#1E1B4B', '#312E81', '#1E3A8A']} style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroBadgeText}>HỘI ĐỒNG THẨM ĐỊNH & QUẢN TRỊ</Text>
          <View style={styles.chainBadge}>
            <Icon name="ok" size={12} color="#A7F3D0" />
            <Text style={styles.chainBadgeText}>Hệ thống chính thức</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Quản lý Đối tác &{'\n'}Kích hoạt Tài khoản</Text>
        <Text style={styles.heroSub}>
          Xét duyệt thông tin trường học, doanh nghiệp và quản lý quyền phê duyệt chứng chỉ số.
        </Text>
      </LinearGradient>

      {/* Hàng chờ hồ sơ cấp tài khoản — tách biệt hoàn toàn với danh sách tổ chức */}
      {showApplicationSection ? (
        <View style={styles.applicationBox}>
          <View style={styles.applicationHead}>
            <View style={styles.applicationHeadText}>
              <Text style={styles.applicationTitle}>Hồ sơ đăng ký tài khoản đối tác</Text>
              <Text style={styles.applicationSub}>{applicationSummary}</Text>
              {applicationsUpdatedAt ? (
                <Text style={styles.applicationUpdated}>
                  Cập nhật lúc{' '}
                  {applicationsUpdatedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Làm mới hồ sơ đăng ký tài khoản đối tác"
              accessibilityState={{ disabled: applicationsLoading }}
              disabled={applicationsLoading}
              onPress={() => {
                void loadApplications('manual');
              }}
              style={[styles.refreshBtn, applicationsLoading && styles.refreshBtnDisabled]}
            >
              <Text style={styles.refreshText}>{applicationsLoading ? 'Đang tải...' : 'Làm mới'}</Text>
            </Pressable>
          </View>

          {applicationsError ? (
            <Text style={styles.applicationError}>
              {applicationsError}
              {applications
                ? ' Danh sách bên dưới có thể chưa phải bản mới nhất.'
                : ' Bấm "Làm mới" để thử lại.'}
            </Text>
          ) : null}

          {applications === null ? (
            applicationsLoading ? (
              <View style={styles.applicationLoading}>
                <ActivityIndicator size="small" color="#4338CA" />
                <Text style={styles.applicationLoadingText}>Đang tải hàng chờ hồ sơ...</Text>
              </View>
            ) : null
          ) : visibleApplications.length === 0 ? (
            <Text style={styles.applicationEmpty}>
              {active === 'pending'
                ? 'Không có hồ sơ tài khoản nào đang chờ xử lý.'
                : 'Chưa có hồ sơ đăng ký tài khoản đối tác.'}
            </Text>
          ) : (
            visibleApplications.map((application) => {
              const tag = APPLICATION_STATUS[application.status];
              const typeLabel = application.org_type === 'school' ? 'Trường học' : 'Doanh nghiệp';
              return (
                <Pressable
                  key={application.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Mở hồ sơ đăng ký tài khoản của ${application.name}`}
                  onPress={() => router.push(`/admin/application/${application.id}` as any)}
                  style={styles.applicationCard}
                >
                  <View style={styles.applicationIcon}>
                    <Icon
                      name={application.org_type === 'school' ? 'award' : 'biz'}
                      size={20}
                      color={application.org_type === 'school' ? '#3730A3' : '#166534'}
                    />
                  </View>
                  <View style={styles.applicationBody}>
                    <Text style={styles.applicationName}>{application.name}</Text>
                    <Text style={styles.applicationMeta} numberOfLines={1}>
                      {typeLabel} · {application.email}
                    </Text>
                    <Text style={styles.applicationTime}>
                      Gửi {formatApplicationTime(application.created_at)}
                      {application.contact_person ? ` · ${application.contact_person}` : ''}
                    </Text>
                  </View>
                  <Tag tone={tag.tone} biz>
                    {tag.label}
                  </Tag>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}

      {(active === 'all' || active === 'lead') ? (
        <View style={styles.applicationBox}>
          <Text style={styles.applicationTitle}>Đề xuất xác minh trường / đơn vị từ sinh viên</Text>
          <Text style={styles.applicationSub}>{studentSuggestions.length} yêu cầu · Đây là đề xuất từ sinh viên, không phải hồ sơ tạo tài khoản đối tác.</Text>
          {studentSuggestions.length === 0 ? <Text style={styles.applicationEmpty}>Chưa có đề xuất từ sinh viên.</Text> : studentSuggestions.map((org) => (
            <Pressable key={org.id} onPress={() => router.push(`/admin/org/${org.id}` as any)} style={styles.orgCard}>
              <View style={[styles.orgIcon, { backgroundColor: '#E0E7FF' }]}><Icon name="award" size={20} color="#3730A3" /></View>
              <View style={styles.orgBody}>
                <Text style={styles.orgTitle}>{org.name}</Text>
                <Text style={styles.orgSub}>{org.orgType === 'school' ? 'Trường học' : 'Doanh nghiệp'} · {org.email}</Text>
                <Text style={styles.orgMeta}>SV đề xuất: {org.proposedByStudent} · Gửi {org.submittedAt}</Text>
              </View>
              <Tag tone="wait" biz>SV đề xuất</Tag><Text style={styles.chev}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* 4 Ô Thống kê */}
      <View style={styles.statsRow}>
        <Pressable style={styles.statCard} onPress={() => setActive('pending')}>
          <Text style={styles.statLabel}>Chờ xét duyệt</Text>
          <Text style={[styles.statValue, { color: '#D97706' }]}>{pendingCount}</Text>
          <Text style={styles.statHint}>Đơn vị mới đăng ký</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => setActive('verified')}>
          <Text style={styles.statLabel}>Đối tác chính thức</Text>
          <Text style={[styles.statValue, { color: '#059669' }]}>{verifiedCount}</Text>
          <Text style={styles.statHint}>Đang hoạt động</Text>
        </Pressable>
      </View>
      <View style={styles.statsRow}>
        <Pressable style={styles.statCard} onPress={() => setActive('lead')}>
          <Text style={styles.statLabel}>Đề xuất từ SV</Text>
          <Text style={[styles.statValue, { color: '#2563EB' }]}>{leadCount}</Text>
          <Text style={styles.statHint}>Cần liên hệ mời</Text>
        </Pressable>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Huy hiệu SBT</Text>
          <Text style={[styles.statValue, { color: '#1E293B' }]}>{sbtCount}</Text>
          <Text style={styles.statHint}>Đã mint on-chain</Text>
        </View>
      </View>

      {/* Tìm kiếm & Bộ lọc */}
      {active !== 'lead' ? <>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Danh sách Tổ chức & Doanh nghiệp</Text>
        <Text style={styles.sectionCount}>{filtered.length} đơn vị</Text>
      </View>

      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Tìm tên công ty, trường, MST, tên miền..."
        accessibilityLabel="Tìm đơn vị đối tác"
      />
      </> : null}

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const isSel = active === f.key;
          return (
            <Pressable key={f.key} onPress={() => setActive(f.key)} style={[styles.chip, isSel && styles.chipActive]}>
              <Text style={[styles.chipText, isSel && styles.chipTextActive]}>
                {f.label}
                {f.key === 'pending' ? ` (${pendingCount})` : f.key === 'lead' ? ` (${leadCount})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Danh sách đơn vị */}
      {active !== 'lead' ? <>
      {filtered.length === 0 ? (
        <Text style={styles.empty}>Không có đơn vị nào trong mục này.</Text>
      ) : (
        filtered.map((org: PartnerOrg) => {
          const tag = statusTag(org.status);
          return (
            <Pressable
              key={org.id}
              onPress={() => router.push(`/admin/org/${org.id}` as any)}
              style={styles.orgCard}
            >
              <View
                style={[
                  styles.orgIcon,
                  org.orgType === 'school' ? { backgroundColor: '#E0E7FF' } : { backgroundColor: '#DCFCE7' },
                ]}
              >
                <Icon
                  name={org.orgType === 'school' ? 'award' : 'biz'}
                  size={20}
                  color={org.orgType === 'school' ? '#3730A3' : '#166534'}
                />
              </View>
              <View style={styles.orgBody}>
                <Text style={styles.orgTitle}>{org.name}</Text>
                <Text style={styles.orgSub}>
                  {org.orgType === 'school' ? 'Trường học' : 'Doanh nghiệp'} · @{org.domain}
                </Text>
                <Text style={styles.orgMeta}>
                  {org.status === 'lead'
                    ? `SV đề xuất: ${org.proposedByStudent} · Gửi ${org.submittedAt}`
                    : `MST: ${org.taxCode} · ${org.submittedAt}`}
                </Text>
              </View>
              <Tag tone={tag.tone} biz>
                {tag.label}
              </Tag>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          );
        })
      )}
      </> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { gap: 1 },
  brandStrong: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: -0.6, color: '#0F172A' },
  brandSpan: { fontSize: 9, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 1.5, color: '#4338CA' },
  spacer: { flex: 1 },
  topBtn: {
    position: 'relative',
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topDot: { position: 'absolute', right: 9, top: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' },
  topAvatar: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAvatarText: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: '#3730A3' },
  hero: {
    padding: 20,
    borderRadius: 20,
    gap: 8,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadgeText: { fontSize: 9.5, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 1, color: '#C7D2FE' },
  chainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(167, 243, 208, 0.35)',
  },
  chainBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, color: '#A7F3D0' },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', fontFamily: fonts.bold, color: '#fff', marginTop: 4 },
  heroSub: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sans, color: '#E0E7FF' },
  applicationBox: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    gap: 10,
  },
  applicationHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  applicationHeadText: { flex: 1, gap: 2 },
  applicationTitle: { fontSize: 14.5, fontWeight: '700', fontFamily: fonts.bold, color: '#1E1B4B' },
  applicationSub: { fontSize: 12, fontFamily: fonts.medium, color: '#4338CA' },
  applicationUpdated: { fontSize: 10.5, fontFamily: fonts.sans, color: '#64748B' },
  refreshBtn: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  refreshBtnDisabled: { opacity: 0.6 },
  refreshText: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: '#4338CA' },
  applicationError: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sans, color: '#B42318' },
  applicationLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  applicationLoadingText: { fontSize: 12, fontFamily: fonts.sans, color: '#475569' },
  applicationEmpty: { fontSize: 12, fontFamily: fonts.sans, color: '#64748B', paddingVertical: 4 },
  applicationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  applicationIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  applicationBody: { flex: 1, gap: 1 },
  applicationName: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold, color: '#0F172A' },
  applicationMeta: { fontSize: 11.5, fontFamily: fonts.medium, color: '#334155' },
  applicationTime: { fontSize: 10.5, fontFamily: fonts.sans, color: '#64748B' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 2,
  },
  statLabel: { fontSize: 11.5, fontWeight: '600', fontFamily: fonts.semibold, color: '#475569' },
  statValue: { fontSize: 26, lineHeight: 32, fontWeight: '700', fontFamily: fonts.bold, marginVertical: 2 },
  statHint: { fontSize: 11, fontFamily: fonts.sans, color: '#64748B' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#0F172A' },
  sectionCount: { fontSize: 12, fontFamily: fonts.medium, color: '#64748B' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  chipText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, color: '#475569' },
  chipTextActive: { color: '#4338CA' },
  orgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  orgIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  orgBody: { flex: 1, gap: 2 },
  orgTitle: { fontSize: 13.5, fontWeight: '700', fontFamily: fonts.bold, color: '#0F172A' },
  orgSub: { fontSize: 12, fontFamily: fonts.medium, color: '#334155' },
  orgMeta: { fontSize: 11, fontFamily: fonts.sans, color: '#64748B' },
  chev: { fontSize: 20, color: '#64748B' },
  empty: {
    padding: 22,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 13,
    fontFamily: fonts.sans,
    color: '#64748B',
  },
});
