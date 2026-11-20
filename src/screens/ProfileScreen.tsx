import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Row, Screen, ScreenHeader, SwitchRow } from '../components/ui';
import { AvatarEditor } from '../components/AvatarEditor';
import { FloatingTabs } from '../components/FloatingTabs';
import { useApp } from '../store/AppContext';

/** Màn Hồ sơ cá nhân (design #profile) */
export function ProfileScreen() {
  const router = useRouter();
  const p = palette(false);
  const { avatarUri, setAvatarUri, student, signOut } = useApp();
  const [pushOn, setPushOn] = useState(true);

  return (
    <Screen
      header={<ScreenHeader title="Hồ sơ" />}
      padTabs
      tabBar={
        <FloatingTabs
          activeKey="profile"
          items={[
            { key: 'home', icon: 'wallet', label: 'Ví' },
            { key: 'notif', icon: 'bell', label: 'Thông báo' },
            { key: 'profile', icon: 'user', label: 'Hồ sơ' },
          ]}
          onSelect={(k) => router.replace(k === 'home' ? '/home' : `/${k}`)}
        />
      }
    >
      <View style={styles.me}>
        <AvatarEditor initials={student.initials} uri={avatarUri} onSave={setAvatarUri} />
        <View style={styles.meText}>
          <Text style={[styles.name, { color: p.ink }]}>{student.name}</Text>
          <Text style={[styles.small, { color: p.mut }]}>{[student.mssv ? `MSSV ${student.mssv}` : '', student.school].filter(Boolean).join(' · ')}</Text>
          <Text style={[styles.small, { color: p.mut }]}>{student.email}</Text>
        </View>
      </View>
      <Row icon="award" label="Cập nhật trường đang theo học" onPress={() => router.push('/school')} chevron />
      <Row icon="link" label="Quản lý link và QR để chia sẻ" onPress={() => router.push('/shared')} chevron />
      <Row icon="up" label="Chứng chỉ đang chờ duyệt" onPress={() => router.push('/pending')} chevron />
      <SwitchRow icon="bell" label="Thông báo đẩy qua điện thoại" value={pushOn} onChange={setPushOn} />
      <Row
        icon="out"
        label="Đăng xuất"
        danger
        onPress={async () => {
          await signOut();
          router.replace('/');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#DCE6FA' },
  meText: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 17, fontWeight: '700', fontFamily: fonts.bold },
  small: { fontSize: 12.5, fontFamily: fonts.sans },
});
