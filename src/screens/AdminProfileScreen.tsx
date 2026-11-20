import { useApp } from '../store/AppContext';
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Avatar, Card, KV, Note, Row, Screen, SwitchRow } from '../components/ui';
import { FloatingTabs } from '../components/FloatingTabs';
import { CHAIN_ID, getRelayerStatus, getSnowtraceAddressUrl, type RelayerStatus } from '../services/web3';

/**
 * Màn hình Cấu hình Hệ thống & Tài khoản Super Admin (/admin/profile)
 */
export function AdminProfileScreen() {
  const router = useRouter();
  const { signOut, authUser } = useApp();
  const [autoDomainKyc, setAutoDomainKyc] = useState(true);
  const [status, setStatus] = useState<RelayerStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    getRelayerStatus()
      .then(setStatus)
      .catch((err) => setStatusError(err?.message ?? 'Không kết nối được Avalanche relayer'));
  }, []);

  const contractReady = status?.totalBadges !== null && status?.totalBadges !== undefined;
  const funded = Number(status?.balance ?? 0) > 0;
  const ready = Boolean(contractReady && funded && status?.relayer);

  return (
    <Screen
      biz
      padTabs
      tabBar={
        <FloatingTabs
          biz
          activeKey="profile"
          items={[
            { key: 'home', icon: 'biz', label: 'Đối tác' },
            { key: 'activity', icon: 'bell', label: 'Nhật ký' },
            { key: 'profile', icon: 'user', label: 'Hệ thống' },
          ]}
          onSelect={(k) => router.replace((k === 'home' ? '/admin' : `/admin/${k}`) as any)}
        />
      }
    >
      <View style={styles.meCard}>
        <Avatar initials="AD" size={58} biz />
        <View style={styles.meText}>
          <Text style={styles.meRole}>QUẢN TRỊ VIÊN HỆ THỐNG</Text>
          <Text style={styles.meName}>Hội đồng Thẩm định SkillPass</Text>
          <Text style={styles.meEmail}>{authUser?.email ?? 'admin@skillpass.vn'}</Text>
        </View>
      </View>

      <Text style={styles.section}>Avalanche Fuji C-Chain</Text>
      <Card biz>
        <KV biz label="Mạng lưới" value={`Avalanche Fuji (Chain ID ${CHAIN_ID})`} />
        <KV
          biz
          label="Block hiện tại"
          value={status ? `#${status.blockNumber.toLocaleString('vi-VN')}` : statusError ? 'Lỗi kết nối' : 'Đang tải...'}
        />
        <KV
          biz
          label="Hợp đồng SkillBadgeSBT"
          value={status?.contractAddress || 'Chưa cấu hình'}
          copyable={Boolean(status?.contractAddress)}
        />
        <KV
          biz
          label="Ví Relayer (trả gas)"
          value={status?.relayer || 'Chưa cấu hình'}
          copyable={Boolean(status?.relayer)}
        />
        <KV biz label="Số dư Relayer" value={status?.balance ? `${Number(status.balance).toFixed(4)} AVAX` : '—'} />
        <KV biz label="Tổng SBT đã cấp" value={status?.totalBadges ?? '—'} last />
      </Card>

      {statusError ? (
        <Note biz tone="bad" title="Không kết nối được Avalanche relayer">
          {statusError}
        </Note>
      ) : status && !ready ? (
        <Note biz tone="bad" title="Blockchain chưa sẵn sàng">
          {!funded
            ? `Ví Relayer ${status.relayer ?? ''} chưa có AVAX thử nghiệm để trả gas.`
            : 'Ví đã có gas nhưng chưa tìm thấy bytecode SkillBadgeSBT trên Fuji. Cần deploy contract bằng đúng ví Relayer.'}
        </Note>
      ) : null}

      {!funded && status?.relayer ? (
        <Row
          biz
          icon="link"
          label="Mở faucet nhận AVAX Fuji thử nghiệm"
          chevron
          onPress={() => Linking.openURL('https://core.app/tools/testnet-faucet')}
        />
      ) : null}

      <Text style={styles.section}>Chính sách Bảo mật & Thẩm định</Text>
      <SwitchRow
        biz
        icon="ok"
        label="Cảnh báo nếu Đối tác dùng email cá nhân (@gmail.com)"
        value={autoDomainKyc}
        onChange={setAutoDomainKyc}
      />

      {status?.contractAddress ? (
        <Row
          biz
          icon="link"
          label="Xem hợp đồng trên Avalanche Explorer"
          chevron
          onPress={() => Linking.openURL(getSnowtraceAddressUrl(status.contractAddress as string))}
        />
      ) : null}
      <Row
        biz
        icon="out"
        label="Đăng xuất Quản trị viên"
        danger
        onPress={async () => { await signOut(); router.replace('/'); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  meText: { flex: 1, gap: 2 },
  meRole: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 1, color: '#4338CA' },
  meName: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#0F172A' },
  meEmail: { fontSize: 12.5, fontFamily: fonts.sans, color: '#64748B' },
  section: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: '#0F172A', marginTop: 4 },
});
