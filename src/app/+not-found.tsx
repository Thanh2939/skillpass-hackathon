import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Button, Screen, ScreenHeader } from '../components/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen header={<ScreenHeader title="Không tìm thấy trang" />}>
      <View style={styles.center}>
        <Text style={styles.emoji}>🔍</Text>
        <Text style={styles.title}>Đường dẫn không tồn tại</Text>
        <Text style={styles.desc}>
          Liên kết bạn vừa truy cập có thể đã bị di chuyển, hết hạn hoặc không chính xác.
        </Text>
        <Button
          title="Quay về trang chủ"
          onPress={() => router.replace('/')}
          style={{ width: '100%', maxWidth: 280, marginTop: 16 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emoji: {
    fontSize: 56,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#16264F',
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    fontFamily: fonts.sans,
    color: '#5E6F96',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
});
