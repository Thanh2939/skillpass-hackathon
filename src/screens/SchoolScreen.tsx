import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { fonts, palette } from '../theme';
import { Button, Note, Screen, ScreenHeader } from '../components/ui';
import { Icon } from '../components/Icon';
import { useApp } from '../store/AppContext';
import type { PartnerOrg } from '../constants/mockData';

/**
 * Nguồn chuẩn để xác định trường: orgType === 'school' và đã được xác minh.
 * Không suy đoán theo tên/tier để tránh loại nhầm trường có dữ liệu legacy.
 */
function isVerifiedSchool(org: PartnerOrg): boolean {
  return org.orgType === 'school' && org.status === 'verified';
}

/** Giữ nguyên lỗi gốc nếu đã là tiếng Việt; còn lỗi mạng/Supabase thì báo rõ ràng hơn. */
function toSubmitErrorMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message.trim() : '';
  if (!raw) return 'Không gửi được yêu cầu. Vui lòng kiểm tra kết nối và thử lại.';
  if (/abort|fetch|network|timeout|failed to|load failed/i.test(raw)) {
    return 'Kết nối mạng không ổn định nên chưa gửi được hồ sơ. Minh chứng của bạn vẫn được giữ lại, vui lòng thử lại.';
  }
  return raw;
}

