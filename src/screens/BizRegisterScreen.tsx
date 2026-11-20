import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Hero, Note, Screen, ScreenHeader, SelectField, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';
import { submitPartnerApplication } from '../services/partnerApplications';

/**
 * Màn đăng ký Đối tác (Doanh nghiệp / Trường học).
 *
 * Hai luồng được phân biệt rõ:
 * 1. Khách chưa đăng nhập tạo Auth user với email/mật khẩu; tài khoản bị khóa
 *    cho đến khi Admin duyệt hồ sơ.
 * 2. Đang đăng nhập bằng tài khoản đối tác cũ → giữ luồng hoàn tất hồ sơ đơn vị
 *    qua registerOrganization(), sau đó có thể xem trạng thái hồ sơ.
 * 3. Đang đăng nhập bằng tài khoản khác (sinh viên/admin) → yêu cầu đăng xuất,
 *    tuyệt đối không gửi hồ sơ nhầm tài khoản.
 */

type StatusTone = 'ok' | 'bad' | 'info';

interface Status {
  tone: StatusTone;
  title: string;
  body: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

interface SubmittedApplication {
  name: string;
  email: string;
  /** true: đã đăng nhập tài khoản đối tác cũ; false: tài khoản mới chờ duyệt */
  viaAccount: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function BizRegisterScreen() {
  const router = useRouter();
  const p = palette(true);
  const { registerOrganization, signOut, authUser, authReady, partnerOrgs, currentBizOrgId } = useApp();
  const [orgType, setOrgType] = useState<'company' | 'school'>('company');
  const [name, setName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  /** Hồ sơ đã gửi thành công — chờ người dùng chủ động xem lại hoặc sửa */
  const [submitted, setSubmitted] = useState<SubmittedApplication | null>(null);
  /** Chặn bấm hai lần đồng bộ — state `loading` chỉ đổi ở lần render kế tiếp */
  const submittingRef = useRef(false);

  const businessSession = authUser?.role === 'business';
  const sessionConflict = Boolean(authUser) && !businessSession;
  const email = businessSession && authUser ? authUser.email : emailInput;
  const existingOrg =
    partnerOrgs.find((o) => o.id === currentBizOrgId) ??
    (authUser
      ? partnerOrgs.find(
          (o) => o.ownerUserId === authUser.id || o.email.toLowerCase() === authUser.email.toLowerCase(),
        )
      : undefined);

  const clearField = (key: keyof FieldErrors) =>
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setStatus(null);
    try {
      await signOut();
      setEmailInput('');
      setStatus({
        tone: 'info',
        title: 'Đã đăng xuất',
        body: 'Nhập email liên hệ của đơn vị để gửi hồ sơ đăng ký tới Quản trị viên SkillPass.',
      });
    } catch {
      setStatus({ tone: 'bad', title: 'Chưa đăng xuất được', body: 'Vui lòng thử lại.' });
    } finally {
      setSigningOut(false);
    }
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    setStatus(null);

    const nextErrors: FieldErrors = {};
    if (!name.trim()) nextErrors.name = 'Vui lòng nhập tên công ty / trường học.';
    const orgEmail = email.trim().toLowerCase();
    if (!orgEmail) {
      nextErrors.email = 'Vui lòng nhập email liên hệ của đơn vị.';
    } else if (!EMAIL_RE.test(orgEmail)) {
      nextErrors.email = 'Email chưa đúng định dạng (ví dụ: hr@congty.vn).';
    }
    if (!authUser && (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) {
      nextErrors.password = 'Mật khẩu cần ít nhất 10 ký tự, gồm chữ và số.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus({ tone: 'bad', title: 'Kiểm tra thông tin', body: 'Vui lòng sửa các ô được đánh dấu đỏ bên dưới.' });
      return;
    }

    if (sessionConflict) {
      setStatus({
        tone: 'bad',
        title: 'Đang đăng nhập bằng tài khoản khác',
        body: `Phiên hiện tại là ${authUser?.email}. Hãy đăng xuất rồi gửi hồ sơ đối tác bằng email của đơn vị.`,
      });
      return;
    }

    if (authUser && authUser.role !== 'business') {
      setStatus({
        tone: 'bad',
        title: 'Phiên đăng nhập không phải tài khoản đối tác',
        body: 'Hãy đăng xuất rồi thử lại để tránh gửi hồ sơ nhầm tài khoản.',
      });
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      if (authUser) {
        // Tài khoản đối tác cũ: chỉ bổ sung hồ sơ đơn vị, giữ nguyên luồng hiện có.
        const org = await registerOrganization({
          name: name.trim(),
          orgType,
          taxCode: taxCode.trim(),
          email: orgEmail,
          phone: phone.trim(),
          contactPerson: contactPerson.trim(),
        });
        setSubmitted({ name: org.name, email: orgEmail, viaAccount: true });
      } else {
        // Khách chưa có tài khoản: Auth giữ mật khẩu và khóa đăng nhập chờ Admin.
        await submitPartnerApplication({
          name: name.trim(),
          org_type: orgType,
          tax_code: taxCode.trim(),
          contact_person: contactPerson.trim(),
          phone: phone.trim(),
          email: orgEmail,
          password,
        });
        setPassword('');
        setSubmitted({ name: name.trim(), email: orgEmail, viaAccount: false });
      }
    } catch (error) {
      // Giữ nguyên toàn bộ dữ liệu đã nhập để người dùng chỉnh sửa và gửi lại.
      setStatus({
        tone: 'bad',
        title: 'Chưa gửi được hồ sơ',
        body: error instanceof Error ? error.message : 'Vui lòng kiểm tra kết nối và thử lại.',
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (submitted) {
    const viaAccount = submitted.viaAccount;
    return (
      <Screen biz header={<ScreenHeader biz title="Đăng ký Đối tác" back />}>
        <Hero
          biz
          sm
          duck="tie"
          title={viaAccount ? 'Đã gửi hồ sơ đối tác' : 'Đã gửi hồ sơ tới Admin'}
          sub={
            viaAccount
              ? 'Hồ sơ đơn vị đang ở bước Chờ xác minh.'
              : 'Tài khoản đã được tạo và đang ở bước Chờ xác minh.'
          }
        />
        <Note biz tone="ok" title={`Đã gửi hồ sơ: ${submitted.name}`}>
          {viaAccount
            ? 'Quản trị viên sẽ kiểm tra Mã số thuế và email. Sau khi xác minh, đơn vị có thể đăng nhập cổng đối tác.'
            : `Tài khoản ${submitted.email} đã được tạo với mật khẩu bạn chọn. Sau khi Admin xác minh, tài khoản sẽ được mở khóa.`}
        </Note>
        {viaAccount ? (
          <Button biz title="Xem trạng thái hồ sơ" onPress={() => router.replace('/biz/pending' as any)} />
        ) : null}
        <Button biz variant="ghost" title="Chỉnh sửa và gửi lại hồ sơ" onPress={() => setSubmitted(null)} />
        {!viaAccount ? (
          <Button biz variant="ghost" title="Đã có tài khoản? Đăng nhập" onPress={() => router.replace('/biz/login' as any)} />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen biz header={<ScreenHeader biz title="Đăng ký Đối tác" back />}>
      <Hero
        biz
        sm
        duck="tie"
        title="Hợp tác Doanh nghiệp"
        sub="Xác thực ứng viên tức thì và cấp chứng nhận số chính thức."
      />

      {!authReady ? (
        <Note biz tone="info" title="Đang kiểm tra phiên đăng nhập">
          Vui lòng chờ trong giây lát.
        </Note>
      ) : sessionConflict ? (
        <Note biz tone="info" title="Bạn đang đăng nhập bằng tài khoản khác">
          {`Phiên hiện tại: ${authUser?.email}. Tài khoản đối tác cần email tên miền riêng của đơn vị. Hãy đăng xuất để gửi hồ sơ mới.`}
        </Note>
      ) : businessSession ? (
        <Note biz tone="info" title="Hoàn tất hồ sơ đối tác">
          Tài khoản đối tác đã được tạo. Bạn chỉ cần gửi hồ sơ đơn vị, không cần đăng ký tài khoản lần nữa.
        </Note>
      ) : (
        <Note biz tone="info" title="Tạo tài khoản chờ duyệt">
          Nhập email và mật khẩu đăng nhập. Tài khoản chỉ được mở sau khi Admin duyệt hồ sơ.
        </Note>
      )}

      {existingOrg ? (
        <Note biz tone="ok" title={`Đơn vị đã có hồ sơ: ${existingOrg.name}`}>
          {existingOrg.status === 'verified'
            ? 'Đơn vị đã được cấp quyền phê duyệt chứng chỉ.'
            : existingOrg.status === 'pending'
              ? 'Hồ sơ đang chờ Quản trị viên thẩm định.'
              : 'Hồ sơ cần được cập nhật hoặc đã bị thu hồi quyền.'}
        </Note>
      ) : null}

      <SelectField
        label="Loại hình tổ chức"
        placeholder="Chọn loại hình"
        value={orgType}
        onChange={(v) => setOrgType(v as 'company' | 'school')}
        options={[
          { label: 'Công ty, doanh nghiệp', value: 'company' },
          { label: 'Trường đại học, cao đẳng', value: 'school' },
        ]}
      />
      <TextField
        biz
        label="Tên công ty / trường học"
        placeholder="Ví dụ: Công ty Công nghệ Mẫu C"
        value={name}
        error={errors.name}
        editable={!sessionConflict}
        onChangeText={(value) => {
          setName(value);
          clearField('name');
        }}
      />
      <TextField
        biz
        label="Mã số thuế / Mã đơn vị"
        placeholder="Ví dụ: 0312345678"
        value={taxCode}
        editable={!sessionConflict}
        onChangeText={setTaxCode}
      />
      <TextField
        biz
        label="Người đại diện / Phụ trách"
        placeholder="Ví dụ: Lê Hoàng Nam – Giám đốc Nhân sự"
        value={contactPerson}
        editable={!sessionConflict}
        onChangeText={setContactPerson}
      />
      <TextField
        biz
        label="Số điện thoại"
        placeholder="Ví dụ: 0312345678"
        value={phone}
        editable={!sessionConflict}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextField
        biz
        label="Email liên hệ của đơn vị"
        placeholder="hr@congty.vn hoặc daotao@truong.edu.vn"
        value={email}
        error={errors.email}
        editable={!businessSession && !sessionConflict}
        hint={
          businessSession
            ? 'Email của tài khoản đang đăng nhập — không thể thay đổi.'
            : 'Dùng email thật để Admin liên hệ và đối chiếu. Hệ thống không tự xác minh tên miền.'
        }
        onChangeText={(value) => {
          setEmailInput(value);
          clearField('email');
        }}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {!authUser ? <TextField biz label="Mật khẩu đăng nhập" placeholder="Ít nhất 10 ký tự, gồm chữ và số" value={password} error={errors.password} secureTextEntry onChangeText={(value) => { setPassword(value); clearField('password'); }} /> : null}

      {status ? (
        <Note biz tone={status.tone} title={status.title}>
          {status.body}
        </Note>
      ) : null}

      {sessionConflict ? (
        <Button
          biz
          variant="danger"
          title={signingOut ? 'Đang đăng xuất...' : 'Đăng xuất để gửi hồ sơ đối tác'}
          disabled={signingOut}
          onPress={handleSignOut}
        />
      ) : (
        <Button
          biz
          title={
            loading
              ? 'Đang gửi hồ sơ...'
              : authUser
                ? 'Gửi hồ sơ đăng ký đối tác'
                : 'Gửi hồ sơ đăng ký tới Admin'
          }
          disabled={loading || !authReady}
          onPress={handleSubmit}
        />
      )}

      {existingOrg && !sessionConflict ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/biz/pending' as any)}
          style={styles.linkBtn}
        >
          <Text style={[styles.link, { color: p.brand }]}>Xem trạng thái hồ sơ đã gửi</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/biz/login' as any)}
        style={styles.linkBtn}
      >
        <Text style={[styles.link, { color: p.brand }]}>Đã có tài khoản? Đăng nhập</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkBtn: { alignItems: 'center', paddingVertical: 2 },
  link: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
});
