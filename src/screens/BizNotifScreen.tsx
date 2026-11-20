import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Screen, ScreenHeader, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import { FloatingTabs } from '../components/FloatingTabs';
import { useApp } from '../store/AppContext';
import type { BizNotif, BizRequest } from '../constants/mockData';

/**
 * Hoạt động của Doanh nghiệp / Trường học.
 * - Yêu cầu đang chờ: hiển thị đầy đủ hồ sơ ngay trong thẻ + nút mở hồ sơ.
 * - Nhật ký: mở rộng để đọc toàn bộ nội dung, có nút điều hướng đúng hồ sơ.
 */

function InfoRow({ label, value, biz }: { label: string; value: string; biz: boolean }) {
  const p = palette(biz);
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: p.mut }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: p.ink }]}>{value}</Text>
    </View>
  );
}

function evidenceSummary(request: BizRequest): string {
  const files = request.evidenceFiles ?? [];
  if (files.length > 0) {
    return files.length === 1 ? files[0].name : `${files.length} tệp minh chứng`;
  }
  if (request.evidence) return request.evidence;
  if (request.evidenceUrl) return 'Có tệp minh chứng đính kèm';
  return 'Chưa có tệp minh chứng';
}

const STATUS_META = {
  pending: { tone: 'wait', label: 'Chờ duyệt' },
  approved: { tone: 'ok', label: 'Đã duyệt' },
  rejected: { tone: 'bad', label: 'Đã từ chối' },
} as const;

/** Thông tin hồ sơ đầy đủ hiển thị ngay khi mở rộng nhật ký (không cần đoán). */
function RequestDetails({ request }: { request: BizRequest }) {
  const status = STATUS_META[request.status];
  return (
    <View style={styles.detailBox}>
      <View style={styles.detailHead}>
        <Text style={styles.detailTitle}>Thông tin hồ sơ</Text>
        <Tag tone={status.tone} biz>
          {status.label}
        </Tag>
      </View>
      <InfoRow biz label="Sinh viên" value={request.student} />
      <InfoRow biz label="MSSV" value={request.mssv || 'Chưa cập nhật'} />
      <InfoRow biz label="Chứng chỉ" value={request.title} />
      <InfoRow biz label="Trường đào tạo" value={request.school || 'Chưa cập nhật'} />
      <InfoRow biz label="Đơn vị cấp" value={request.org || 'Chưa cập nhật'} />
      <InfoRow biz label="Ngày gửi" value={request.date} />
      {request.timeRange ? <InfoRow biz label="Thời gian cấp" value={request.timeRange} /> : null}
      <InfoRow biz label="Minh chứng" value={evidenceSummary(request)} />
      {request.rejectionReason ? (
        <InfoRow biz label="Lý do từ chối" value={request.rejectionReason} />
      ) : null}
    </View>
  );
}

