import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Hero, Note, Screen, ScreenHeader, SelectField, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';

/** Supabase báo đã vượt hạn mức gửi email — không phải người dùng nhập sai thông tin. */
const RATE_LIMIT_CODE = 'over_email_send_rate_limit';

/** Màn đăng ký sinh viên (design #register) */
export function RegisterScreen() {
  const router = useRouter();
  const p = palette(false);
  const { signUp, partnerOrgs } = useApp();
  const [fullName, setFullName] = useState('');
  const [mssv, setMssv] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [repass, setRepass] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  /** Email vừa tạo tài khoản nhưng Supabase yêu cầu xác nhận qua hộp thư */
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  /** Chặn bấm hai lần đồng bộ — state `loading` chỉ đổi ở lần render kế tiếp */
  const submittingRef = useRef(false);

  const verifiedSchools = partnerOrgs
    .filter((o) => o.orgType === 'school' && o.status === 'verified')
    .map((o) => o.name);

  const clearError = () => {
    if (errorMsg) setErrorMsg(null);
  };

  const handleRegister = async () => {
    if (submittingRef.current) return;
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorCode(null);
      setErrorMsg('Vui lòng nhập họ và tên sinh viên.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorCode(null);
      setErrorMsg('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    if (pass.length < 6) {
      setErrorCode(null);
      setErrorMsg('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }
    if (repass && pass !== repass) {
      setErrorCode(null);
      setErrorMsg('Mật khẩu nhập lại không trùng khớp.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await signUp({
        email: email.trim(),
        password: pass,
        fullName: fullName.trim(),
        role: 'student',
        mssv: mssv.trim() || '',
        schoolName: schoolName || '',
      });

      if (!res.ok) {
        const code = res.errorCode ?? null;
        setErrorCode(code);
        setErrorMsg(
          res.error ||
            (code === RATE_LIMIT_CODE
              ? 'Hệ thống đã gửi quá nhiều email xác nhận trong thời gian ngắn. Vui lòng thử lại sau.'
              : 'Không thể tạo tài khoản, vui lòng thử lại.'),
        );
        return;
      }

      // If hosted Auth still requires confirmation, never enter home without a session.
      if (res.needsConfirm) {
        setConfirmEmail(email.trim().toLowerCase());
        return;
      }

      router.replace('/home');
    } catch {
      setErrorCode(null);
      setErrorMsg('Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (confirmEmail) {
    return (
      <Screen header={<ScreenHeader title="Đăng ký tài khoản" back />}>
        <Hero
          sm
          title="Kiểm tra hộp thư"
          sub="Tài khoản đã được tạo, chỉ còn một bước xác nhận email là có thể đăng nhập."
        />
        <Note tone="ok" title="Đã tạo tài khoản">
          {`SkillPass đã gửi email xác nhận tới ${confirmEmail}. Mở hộp thư đến và kiểm tra cả mục Spam/Thư rác, bấm vào link xác nhận rồi quay lại đăng nhập.`}
        </Note>
        <Note tone="info" title="Chưa thấy email xác nhận?">
          Kiểm tra lại địa chỉ email và thư mục Spam/Thư rác. Nếu vẫn chưa thấy, hãy chờ một lúc rồi thử đăng nhập lại —
          hệ thống không tự gửi lại để tránh vượt hạn mức email.
        </Note>
        <Button title="Tới trang đăng nhập" onPress={() => router.replace('/login')} />
        <Button
          variant="ghost"
          title="Dùng email khác"
          onPress={() => {
            setConfirmEmail(null);
            setPass('');
            setRepass('');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader title="Đăng ký tài khoản" back />}>
      <Hero sm title="Chào bạn mới!" sub="Tạo tài khoản để bắt đầu lưu trữ và chia sẻ hồ sơ chứng chỉ số của bạn." />
      {errorMsg ? (
        <Note
          tone="bad"
          title={errorCode === RATE_LIMIT_CODE ? 'Chưa gửi được email xác nhận' : 'Kiểm tra thông tin'}
        >
          {errorMsg}
        </Note>
      ) : null}
      <TextField
        label="Họ và tên sinh viên"
        placeholder="Ví dụ: Trần Văn An"
        value={fullName}
        onChangeText={(t) => {
          setFullName(t);
          clearError();
        }}
      />
      <TextField
        label="Mã số sinh viên (MSSV)"
        placeholder="Ví dụ: 22520123"
        value={mssv}
        onChangeText={setMssv}
      />
      {verifiedSchools.length > 0 ? (
        <SelectField
          label="Trường đang theo học (tuỳ chọn)"
          placeholder="Chọn trường đại học / cao đẳng đã hợp tác"
          value={schoolName}
          onChange={setSchoolName}
          options={verifiedSchools.map((s) => ({ label: s, value: s }))}
        />
      ) : null}
      <TextField
        label="Email đăng nhập"
        placeholder="ten@gmail.com hoặc email sinh viên"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          clearError();
        }}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextField
        label="Mật khẩu"
        placeholder="Tối thiểu 6 ký tự"
        value={pass}
        onChangeText={(t) => {
          setPass(t);
          clearError();
        }}
        secureTextEntry
      />
      <TextField
        label="Nhập lại mật khẩu"
        placeholder="Nhập lại mật khẩu"
        value={repass}
        onChangeText={(t) => {
          setRepass(t);
          clearError();
        }}
        secureTextEntry
      />
      <Button
        title={loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
        disabled={loading}
        onPress={handleRegister}
      />
      <Pressable onPress={() => router.back()} style={styles.linkBtn}>
        <Text style={[styles.link, { color: p.brand }]}>Đã có tài khoản? Đăng nhập</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkBtn: { alignItems: 'center', paddingVertical: 4 },
  link: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
});
