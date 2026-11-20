import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Hero, Note, Screen, TextField } from '../components/ui';
import { completePartnerSetup } from '../services/partnerApplications';
import { fonts, palette } from '../theme';

const TOKEN_RE = /^[a-f0-9]{64}$/;

function readToken(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim().toLowerCase();
}

function validate(password: string, confirm: string): string | null {
  if (password.length < 10) return 'Mật khẩu cần ít nhất 10 ký tự.';
  if (password.length > 128) return 'Mật khẩu tối đa 128 ký tự.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Mật khẩu cần có cả chữ và số.';
  if (password !== confirm) return 'Mật khẩu nhập lại không khớp.';
  return null;
}

/**
 * One-time link sent by Admin after a partner application is approved.
 * The partner chooses their own password; the link is consumed by the server.
 */
export function BizSetPasswordScreen() {
  const router = useRouter();
  const p = palette(true);
  const params = useLocalSearchParams();
  const token = readToken(params.token);
  const tokenValid = TOKEN_RE.test(token);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (loading || !tokenValid || expired || done) return;
    const problem = validate(password, confirm);
    setErrorMsg(problem);
    if (problem) return;

    setLoading(true);
    try {
      await completePartnerSetup(token, password);
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 410) {
        setExpired(true);
        setErrorMsg(null);
      } else {
        setErrorMsg(error instanceof Error ? error.message : 'Chưa đặt được mật khẩu. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const goLogin = () => router.replace('/biz/login');

  return (
    <Screen biz>
      <Hero
        biz
        duck="tie"
        title="Tạo mật khẩu"
        sub="Đặt mật khẩu đăng nhập cho tài khoản đối tác đã được duyệt."
      />

      {!tokenValid ? (
        <Note biz tone="bad" title="Link không hợp lệ">
          Đường dẫn này thiếu mã đặt mật khẩu. Hãy mở lại đúng link Admin gửi cho đơn vị của bạn.
        </Note>
      ) : expired ? (
        <Note biz tone="bad" title="Link đã hết hạn">
          Link đặt mật khẩu chỉ dùng một lần và hết hạn sau 24 giờ. Hãy liên hệ Admin SkillPass để được cấp lại.
        </Note>
      ) : done ? (
        <Note biz tone="ok" title="Đã đặt mật khẩu">
          Bây giờ bạn có thể đăng nhập bằng email đối tác và mật khẩu vừa tạo.
        </Note>
      ) : errorMsg ? (
        <Note biz tone="bad" title="Chưa đặt được mật khẩu">
          {errorMsg}
        </Note>
      ) : null}

      {done || expired || !tokenValid ? (
        <Button biz title="Tới trang đăng nhập đối tác" onPress={goLogin} />
      ) : (
        <>
          <TextField
            label="Mật khẩu mới"
            placeholder="Ít nhất 10 ký tự, gồm chữ và số"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (errorMsg) setErrorMsg(null);
            }}
            secureTextEntry
            autoCapitalize="none"
          />
          <TextField
            label="Nhập lại mật khẩu"
            placeholder="Nhập lại mật khẩu mới"
            value={confirm}
            onChangeText={(t) => {
              setConfirm(t);
              if (errorMsg) setErrorMsg(null);
            }}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button
            biz
            title={loading ? 'Đang lưu...' : 'Lưu mật khẩu'}
            disabled={loading}
            onPress={handleSubmit}
          />
          <View style={styles.hintWrap}>
            <Text style={[styles.hint, { color: p.mut }]}>
              Link này chỉ dùng được một lần. Sau khi lưu, bạn hãy đăng nhập và đổi lại mật khẩu nếu cần.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hintWrap: { paddingHorizontal: 4, paddingTop: 4 },
  hint: { fontSize: 13, lineHeight: 19, fontFamily: fonts.sans },
});
