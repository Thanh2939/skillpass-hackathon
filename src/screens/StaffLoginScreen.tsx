import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Note, Screen, ScreenHeader, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';
import { fonts } from '../theme';

/** Cổng nội bộ; không đăng ký admin và không chọn vai trò khách hàng. */
export function StaffLoginScreen() {
  const router = useRouter();
  const { signIn } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = async () => {
    if (busy) return;
    if (!email.trim() || !password) {
      setError('Vui lòng nhập email và mật khẩu do công ty cấp.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await signIn(email, password, 'admin');
      if (!result.ok) setError(result.error || 'Không đăng nhập được.');
      else router.replace('/admin');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen biz header={<ScreenHeader biz title="Nhân viên SkillPass" />}>
      <Text style={styles.title}>Đăng nhập nội bộ</Text>
      <Text style={styles.description}>Chỉ dành cho nhân viên được SkillPass cấp tài khoản quản trị. Không có chức năng tự đăng ký.</Text>
      <TextField label="Email công ty cấp" placeholder="Email nhân viên" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextField label="Mật khẩu" placeholder="Mật khẩu công ty cấp" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Note biz tone="bad" title="Không thể đăng nhập">{error}</Note> : null}
      <Button biz title={busy ? 'Đang đăng nhập...' : 'Đăng nhập quản trị'} disabled={busy} onPress={login} />
      <Button biz variant="ghost" title="Về trang khách hàng" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.displaybold, fontSize: 28, color: '#102c42', marginTop: 20 },
  description: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: '#5E6F96' },
});
