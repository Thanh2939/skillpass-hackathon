import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Note, Screen, ScreenHeader, TextField } from '../components/ui';
import { useApp } from '../store/AppContext';

/** Màn Trường chưa hợp tác — để nhân viên / Admin liên hệ (design #other) */
export function OtherScreen() {
  const router = useRouter();
  const { submitPartnerLead } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');

  const handleSubmit = async () => {
    if (saving || sent) return;
    if (!name.trim()) {
      setError('Vui lòng nhập tên trường của bạn.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Email liên hệ chưa đúng định dạng.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await submitPartnerLead({
        name: name.trim(),
        orgType: 'school',
        email: email.trim(),
        phone: phone.trim(),
        contactPerson: contactPerson.trim(),
      });
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<ScreenHeader title="Trường chưa hợp tác" back />}
      footer={sent ? <Button title="Về ví" onPress={() => router.replace("/home")} /> : <Button title={saving ? "Đang gửi..." : "Gửi thông tin trường"} disabled={saving} onPress={handleSubmit} />}
    >
      {error ? <Note tone="bad" title="Không gửi được thông tin">{error}</Note> : null}
      {sent ? <Note tone="ok" title="Đã gửi thông tin trường">SkillPass sẽ dùng thông tin này để liên hệ với trường.</Note> : null}
      <Note tone="info" title="Cho SkillPass biết thêm về trường này">
        Nhân viên SkillPass sẽ liên hệ trường để xác thực. Bạn có thể cung cấp email hoặc số điện thoại để SkillPass liên hệ đúng bộ phận.
      </Note>
      <TextField label="Tên trường" placeholder="Ví dụ: Trường Cao đẳng ABC" value={name} onChangeText={setName} />
      <TextField label="Email liên hệ của trường" placeholder="phongdaotao@truong.edu.vn" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextField label="Số điện thoại của trường" placeholder="Số điện thoại phòng đào tạo" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextField label="Người phụ trách, website" placeholder="Ví dụ: Cô Lan, phòng Đào tạo" value={contactPerson} onChangeText={setContactPerson} />
    </Screen>
  );
}