/** Màn Xác nhận sinh viên — chọn trường (design #school, checkbox #pk) */
export function SchoolScreen() {
  const router = useRouter();
  const p = palette(false);
  const { verifyStudentSchool, partnerOrgs } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<{ name: string; uri: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentSchool, setSentSchool] = useState<string | null>(null);
  // Chặn 2 lần bấm trong cùng một khung hình (state loading chưa kịp cập nhật)
  // để không tạo 2 hồ sơ xác nhận trùng nhau.
  // Không dùng Promise.race/timeout ở UI: request vẫn chạy ngầm mà nút được mở lại
  // sẽ khiến người dùng gửi lần hai và tạo hồ sơ trùng.
  const submittingRef = useRef(false);

  const verifiedSchools = partnerOrgs.filter(isVerifiedSchool);
  const selectedSchool = verifiedSchools.find((s) => s.id === selectedId) ?? null;
  const selected = selectedSchool?.name ?? null;
  const q = query.trim().toLocaleLowerCase('vi');
  const list = verifiedSchools.filter((s) => s.name.toLocaleLowerCase('vi').includes(q));

  const pickProof = async () => {
    if (loading || sent) return;
    setError(null);
    try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!res.canceled) {
      setFiles((previous) => [...previous, ...res.assets.map((asset, index) => ({
        name: asset.fileName ?? `minh-chung-${previous.length + index + 1}.jpg`,
        uri: asset.uri,
      }))]);
    }
    } catch {
      setError('Không mở được thư viện ảnh. Vui lòng thử lại.');
    }
  };

  const handleConfirmSchool = async () => {
    if (submittingRef.current || sent) return;
    if (!files.length) {
      setError('Vui lòng tải lên ít nhất một ảnh minh chứng sinh viên.');
      return;
    }
    // Kiểm tra lại trường tại thời điểm gửi: danh sách đối tác có thể vừa được
    // đồng bộ lại, trường đã chọn không còn là trường đã xác minh.
    const school = verifiedSchools.find((s) => s.id === selectedId);
    if (!school) {
      setSelectedId(null);
      setOpen(true);
      setError('Trường bạn chọn không còn trong danh sách trường đã xác minh. Vui lòng chọn lại trường.');
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    setOpen(false);
    try {
      await verifyStudentSchool(school.name, files, school.id);
      setSentSchool(school.name);
      setSent(true);
    } catch (reason) {
      setError(toSubmitErrorMessage(reason));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (sent) return (
    <Screen header={<ScreenHeader title="Xác nhận sinh viên" back />} footer={<Button title="Xem hồ sơ chờ duyệt" onPress={() => router.replace('/pending')} />}>
      <Note tone="ok" title="Đã gửi xác nhận sinh viên">Yêu cầu cùng {files.length} minh chứng đã được gửi tới {sentSchool ?? selected}. Hồ sơ sẽ cập nhật sau khi nhà trường duyệt.</Note>
    </Screen>
  );

  return (
    <Screen
      header={<ScreenHeader title="Xác nhận sinh viên" back />}
      footer={
        <Button
          title={loading ? 'Đang gửi...' : 'Gửi xác nhận'}
          disabled={!selectedId || !files.length || loading}
          onPress={handleConfirmSchool}
        />
      }
    >
      {error ? (
        <>
          <Note tone="bad" title="Chưa thể gửi hồ sơ">
            {error}
            {'\n'}Nếu hồ sơ đã xuất hiện trong mục “Chứng chỉ đang chờ duyệt”, bạn không cần gửi lại.
          </Note>
          {selectedId && files.length ? (
            <Button variant="ghost" title="Kiểm tra hồ sơ đã gửi" onPress={() => router.push('/pending')} />
          ) : null}
        </>
      ) : null}
      {loading ? (
        <Note tone="info" title="Đang gửi xác nhận sinh viên">
          Hệ thống đang tải {files.length} minh chứng lên và tạo hồ sơ. Vui lòng giữ màn hình này cho tới khi có kết quả.
        </Note>
      ) : null}
      <Text style={[styles.sub, { color: p.mut }]}>
        Tải minh chứng bạn là sinh viên, rồi chọn trường đại học / cao đẳng đã đăng ký hợp tác trên SkillPass.
      </Text>
      {verifiedSchools.length === 0 ? (
        <Note tone="info" title="Chưa có trường đại học nào kích hoạt tài khoản">
          Bạn có thể gửi thông tin trường để SkillPass liên hệ. Khi trường trở thành đối tác, bạn sẽ gửi được yêu cầu xác nhận tại đây.
        </Note>
      ) : null}
      <Pressable accessibilityRole="button" onPress={pickProof} disabled={loading} style={styles.drop}>
        <Icon name="up" size={22} color="#5E6F96" />
        <Text style={styles.dropTitle}>{files.length ? 'Thêm minh chứng' : 'Tải minh chứng sinh viên'}</Text>
        <Text style={styles.dropSub}>Ảnh thẻ sinh viên hoặc giấy xác nhận</Text>
      </Pressable>
      {files.length ? <Text style={styles.filesLabel}>MINH CHỨNG ĐÃ CHỌN · {files.length}</Text> : null}
      {files.map((file, index) => (
        <View key={file.uri + index} style={styles.fileRow}>
          <Image source={{ uri: file.uri }} style={styles.thumbnail} />
          <View style={styles.fileInfo}>
            <Text numberOfLines={2} style={styles.fileName}>{file.name}</Text>
            <Text style={styles.fileMeta}>Ảnh minh chứng · Sẵn sàng gửi</Text>
          </View>
          <Pressable disabled={loading} style={styles.removeFile} accessibilityRole="button" accessibilityLabel={'Xóa ' + file.name} onPress={() => setFiles((all) => all.filter((_, i) => i !== index))}>
            <Icon name="x" size={18} color={p.mut} />
          </Pressable>
        </View>
      ))}
      {!verifiedSchools.length ? <Button title="Gửi thông tin trường của bạn" variant="ghost" onPress={() => router.push('/other')} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        disabled={loading}
        onPress={() => setOpen((v) => !v)}
        style={[styles.sel, open && { borderColor: p.brand }]}
      >
        <Icon name="search" size={20} color={open ? p.ink : p.mut} />
        <Text style={[styles.selText, { color: open ? p.ink : p.mut }]}>
          {selected ?? 'Tìm trường đại học, cao đẳng đã hợp tác'}
        </Text>
        <View style={open ? { transform: [{ rotate: '180deg' }] } : undefined}>
          <Icon name="chev" size={20} color={p.mut} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.picker}>
          <TextInput
            style={styles.search}
            placeholder="Nhập tên trường để tìm"
            placeholderTextColor="#9AA8C7"
            value={query}
            onChangeText={setQuery}
          />
          <View style={styles.plist}>
            {list.map((s) => {
              const isSel = selectedId === s.id;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  onPress={() => { setSelectedId(s.id); setError(null); setOpen(false); }}
                  style={[styles.opt, isSel && { borderColor: p.brand, backgroundColor: '#F0F5FF' }]}
                >
                  <View style={[styles.radio, isSel && { borderColor: p.brand }]}>
                    {isSel ? <View style={[styles.radioDot, { backgroundColor: p.brand }]} /> : null}
                  </View>
                  <View style={styles.optText}>
                    <Text style={[styles.optTitle, { color: p.ink }]}>{s.name}</Text>
                    <Text style={[styles.optSub, { color: p.mut }]}>Đối tác SkillPass (@{s.domain})</Text>
                  </View>
                </Pressable>
              );
            })}
            {list.length === 0 ? (
              <Text style={[styles.empty, { color: p.mut }]}>
                Không tìm thấy trường phù hợp. Thử từ khóa khác hoặc chọn “Khác”.
              </Text>
            ) : null}
            <Pressable onPress={() => router.push('/other')} style={styles.other}>
              <View style={styles.optText}>
                <Text style={[styles.optTitle, { color: p.ink }]}>Khác</Text>
                <Text style={[styles.optSub, { color: p.mut }]}>Không thấy trường của bạn trong danh sách</Text>
              </View>
              <Text style={[styles.chev, { color: p.mut }]}>›</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, lineHeight: 21 },
  drop: {
    alignItems: 'center',
    gap: 4,
    padding: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#DCE6FA',
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  dropTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, color: '#16264F' },
  dropSub: { fontSize: 12.5, fontFamily: fonts.sans, color: '#5E6F96', textAlign: 'center' },
  sel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  selText: { flex: 1, fontSize: 15, fontFamily: fonts.sans },
  picker: { gap: 10 },
  search: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 12,
    backgroundColor: '#fff',
    color: '#16264F',
    fontSize: 14,
    fontFamily: fonts.sans,
  },
  plist: { gap: 8 },
  empty: { fontSize: 13, fontFamily: fonts.sans, lineHeight: 19, paddingVertical: 6 },
  filesLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.6, color: '#5E6F96' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: '#DCE6FA', borderRadius: 16, backgroundColor: '#fff' },
  thumbnail: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#EEF4FF' },
  fileInfo: { flex: 1, minWidth: 0, gap: 4 },
  fileName: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19, color: '#16264F' },
  fileMeta: { fontFamily: fonts.sans, fontSize: 11, color: '#5E6F96' },
  removeFile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F4F7FF' },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 18,
    backgroundColor: '#fff',
    shadowColor: 'rgba(40,60,140,0.07)',
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#C4CEE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optText: { flex: 1, gap: 2 },
  optTitle: { fontSize: 14.5, fontWeight: '600', fontFamily: fonts.semibold },
  optSub: { fontSize: 12.5, fontFamily: fonts.sans },
  other: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#DCE6FA',
    borderRadius: 18,
    backgroundColor: '#fff',
  },
  chev: { fontSize: 20 },
});
