import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Avatar, Row, Screen, SwitchRow } from '../components/ui';
import { FloatingTabs } from '../components/FloatingTabs';
import { AvatarEditor } from '../components/AvatarEditor';
import { useApp } from '../store/AppContext';

/** Màn Hồ sơ Doanh nghiệp (hihi_fixed.html #profile) */
export function BizProfileScreen() {
  const router = useRouter();
  const { partnerOrgs, currentBizOrgId, authUser, signOut, saveOrganizationAvatar } = useApp();
  const [notifOn, setNotifOn] = useState(true);
  const activeOrg =
    partnerOrgs.find((o) => o.id === currentBizOrgId) ??
    (authUser
      ? partnerOrgs.find(
          (o) =>
            o.ownerUserId === authUser.id ||
            o.email.toLowerCase() === authUser.email.toLowerCase()
        )
      : undefined);
  const name = activeOrg ? activeOrg.name : 'Đơn vị đối tác';
  const mst = activeOrg ? activeOrg.taxCode : 'Đang cập nhật';
  const email = activeOrg ? activeOrg.email : authUser?.email || '';
  const initials = activeOrg
    ? activeOrg.name
        .split(' ')
        .slice(-2)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
    : 'BP';

  return (
    <Screen
      biz
      padTabs
      contentStyle={styles.body}
      tabBar={
        <FloatingTabs
          biz
          activeKey="profile"
          items={[
            { key: 'home', icon: 'wallet', label: 'Tổng quan' },
            { key: 'notif', icon: 'bell', label: 'Hoạt động' },
            { key: 'profile', icon: 'user', label: 'Đơn vị' },
          ]}
          onSelect={(k) => router.replace(k === 'home' ? '/biz' : `/biz/${k}`)}
        />
      }
    >
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Text style={styles.panelSmall}>THÔNG TIN ĐỐI TÁC</Text>
          <Text style={styles.panelTitle}>Doanh nghiệp</Text>
        </View>
        <View style={styles.me}>
          {activeOrg && activeOrg.ownerUserId === authUser?.id ? (
            <AvatarEditor biz initials={initials} uri={activeOrg.logoUrl} onSave={(uri) => saveOrganizationAvatar(activeOrg.id, uri)} />
          ) : <Avatar initials={initials} uri={activeOrg?.logoUrl} size={57} biz />}
          <View style={styles.meText}>
            <Text style={styles.meName}>{name}</Text>
            <Text style={styles.meSmall}>MST: {mst} · Tài khoản đối tác</Text>
            <Text style={styles.meSmall}>{email}</Text>
          </View>
        </View>
        <SwitchRow
          biz
          icon="bell"
          label="Nhận thông báo khi sinh viên gửi duyệt"
          value={notifOn}
          onChange={setNotifOn}
        />
        <Row
          biz
          icon="wallet"
          label="AVAX được tài trợ bởi ví Relayer của Admin"
        />
        <Row
          biz
          icon="out"
          label="Đăng xuất"
          danger
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 0, gap: 0, paddingBottom: 110 },
  panel: { flexGrow: 1, gap: 18, paddingHorizontal: 13, paddingBottom: 24, backgroundColor: '#f1f5f7' },
  panelHead: {
    marginHorizontal: -13,
    marginBottom: 5,
    paddingTop: 19,
    paddingHorizontal: 9,
    paddingBottom: 17,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dfe8ee',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  panelSmall: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 1.2, color: '#7890a4' },
  panelTitle: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bold, color: '#102c42', marginTop: 5 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e9ef', borderRadius: 20 },
  meText: { flex: 1, minWidth: 0 },
  meName: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: '#102c42', marginBottom: 6 },
  meSmall: { fontSize: 10, fontFamily: fonts.sans, lineHeight: 18, color: '#7890a4' },
});