export function BizNotifScreen() {
  const router = useRouter();
  const p = palette(true);
  const { bizRequests, bizNotifs } = useApp();
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const pendingReqs = bizRequests.filter((r) => r.status === 'pending');

  /**
   * Tìm hồ sơ tương ứng với thông báo:
   * 1. certificateId ↔ BizRequest.certificateId (UUID gốc)
   * 2. certificateId ↔ BizRequest.id (một số dữ liệu cũ dùng slug id)
   * 3. Chỉ khi thiếu ID: khớp title chính xác và duy nhất (không đoán theo từ khoá).
   */
  const resolveRequest = (notif: BizNotif): BizRequest | undefined => {
    if (notif.certificateId) {
      const byCertificate = bizRequests.find((r) => r.certificateId === notif.certificateId);
      if (byCertificate) return byCertificate;
      const bySlug = bizRequests.find((r) => r.id === notif.certificateId);
      if (bySlug) return bySlug;
      return undefined;
    }
    const exact = bizRequests.filter((r) => r.title === notif.title);
    return exact.length === 1 ? exact[0] : undefined;
  };

  const openNotifTarget = (notif: BizNotif, request?: BizRequest) => {
    if (request) {
      router.push({ pathname: '/biz/review', params: { id: request.id } } as any);
      return;
    }
    // Không xác định được hồ sơ → đưa về danh sách thay vì mở trang trống.
    if (notif.targetRoute && notif.targetRoute.startsWith('/biz') && !notif.targetRoute.startsWith('/biz/review')) {
      router.push(notif.targetRoute as any);
      return;
    }
    router.push('/biz');
  };

  const openRequest = (request: BizRequest) => {
    router.push({ pathname: '/biz/review', params: { id: request.id } } as any);
  };

  return (
    <Screen
      biz
      header={<ScreenHeader biz title="Hoạt động" />}
      padTabs
      tabBar={
        <FloatingTabs
          biz
          activeKey="notif"
          items={[
            { key: 'home', icon: 'wallet', label: 'Tổng quan' },
            { key: 'notif', icon: 'bell', label: 'Hoạt động' },
            { key: 'profile', icon: 'user', label: 'Đơn vị' },
          ]}
          onSelect={(k) => router.replace(k === 'home' ? '/biz' : `/biz/${k}`)}
        />
      }
    >
      <Text style={styles.section}>Yêu cầu cần xử lý ({pendingReqs.length})</Text>
      {pendingReqs.length === 0 ? (
        <View style={styles.nt}>
          <Text style={[styles.ntBody, { color: p.mut }]}>Hiện không có yêu cầu nào đang chờ duyệt.</Text>
        </View>
      ) : (
        pendingReqs.map((r) => (
          <View key={r.id} style={styles.reqCard}>
            <View style={styles.reqHead}>
              <View style={styles.reqIcon}>
                <Icon name="award" size={20} color="#0f766e" />
              </View>
              <View style={styles.reqTitleWrap}>
                <Text style={[styles.reqTitle, { color: p.ink }]}>{r.title}</Text>
                <Text style={[styles.reqStudent, { color: p.mut }]}>
                  {r.student}
                  {r.mssv ? ` · MSSV ${r.mssv}` : ''}
                </Text>
              </View>
              <Tag tone="wait" biz>
                Chờ duyệt
              </Tag>
            </View>

            <View style={styles.infoBox}>
              <InfoRow biz label="Trường đào tạo" value={r.school || 'Chưa cập nhật'} />
              <InfoRow biz label="Đơn vị cấp" value={r.org || 'Chưa cập nhật'} />
              <InfoRow biz label="Ngày gửi" value={r.date} />
              {r.timeRange ? <InfoRow biz label="Thời gian cấp" value={r.timeRange} /> : null}
              <InfoRow biz label="Minh chứng" value={evidenceSummary(r)} />
            </View>

            <Pressable
              onPress={() => openRequest(r)}
              accessibilityRole="button"
              accessibilityLabel={`Xem hồ sơ ${r.title} của ${r.student}`}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryText}>Xem hồ sơ &amp; minh chứng</Text>
              <Text style={styles.primaryChev}>›</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.section}>Nhật ký xác thực &amp; ký số</Text>
      {bizNotifs.length === 0 ? (
        <View style={styles.nt}>
          <Text style={[styles.ntBody, { color: p.mut }]}>Chưa có hoạt động ký số nào.</Text>
        </View>
      ) : (
        bizNotifs.map((n, idx) => {
          const key = n.id ?? `${n.title}_${idx}`;
          const expanded = selectedLog === key;
          const linked = resolveRequest(n);
          return (
            <View key={key} style={styles.logWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${n.title}. ${expanded ? 'Thu gọn' : 'Xem chi tiết'}`}
                onPress={() => setSelectedLog(expanded ? null : key)}
                style={[styles.nt, expanded && { borderColor: '#bfe0dc' }]}
              >
                <View style={[styles.ntIcon, { backgroundColor: n.tone === 'ok' ? p.okbg : p.badbg }]}>
                  <Icon name={n.icon} size={20} color={n.tone === 'ok' ? p.ok : p.bad} />
                </View>
                <View style={styles.ntText}>
                  <Text style={[styles.ntTitle, { color: p.ink }]}>{n.title}</Text>
                  <Text
                    selectable={expanded}
                    style={[styles.ntBody, { color: p.mut }]}
                    numberOfLines={expanded ? undefined : 2}
                  >
                    {n.body}
                  </Text>
                  {expanded && n.why ? <Text style={[styles.why, { color: '#8F2022' }]}>{n.why}</Text> : null}
                  <Text style={[styles.ntTime, { color: p.mut }]}>
                    {expanded ? n.time : `${n.time} · Xem chi tiết`}
                  </Text>
                </View>
                <View
                  style={{ alignSelf: 'flex-start', transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                >
                  <Icon name="chev" color={p.mut} size={18} />
                </View>
              </Pressable>

              {expanded ? (
                <View style={styles.expanded}>
                  {linked ? (
                    <RequestDetails request={linked} />
                  ) : (
                    <View style={styles.detailMissing}>
                      <Text style={[styles.detailMissingText, { color: p.mut }]}>
                        Thông báo này không gắn với hồ sơ nào trong danh sách hiện tại. Mở danh sách yêu cầu để đối
                        chiếu thủ công.
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => openNotifTarget(n, linked)}
                    accessibilityRole="button"
                    style={styles.logAction}
                  >
                    <Text style={styles.logActionText}>
                      {linked ? `Xem hồ sơ của ${linked.student}` : 'Xem danh sách yêu cầu'}
                    </Text>
                    <Text style={styles.logActionChev}>›</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#102c42' },
  nt: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2ebf0',
    borderRadius: 18,
    backgroundColor: '#fff',
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
    backgroundColor: '#fff0f0',
  },
  ntTime: { fontSize: 12, fontFamily: fonts.sans },

  reqCard: {
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: '#cfe4e1',
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  reqHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reqIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#e4f3f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqTitleWrap: { flex: 1, gap: 2 },
  reqTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold },
  reqStudent: { fontSize: 12.5, fontFamily: fonts.sans },
  infoBox: {
    gap: 1,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f7fafb',
    borderWidth: 1,
    borderColor: '#e8eff2',
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  infoLabel: { fontSize: 12, fontFamily: fonts.sans, flexShrink: 0 },
  infoValue: { flex: 1, fontSize: 12.5, fontFamily: fonts.semibold, textAlign: 'right' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#008d83',
  },
  primaryText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, color: '#fff' },
  primaryChev: { fontSize: 19, color: '#fff', marginTop: -2 },

  logWrap: { gap: 0 },
  expanded: { gap: 8, marginTop: 6 },
  detailBox: {
    gap: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f7fafb',
    borderWidth: 1,
    borderColor: '#e8eff2',
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
  },
  detailTitle: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: '#0f766e', letterSpacing: 0.2 },
  detailMissing: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#dbe6ea',
    backgroundColor: '#fafcfc',
  },
  detailMissingText: { fontSize: 12.5, fontFamily: fonts.sans, lineHeight: 19 },
  logAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#cfe4e1',
    borderRadius: 12,
    backgroundColor: '#f0f9f7',
  },
  logActionText: { fontSize: 12.5, fontWeight: '600', fontFamily: fonts.semibold, color: '#007c75' },
  logActionChev: { fontSize: 17, color: '#007c75' },
});
