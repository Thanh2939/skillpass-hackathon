import React, { useCallback, useState } from 'react';
import { Image, Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, KV, LoadingScreen, Note, Screen, ScreenHeader } from '../components/ui';
import { SharedAccessGate } from '../components/SharedAccessGate';
import { getSharedCertificate } from '../services/supabase';
import type { CertificateRow } from '../types/database';
import { useApp } from '../store/AppContext';
import { fonts } from '../theme';

/** Detail is authorized using the share code, never the viewer's student identity. */
export function SharedCertificateScreen() {
  const { id, code } = useLocalSearchParams<{ id: string; code: string }>();
  const router = useRouter();
  const { authUser } = useApp();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  const permissionVersion = `${code}|${id}|${authUser?.id || 'anonymous'}|${attempt}`;
  const [loadedFor, setLoadedFor] = useState('');
  const [certificate, setCertificate] = useState<CertificateRow | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true;
    let sequence = 0;
    const load = () => {
      const request = ++sequence;
      setStatus('loading'); setCertificate(null); setPreview(null);
      getSharedCertificate(code || '', id || '').then((result) => {
        if (!active || request !== sequence) return;
        setStatus(result.status);
        setLoadedFor(permissionVersion);
        setCertificate(result.certificate || null);
      }).catch(() => { if (active && request === sequence) { setLoadedFor(permissionVersion); setStatus('error'); } });
    };
    load();
    const refresh = setInterval(load, 60000);
    return () => { active = false; clearInterval(refresh); };
  }, [code, id, permissionVersion]));
  const close = () => router.replace({ pathname: '/verify/[code]', params: { code } });
  if (status === 'loading' || loadedFor !== permissionVersion) return <LoadingScreen />;
  const docs = certificate?.evidence_documents || [];
  return (
    <Screen biz header={<ScreenHeader biz title="Chứng chỉ được chia sẻ" />} footer={<Button biz title="Đóng chi tiết" onPress={close} />}>
      {status !== 'ok' || !certificate ? <SharedAccessGate status={status} onRetry={() => setAttempt((value) => value + 1)} /> : <>
        <Card biz>
          <KV label="Tên chứng chỉ" value={certificate.title} />
          <KV label="Đơn vị cấp" value={certificate.org_name || 'Đang cập nhật'} />
          <KV label="Ngày cấp" value={certificate.issue_date_original || 'Chưa cập nhật'} />
          <KV label="Trạng thái" value="Đã phê duyệt" />
          {certificate.time_range ? <KV label="Thời gian" value={certificate.time_range} /> : null}
          {certificate.reviewer_label ? <KV label="Người duyệt" value={certificate.reviewer_label} /> : null}
          {certificate.tx_hash ? <KV label="Mã giao dịch" value={certificate.tx_hash} /> : null}
        </Card>
        <Text style={styles.heading}>Tài liệu minh chứng ({docs.length})</Text>
        {!docs.length ? <Note biz tone="info" title="Chưa có tài liệu">Hồ sơ chưa có minh chứng đính kèm để hiển thị.</Note> : null}
        {docs.map((doc) => {
          const url = doc.storage_path || '';
          const image = doc.mime_type?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(doc.file_name);
          return <Card biz key={doc.id}>
            <Text style={styles.name}>{doc.file_name}</Text>
            {image && url ? <Image accessibilityLabel={doc.file_name} source={{ uri: url }} style={styles.image} resizeMode="contain" /> : null}
            <Button biz variant="ghost" title={image ? 'Phóng to ảnh' : 'Mở tài liệu PDF / tập tin'} onPress={() => {
              if (!/^https?:\/\//i.test(url)) { setFileError('Liên kết tài liệu không hợp lệ.'); return; }
              if (image) setPreview(url);
              else Linking.openURL(url).catch(() => setFileError('Không mở được tài liệu. Hãy kiểm tra lại quyền và thử lại.'));
            }} />
          </Card>;
        })}
        {fileError ? <Note biz tone="bad" title="Không mở được minh chứng">{fileError}</Note> : null}
      </>}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.lightbox}>
          {preview ? <Image source={{ uri: preview }} style={styles.fullImage} resizeMode="contain" /> : null}
          <Button biz title="Đóng ảnh" onPress={() => setPreview(null)} />
        </View>
      </Modal>
    </Screen>
  );
}
const styles = StyleSheet.create({
  heading: { fontFamily: fonts.bold, color: '#102c42', fontSize: 17 },
  name: { fontFamily: fonts.semibold, color: '#102c42', fontSize: 14 },
  image: { width: '100%', height: 230 },
  lightbox: { flex: 1, backgroundColor: '#0E1726', padding: 24, justifyContent: 'center', gap: 16 },
  fullImage: { width: '100%', flex: 1 },
});
