import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Avatar, Button, Card, KV, Note, Screen, ScreenHeader, Tag } from '../components/ui';
import { Icon } from '../components/Icon';
import * as supabaseService from '../services/supabase';
import type { Cert } from '../constants/mockData';
import { SharedAccessGate } from '../components/SharedAccessGate';
import { useApp } from '../store/AppContext';

interface RemoteCandidate {
  name: string;
  mssv: string;
  school: string;
  email: string;
  initials: string;
  shareCode: string;
  walletAddress?: string;
}

/** Màn kết quả kiểm chứng mã QR của HR / Nhà tuyển dụng */
export function VerifyResultScreen({ code }: { code: string }) {
  const router = useRouter();
  const p = palette(true);
  const { authUser } = useApp();
  const [attempt, setAttempt] = useState(0);
  const [accessStatus, setAccessStatus] = useState('loading');
  const permissionVersion = `${code}|${authUser?.id || 'anonymous'}|${attempt}`;
  const [loadedFor, setLoadedFor] = useState('');

  const cleanCode = (code || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  const normalizedCode = cleanCode || 'SP-KHONGTONTAI';

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<RemoteCandidate | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [targetCompany, setTargetCompany] = useState<string>('Nhà tuyển dụng đối tác');
  const [isRevoked, setIsRevoked] = useState<boolean>(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    let sequence = 0;

    async function loadByCode() {
      const request = ++sequence;
      setLoading(true);
      setNotFound(false);
      setIsRevoked(false);
      setProfile(null);
      setCerts([]);

      try {
        const result = await supabaseService.getSharedProfile(normalizedCode);
        if (!active || request !== sequence) return;
        setAccessStatus(result.status);
        if (result.status !== 'ok') return;
        const userRow = result.profile;
        setTargetCompany(result.link?.target_company || 'Chia sẻ hồ sơ');
        if (userRow) {
          const fullName = userRow.full_name || userRow.email?.split('@')[0] || 'Sinh viên';
          const words = fullName.trim().split(/\s+/);
          const initials =
            words.length >= 2
              ? `${words[words.length - 2][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase()
              : fullName.slice(0, 2).toUpperCase();

          setProfile({
            name: fullName,
            mssv: userRow.mssv || '',
            school: userRow.school_name || 'Đang cập nhật',
            email: userRow.email || '',
            initials,
            shareCode: normalizedCode,
            walletAddress: userRow.wallet_address ?? undefined,
          });
          setAvatarUri(userRow.avatar_url || null);

          // Lấy danh sách chứng chỉ thật của sinh viên
          const certRows = result.certificates || [];
          if (active) {
            setCerts(
              certRows.map((row) => ({
                id: row.id,
                title: row.title,
                orgType: row.org_type === 'school' ? 'school' : 'company',
                org: row.org_name || 'Đơn vị cấp',
                issueDate: row.issue_date_original ?? undefined,
                status: row.status as Cert['status'],
                txHash: row.tx_hash ?? undefined,
              }))
            );
          }
        }
      } catch (err) {
        console.warn('Error loading verify data:', err);
        if (active && request === sequence) setAccessStatus('error');
      } finally {
        if (active && request === sequence) { setLoadedFor(permissionVersion); setLoading(false); }
      }
    }

    loadByCode();
    const refresh = setInterval(loadByCode, 60000);

    return () => {
      active = false;
      clearInterval(refresh);
    };
  }, [normalizedCode, permissionVersion]));

  const verifiedCerts = certs.filter((c) => c.status === 'issued' || c.status === 'approved');

  if (loading || loadedFor !== permissionVersion) {
    return (
      <Screen biz header={<ScreenHeader title="Đang đối soát hồ sơ" back biz />}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#008d83" />
          <Text style={styles.loadingTitle}>Đang đối soát thông tin hồ sơ...</Text>
          <Text style={styles.loadingSub}>Đang xác thực tính hợp lệ của mã hồ sơ {normalizedCode}</Text>
        </View>
      </Screen>
    );
  }

  if (accessStatus !== 'ok' || (!isRevoked && (notFound || !profile))) {
    return (
      <Screen
        biz
        header={<ScreenHeader title="Quyền truy cập hồ sơ" biz />}
        footer={<Button biz title="Thoát kiểm chứng" onPress={() => router.replace('/')} />}
      >
        <SharedAccessGate status={accessStatus} onRetry={() => setAttempt((value) => value + 1)} />
      </Screen>
    );
  }

  return (
    <Screen
      biz
      header={<ScreenHeader title={`Kiểm chứng ${normalizedCode}`} back biz />}
       footer={<><Button biz title="Quét mã ứng viên khác" onPress={() => router.replace('/scan')} /><Button biz variant="ghost" title="Thoát kiểm chứng" onPress={() => router.replace('/')} /></>}
    >
      {isRevoked ? (
        <View style={styles.revokedBox}>
          <View style={styles.revokedIcon}>
            <Icon name="x" size={28} color="#B42318" />
          </View>
          <Text style={styles.revokedTitle}>Liên kết đã bị thu hồi hoặc hết hạn</Text>
          <Text style={styles.revokedSub}>
            Mã chia sẻ {normalizedCode} đã bị chủ sở hữu vô hiệu hóa hoặc hết thời hạn truy cập. Vui lòng yêu cầu ứng viên cấp lại mã QR mới.
          </Text>
        </View>
      ) : profile ? (
        <>
          <LinearGradient
            colors={['#0F6B3E', '#09482A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.verifiedBanner}
          >
            <View style={styles.bannerTop}>
              <View style={styles.shieldCircle}>
                <Icon name="ok" size={22} color="#12B76A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Hồ sơ được chủ sở hữu chia sẻ</Text>
                <Text style={styles.bannerSub}>
                  Chứng nhận đã xác thực chính thức bởi đơn vị phát hành
                </Text>
              </View>
            </View>
            <View style={styles.profileRow}>
              <Avatar initials={profile.initials} uri={avatarUri} size={52} biz />
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{profile.name}</Text>
                <Text style={styles.studentMeta}>
                  {profile.mssv ? `MSSV ${profile.mssv}` : 'Sinh viên'}
                  {profile.school ? ` · ${profile.school}` : ''}
                </Text>
                {profile.email ? <Text style={styles.studentMeta}>{profile.email}</Text> : null}
              </View>
            </View>
          </LinearGradient>

          <Card biz>
            <KV label="Mã hồ sơ QR" value={normalizedCode} />
            <KV label="Đơn vị nhận hồ sơ" value={targetCompany} />
            <KV label="Tình trạng hồ sơ" value="Đang có hiệu lực chính thức" />
            <KV label="Nguồn dữ liệu" value="Hồ sơ phê duyệt trên SkillPass" />
          </Card>

          <View style={styles.sec}>
            <View style={[styles.bar, { backgroundColor: p.brand }]} />
            <Text style={[styles.secText, { color: p.ink }]}>
              Văn bằng & Chứng chỉ đã xác thực ({verifiedCerts.length})
            </Text>
          </View>

          {verifiedCerts.length === 0 ? (
            <View style={styles.emptyCertsBox}>
              <Text style={[styles.emptyCertsText, { color: p.mut }]}>
                Ứng viên hiện chưa có chứng chỉ nào được phê duyệt chính thức.
              </Text>
            </View>
          ) : (
            <View style={styles.certList}>
              {verifiedCerts.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push({ pathname: '/shared-cert/[id]', params: { id: c.id, code: normalizedCode } })}
                  style={styles.certItem}
                >
                  <View style={styles.certHead}>
                    <Text style={[styles.certTitle, { color: p.ink }]}>{c.title}</Text>
                    <Tag tone="ok" biz>Đã duyệt</Tag>
                  </View>
                  <Text style={[styles.certOrg, { color: p.mut }]}>Đơn vị cấp: {c.org}</Text>
                  <View style={styles.txRow}>
                    <Icon name="ok" size={14} color={p.ok} />
                    <Text style={styles.txText}>
                      Đã xác thực{c.issueDate ? ` · Ngày cấp: ${c.issueDate}` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <Note tone="info" title="Thông tin kiểm chứng" biz>
            Danh sách trên lấy từ hồ sơ đã được đơn vị phê duyệt trong SkillPass. Mã giao dịch, nếu có, không thay thế việc đối chiếu trực tiếp trạng thái chứng chỉ trên blockchain.
          </Note>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#102c42',
    textAlign: 'center',
  },
  loadingSub: {
    fontSize: 13,
    fontFamily: fonts.sans,
    color: '#7890a4',
    textAlign: 'center',
  },
  notFoundBox: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    gap: 12,
  },
  notFoundIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#92400E',
    textAlign: 'center',
  },
  notFoundSub: {
    fontSize: 13.5,
    lineHeight: 21,
    fontFamily: fonts.sans,
    color: '#78350F',
    textAlign: 'center',
  },
  verifiedBanner: {
    padding: 18,
    borderRadius: 20,
    gap: 14,
  },
  bannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  shieldCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#fff',
  },
  bannerSub: {
    fontSize: 12.5,
    fontFamily: fonts.sans,
    color: '#D1FADF',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  studentName: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#fff',
  },
  studentMeta: {
    fontSize: 12.5,
    fontFamily: fonts.sans,
    color: '#E6F4EA',
  },
  sec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  bar: { width: 4, height: 16, borderRadius: 2 },
  secText: { fontSize: 13.5, fontWeight: '700', fontFamily: fonts.bold },
  certList: { gap: 10 },
  emptyCertsBox: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  emptyCertsText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    textAlign: 'center',
    lineHeight: 20,
  },
  certItem: {
    padding: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C9DEC9',
    backgroundColor: '#fff',
    gap: 6,
  },
  certHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  certTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
  certOrg: {
    fontSize: 13,
    fontFamily: fonts.sans,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#EEF5EE',
  },
  txText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#1E7A46',
  },
  revokedBox: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FECDCA',
    backgroundColor: '#FEF3F2',
    gap: 10,
  },
  revokedIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE4E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokedTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#B42318',
    textAlign: 'center',
  },
  revokedSub: {
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: fonts.sans,
    color: '#7A271A',
    textAlign: 'center',
  },
});
