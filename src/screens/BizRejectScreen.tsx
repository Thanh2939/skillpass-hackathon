import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Note, Screen, ScreenHeader, SelectField, TextField } from '../components/ui';
import { rejectReasons } from '../constants/mockData';
import { useApp } from '../store/AppContext';

/** Màn Từ chối xác thực chứng chỉ (hihi_fixed.html #reject-form) */
export function BizRejectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const p = palette(true);
  const { rejectRequest, bizRequests } = useApp();
  const [reason, setReason] = useState('');
  const [fixGuide, setFixGuide] = useState('');

  const targetId = bizRequests.find((r) => r.id === id && r.status === 'pending')?.id;
  const [saving, setSaving] = useState(false);

  const handleConfirmReject = async () => {
    if (!targetId || saving) return;
    setSaving(true);
    try {
      await rejectRequest(targetId, reason || 'Minh chứng không hợp lệ.', fixGuide);
      router.replace('/biz');
    } catch {
      Alert.alert('Không thể từ chối hồ sơ', 'Vui lòng kiểm tra trạng thái rồi thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      biz
      header={<ScreenHeader biz title="Từ chối xác thực" back />}
      footer={
        <>
          <Button biz title="Xác nhận từ chối" variant="danger" disabled={!targetId || saving} onPress={handleConfirmReject} />
          <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={[styles.cancel, { color: p.brand }]}>Huỷ bỏ</Text>
          </Pressable>
        </>
      }
    >
      <Note biz tone="bad" title="Từ chối ký số chứng nhận">
        Lý do từ chối sẽ được gửi trực tiếp về mục Thông báo trên ứng dụng của sinh viên.
      </Note>
      <SelectField
        label="Lý do từ chối phổ biến"
        placeholder="Chọn lý do"
        value={reason}
        onChange={setReason}
        options={rejectReasons.map((r) => ({ label: r, value: r }))}
      />
      <TextField
        label="Hướng dẫn sinh viên cách khắc phục"
        placeholder="Ví dụ: Vui lòng chụp lại bản cứng có mộc đỏ rõ nét ở cả 4 góc rồi gửi lại."
        multiline
        numberOfLines={3}
        value={fixGuide}
        onChangeText={setFixGuide}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cancelBtn: { alignItems: 'center', paddingVertical: 2 },
  cancel: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
});
