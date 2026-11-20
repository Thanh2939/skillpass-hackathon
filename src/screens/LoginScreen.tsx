import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Hero, Note, Screen, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';

/** Màn đăng nhập sinh viên (design #login) */
export function LoginScreen() {
  const router = useRouter();
  const p = palette(false);
  const { signIn } = useApp();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMsg(null);
    const normalized = email.trim().toLowerCase();

    if (!normalized || !normalized.includes('@')) {
      setErrorMsg('Vui lòng nhập địa chỉ email tài khoản đã đăng ký.');
      return;
    }

    if (!pass) {
      setErrorMsg('Vui lòng nhập mật khẩu.');
      return;
    }

    setLoading(true);
    const res = await signIn(normalized, pass);
    setLoading(false);

    if (!res.ok) {
      setErrorMsg(res.error || 'Sai email hoặc mật khẩu.');
      return;
    }

    router.replace('/home');
  };

  return (
    <Screen>
      <Hero title="SkillPass" sub="Hồ sơ năng lực số, kiểm chứng trong 1 giây." />
      {errorMsg ? (
        <Note tone="bad" title="Không thể đăng nhập">
          {errorMsg}
        </Note>
      ) : null}
      <TextField
        label="Email tài khoản"
        placeholder="Nhập email sinh viên đã đăng ký"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (errorMsg) setErrorMsg(null);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextField
        label="Mật khẩu"
        placeholder="Nhập mật khẩu"
        value={pass}
        onChangeText={(t) => {
          setPass(t);
          if (errorMsg) setErrorMsg(null);
        }}
        secureTextEntry
      />
      <Button title={loading ? 'Đang đăng nhập...' : 'Đăng nhập'} disabled={loading} onPress={handleLogin} />
      <Or label="Chưa có tài khoản?" />
      <Button title="Đăng ký tài khoản mới" variant="ghost" onPress={() => router.push('/register')} />
      <Pressable onPress={() => router.replace('/')} style={styles.linkBtn}>
        <Text style={[styles.link, { color: p.brand }]}>Đổi vai trò</Text>
      </Pressable>
    </Screen>
  );
}

/** Dòng phân cách "hoặc" (thay .or trong CSS) */
export function Or({ label = 'hoặc' }: { label?: string }) {
  return (
    <View style={styles.or}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>{label}</Text>
      <View style={styles.orLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  linkBtn: { alignItems: 'center', paddingVertical: 2 },
  link: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: '#DCE6FA' },
  orText: { fontSize: 13, fontFamily: fonts.sans, color: '#5E6F96' },
});
