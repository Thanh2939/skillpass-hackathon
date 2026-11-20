import React, { useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { fonts, palette } from '../theme';
import { Button, DateField, Note, Screen, ScreenHeader, SelectField, Steps, TextField } from '../components/ui';
import { Icon } from '../components/Icon';
import { CertCard } from '../components/CertCard';
import { certTag } from '../constants/mockData';
import { useApp } from '../store/AppContext';

export interface AttachedEvidence {
  id: string;
  name: string;
  uri: string;
  size?: number;
  type?: string;
}

/**
 * Chuẩn hóa & kiểm tra ngày cấp dạng dd/mm/yyyy.
 * Chấp nhận ngày/tháng không có số 0 ở đầu, tự bù 0 khi lưu.
 * Trả về value rỗng + error nếu ngày không đầy đủ / không tồn tại / ở tương lai.
 */
export function normalizeIssueDate(raw: string, today = new Date()): { value: string; error: string | null } {
  const v = (raw ?? '').trim();
  if (!v || v.replace(/\//g, '').trim() === '') return { value: '', error: null };
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (!match) {
    return { value: '', error: 'Ngày cấp phải nhập đủ Ngày / Tháng / Năm, ví dụ 15/10/2026.' };
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > today.getFullYear()) {
    return { value: '', error: `Năm cấp phải nằm trong khoảng 1900 – ${today.getFullYear()}.` };
  }
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { value: '', error: 'Ngày cấp không tồn tại. Vui lòng kiểm tra lại ngày và tháng.' };
  }
  if (date.getTime() > today.getTime()) {
    return { value: '', error: 'Ngày cấp không được ở tương lai.' };
  }
  return {
    value: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    error: null,
  };
}

/** Màn Gửi chứng chỉ (design #submit) — hỗ trợ gửi NHIỀU minh chứng cùng lúc */
export function SubmitScreen() {
  const router = useRouter();
  const p = palette(false);
  const { submitCertificate, submitPartnerLead, partnerOrgs, certs } = useApp();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('');
  const [school, setSchool] = useState('');
  const [company, setCompany] = useState('');
  const [extraName, setExtraName] = useState('');
  const [extraEmail, setExtraEmail] = useState('');
  const [extraPhone, setExtraPhone] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedEvidence[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Chặn 2 lần bấm trong cùng một khung hình (state loading chưa kịp cập nhật)
  // để không tạo trùng hồ sơ / trùng đề xuất đơn vị.
  const submittingRef = useRef(false);

  const verifiedSchools = partnerOrgs.filter(
    (o) => o.orgType === 'school' && o.status === 'verified'
  );
  const verifiedCompanies = partnerOrgs.filter(
    (o) => o.orgType === 'company' && o.status === 'verified'
  );

  const showExtra = kind === 'khac' || school === 'khac' || company === 'khac';

  const pickEvidence = async () => {
    if (loading) return;
    // Trên Web: Kích hoạt file input để chọn cả ảnh và PDF
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
      return;
    }

    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const newFiles: AttachedEvidence[] = res.assets.map((asset, i) => ({
          id: `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          name: asset.fileName || `minh-chung-${attachedFiles.length + i + 1}.jpg`,
          uri: asset.uri,
          size: asset.fileSize,
          type: asset.mimeType || 'image/jpeg',
        }));
        setAttachedFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (e) {
      console.warn('ImagePicker error:', e);
    }
  };

  const handleWebFileChange = (e: any) => {
    const files = e.target?.files;
    if (files && files.length > 0) {
      const newFiles: AttachedEvidence[] = Array.from(files).map((f: any, i: number) => ({
        id: `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        name: f.name || `minh-chung-${attachedFiles.length + i + 1}`,
        uri: URL.createObjectURL(f),
        size: f.size,
        type: f.type,
      }));
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
    // Reset value để có thể chọn lại file cùng tên nếu muốn
    if (e.target) e.target.value = '';
  };

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitted(false);
    if (!title.trim()) {
      setSubmitError('Vui lòng nhập tên chứng chỉ.');
      return;
    }
    const orgName = showExtra
      ? extraName.trim() || 'Đơn vị ngoài danh sách'
      : kind === 'dh'
        ? school
        : kind === 'cty'
          ? company
          : '';
    if (!orgName) {
      setSubmitError('Vui lòng chọn đơn vị cấp chứng chỉ.');
      return;
    }

    const parsedDate = normalizeIssueDate(issueDate);
    if (parsedDate.error) {
      setDateError(parsedDate.error);
      setSubmitError(parsedDate.error);
      return;
    }
    setDateError(null);

    if (attachedFiles.length === 0) {
      setSubmitError('Vui lòng tải lên ít nhất một tài liệu minh chứng.');
      return;
    }

    const selectedOrg =
      kind === 'dh'
        ? verifiedSchools.find((s) => s.name === school)
        : kind === 'cty'
          ? verifiedCompanies.find((c) => c.name === company)
          : undefined;

    // Danh sách đối tác có thể vừa đồng bộ lại: không cho gửi tới đơn vị
    // không còn là đối tác đã xác minh (tránh hồ sơ rơi vào đơn vị sai).
    if (!showExtra && (kind === 'dh' || kind === 'cty') && !selectedOrg) {
      setSubmitError(
        kind === 'dh'
          ? 'Trường đã chọn không còn trong danh sách trường đã xác minh. Vui lòng chọn lại trường.'
          : 'Doanh nghiệp đã chọn không còn trong danh sách đối tác đã xác minh. Vui lòng chọn lại.'
      );
      return;
    }

    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      if (showExtra && extraName.trim()) {
        await submitPartnerLead({
          name: extraName.trim(),
          orgType: kind === 'dh' ? 'school' : 'company',
          email: extraEmail.trim() || 'lienhe@donvi.vn',
          phone: extraPhone.trim() || 'Đang cập nhật',
        });
      }

      await submitCertificate({
        title: title.trim(),
        orgType: kind === 'dh' ? 'school' : 'company',
        org: orgName,
        orgId: selectedOrg?.id,
        issueDate: parsedDate.value,
        fileName: attachedFiles[0]?.name,
        fileUri: attachedFiles[0]?.uri,
        files: attachedFiles.map((f) => ({
          name: f.name,
          uri: f.uri,
          size: f.size,
          type: f.type,
        })),
      });

      setTitle('');
      setIssueDate('');
      setDateError(null);
      setAttachedFiles([]);

      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Gửi hồ sơ thất bại. Vui lòng thử lại.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const hasApprovedCert = certs.some((c) => c.status === 'approved' || c.status === 'issued');

  return (
    <Screen
      header={<ScreenHeader title="Gửi chứng chỉ & Tài liệu" back />}
      footer={
        <Button
          title={loading ? 'Đang tải lên & gửi hồ sơ...' : `Gửi hồ sơ (${attachedFiles.length} minh chứng)`}
          disabled={loading}
          onPress={handleSubmit}
        />
      }
    >
      {submitError ? (
        <Note tone="bad" title="Chưa gửi hồ sơ">
          {submitError}
          {'\n'}Nếu hồ sơ đã xuất hiện trong danh sách bên dưới, bạn không cần gửi lại.
        </Note>
      ) : null}
      {submitted ? <Note tone="ok" title="Đã gửi hồ sơ">Bạn có thể xem tiến độ trong mục Chứng chỉ đang chờ duyệt.</Note> : null}
      {Platform.OS === 'web' ? (
        <input
          ref={fileInputRef as any}
          type="file"
          multiple
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={handleWebFileChange}
        />
      ) : null}

      <Text style={[styles.sub, { color: p.mut }]}>
        Chọn trường đại học hoặc doanh nghiệp để gửi tài liệu minh chứng xét duyệt và cấp chứng nhận.
      </Text>
      <TextField
        label="Tên chứng chỉ / Tài liệu"
        placeholder="Ví dụ: Bằng tốt nghiệp, IELTS 7.0, Chứng nhận thực tập..."
        value={title}
        onChangeText={setTitle}
      />
      <SelectField
        label="Đơn vị cấp"
        placeholder="Chọn loại đơn vị cấp"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setSchool('');
          setCompany('');
        }}
        options={[
          { label: 'Trường đại học, cao đẳng', value: 'dh' },
          { label: 'Công ty, doanh nghiệp', value: 'cty' },
          { label: 'Khác (Đề xuất đơn vị mới)', value: 'khac' },
        ]}
      />
      {kind === 'dh' ? (
        verifiedSchools.length > 0 ? (
          <SelectField
            label="Tên trường đại học / cao đẳng"
            placeholder="Chọn trường đã đăng ký hợp tác"
            value={school}
            onChange={setSchool}
            options={[
              ...verifiedSchools.map((s) => ({ label: s.name, value: s.name })),
              { label: 'Khác (Trường chưa có trong danh sách)', value: 'khac' },
            ]}
          />
        ) : (
          <Note tone="info" title="Chưa có trường đại học nào đăng ký tài khoản">
            Hiện chưa có trường đại học nào tạo tài khoản và được Admin phê duyệt. Vui lòng tạo tài khoản Trường đại học và duyệt qua Admin trước, hoặc chọn mục &quot;Khác&quot;.
          </Note>
        )
      ) : null}
      {kind === 'cty' ? (
        verifiedCompanies.length > 0 ? (
          <SelectField
            label="Tên công ty, doanh nghiệp"
            placeholder="Chọn doanh nghiệp đã đăng ký hợp tác"
            value={company}
            onChange={setCompany}
            options={[
              ...verifiedCompanies.map((c) => ({ label: c.name, value: c.name })),
              { label: 'Khác (Doanh nghiệp chưa có trong danh sách)', value: 'khac' },
            ]}
          />
        ) : (
          <Note tone="info" title="Chưa có doanh nghiệp nào đăng ký tài khoản">
            Hiện chưa có doanh nghiệp nào tạo tài khoản và được Admin phê duyệt. Vui lòng tạo tài khoản Doanh nghiệp và duyệt qua Admin trước, hoặc chọn mục &quot;Khác&quot;.
          </Note>
        )
      ) : null}
      {showExtra ? (
        <>
          <Note tone="info" title="Đơn vị này chưa hợp tác">
            Nhập thông tin để Quản trị viên SkillPass liên hệ và kích hoạt tài khoản cho đơn vị.
          </Note>
          <TextField label="Tên đơn vị" placeholder="Ví dụ: Trường Đại học ABC" value={extraName} onChangeText={setExtraName} />
          <TextField label="Email liên hệ" placeholder="email@donvi.vn" value={extraEmail} onChangeText={setExtraEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextField label="Số điện thoại" placeholder="Số điện thoại của đơn vị" value={extraPhone} onChangeText={setExtraPhone} keyboardType="phone-pad" />
        </>
      ) : null}
      <DateField
        label="Ngày cấp"
        value={issueDate}
        error={dateError ?? undefined}
        hint="Để trống nếu chứng chỉ không ghi ngày cấp."
        onChange={(value) => {
          setIssueDate(value);
          if (dateError) setDateError(null);
        }}
      />

      {/* Vùng đính kèm nhiều tài liệu minh chứng */}
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceLabel}>
          Tài liệu minh chứng đính kèm ({attachedFiles.length})
        </Text>
        <Text style={styles.evidenceHint}>
          Bạn có thể tải lên nhiều ảnh chứng chỉ, bảng điểm, file PDF hoặc quyết định thực tập.
        </Text>

        <Pressable onPress={pickEvidence} disabled={loading} style={styles.drop}>
          <View style={styles.dropIcon}>
            <Icon name="up" size={24} color="#2F66F0" />
          </View>
          <Text style={styles.dropTitle}>
            {attachedFiles.length === 0 ? 'Bấm để tải ảnh hoặc PDF minh chứng' : '+ Thêm minh chứng khác'}
          </Text>
          <Text style={styles.dropSub}>Hỗ trợ JPG, PNG, PDF (cho phép chọn nhiều file cùng lúc)</Text>
        </Pressable>

        {attachedFiles.length > 0 ? (
          <View style={styles.fileList}>
            {attachedFiles.map((file, idx) => {
              const isImg = file.type?.startsWith('image') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
              return (
                <View key={file.id} style={styles.fileCard}>
                  {isImg ? (
                    <Image source={{ uri: file.uri }} style={styles.thumb} />
                  ) : (
                    <View style={styles.docIconBox}>
                      <Text style={styles.docIconText}>📄</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
                      {idx + 1}. {file.name}
                    </Text>
                    {file.size ? (
                      <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() => removeFile(file.id)}
                    style={styles.removeBtn}
                    accessibilityLabel="Xóa file"
                  >
                    <Icon name="x" size={16} color="#E5484D" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <Steps
        steps={[
          'Bạn gửi tài liệu',
          'Đơn vị thẩm định minh chứng',
          'Phê duyệt & Cấp chứng nhận',
        ]}
        onCount={hasApprovedCert ? 3 : certs.length > 0 ? 2 : 1}
      />

      {/* Danh sách tài liệu đã gửi — Tự động cập nhật realtime khi Trường ĐH / Doanh nghiệp phê duyệt */}
      <View style={styles.liveBox}>
        <Text style={styles.liveTitle}>Tài liệu đã gửi & Trạng thái xử lý ({certs.length})</Text>
        <Text style={[styles.liveSub, { color: p.mut }]}>
          Tự động cập nhật tức thì ngay khi Trường đại học hoặc Doanh nghiệp xử lý hồ sơ.
        </Text>
        {certs.length === 0 ? (
          <Text style={[styles.emptyText, { color: p.mut }]}>
            Bạn chưa gửi tài liệu nào. Hãy điền thông tin phía trên và bấm &quot;Gửi hồ sơ&quot;.
          </Text>
        ) : (
          certs.map((c) => (
            <CertCard
              key={c.id}
              title={c.title}
              subtitle={
                c.status === 'approved' || c.status === 'issued'
                  ? `${c.org} · Đã duyệt ngày ${c.reviewedAt ?? c.submittedAt ?? 'hôm nay'}`
                  : c.status === 'rejected'
                    ? `${c.org} · Cần bổ sung: ${c.rejectionReason ?? 'Xem chi tiết'}`
                    : `${c.org} · Đã gửi ngày ${c.submittedAt ?? 'hôm nay'} (Đang chờ duyệt)`
              }
              tag={certTag(c)}
              onPress={() => router.push((c.status === 'rejected' ? `/rejected?id=${encodeURIComponent(c.id)}` : `/cert/${c.id}`) as any)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, lineHeight: 21 },
  evidenceSection: {
    gap: 8,
    marginVertical: 4,
  },
  evidenceLabel: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#16264F',
  },
  evidenceHint: {
    fontSize: 12.5,
    fontFamily: fonts.sans,
    color: '#5E6F96',
    lineHeight: 18,
  },
  drop: {
    alignItems: 'center',
    gap: 6,
    padding: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#9BB8F5',
    borderRadius: 16,
    backgroundColor: '#F7FAFF',
  },
  dropIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EBF1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: '#2F66F0', textAlign: 'center' },
  dropSub: { fontSize: 12, fontFamily: fonts.sans, color: '#5E6F96', textAlign: 'center' },
  fileList: {
    gap: 8,
    marginTop: 6,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE6FA',
    backgroundColor: '#fff',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EEF2F6',
  },
  docIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EFF4FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIconText: {
    fontSize: 20,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#16264F',
  },
  fileSize: {
    fontSize: 11.5,
    fontFamily: fonts.sans,
    color: '#7688AC',
    marginTop: 2,
  },
  removeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FFF0F0',
  },
  liveBox: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#DCE6FA',
    gap: 10,
  },
  liveTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#16264F',
  },
  liveSub: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.sans,
  },
  emptyText: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#DCE6FA',
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 13,
    fontFamily: fonts.sans,
  },
});
