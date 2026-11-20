import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Hero, Note, Screen, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';
import { Or } from './LoginScreen';

/** Màn đăng nhập Doanh nghiệp (hihi_fixed.html #login) */
export function BizLoginScreen() {
  const router = useRouter();
  const p = palette(true);
  const { signIn } = useApp();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMsg(null);
    const normalized = email.trim().toLowerCase();

    if (!normalized || !normalized.includes('@')) {
      setErrorMsg('Vui lòng nhập email của trường học hoặc doanh nghiệp đã đăng ký.');
      return;
    }

    if (!pass) {
      setErrorMsg('Vui lòng nhập mật khẩu.');
      return;
    }

    setLoading(true);
    const res = await signIn(normalized, pass, 'business');
    setLoading(false);

    if (!res.ok) {
      setErrorMsg(/banned|ban duration|user_banned/i.test(res.error || '')
        ? 'Tài khoản đã được tạo và đang chờ Admin duyệt hồ sơ.'
        : res.error || 'Sai email hoặc mật khẩu doanh nghiệp.');
      return;
    }

    if (res.orgStatus === 'verified') {
      router.replace('/biz');
    } else {
      router.replace('/biz/pending' as any);
    }
  };

  return (
    <Screen biz>
      <Hero
        biz
        duck="tie"
        title="SkillPass"
        sub="Cổng xác thực ứng viên & ký số chứng nhận cho Doanh nghiệp."
      />
      {errorMsg ? (
        <Note biz tone="bad" title="Không thể đăng nhập">
          {errorMsg}
        </Note>
      ) : null}
      <TextField
        label="Email doanh nghiệp"
        placeholder="hr@congty.vn"
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
      <Button biz title={loading ? 'Đang đăng nhập...' : 'Đăng nhập Doanh nghiệp'} disabled={loading} onPress={handleLogin} />
      <Or label="Đơn vị chưa có tài khoản đối tác?" />
      <Button biz title="Đăng ký hợp tác" variant="ghost" onPress={() => router.push('/biz/register')} />
      <Pressable onPress={() => router.replace('/')} style={styles.linkBtn}>
        <Text style={[styles.link, { color: p.brand }]}>Đổi vai trò</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkBtn: { alignItems: 'center', paddingVertical: 2 },
  link: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
});
