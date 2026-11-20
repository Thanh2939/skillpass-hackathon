import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Button, Card, KV, LoadingScreen, Note, Screen, ScreenHeader } from '../components/ui';
import { Icon } from '../components/Icon';
import { orgTypeLabel } from '../constants/mockData';
import type { EvidenceFile } from '../constants/mockData';
import { useApp } from '../store/AppContext';
import * as supabaseService from '../services/supabase';

/** Màn Chi tiết chứng chỉ — hỗ trợ xem lại toàn bộ minh chứng sinh viên đã gửi */
export function CertDetailScreen() {
  const router = useRouter();
  const p = palette(false);
  const { certs, authReady, dataReady } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cert = certs.find((c) => c.id === id);

  const [remoteEvidence, setRemoteEvidence] = useState<{ id: string; files: EvidenceFile[] } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EvidenceFile | null>(null);

  const initialList: EvidenceFile[] = [...(cert?.evidenceFiles || [])];
  if (cert?.evidenceUrl && !initialList.some((e) => e.url === cert?.evidenceUrl)) {
    initialList.unshift({
      id: 'primary',
      name: cert?.evidenceName || 'Minh chứng đính kèm',
      url: cert?.evidenceUrl,
    });
  }
  const evidenceList = remoteEvidence && remoteEvidence.id === cert?.id ? remoteEvidence.files : initialList;

  useEffect(() => {
    let active = true;
    if (!cert) return;


    // Truy vấn thêm từ bảng evidence_documents nếu chưa nạp đủ
    supabaseService
      .getEvidenceDocuments(cert.id)
      .then((docs) => {
        if (active && docs.length > 0) {
          const mapped: EvidenceFile[] = docs.map((d) => ({
            id: d.id,
            name: d.file_name,
            url: d.storage_path || '',
            size: d.file_size ?? undefined,
          }));
          setRemoteEvidence({ id: cert.id, files: mapped });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [cert]);

  if (!authReady || !dataReady) return <LoadingScreen />;
  if (!cert) return <Screen header={<ScreenHeader title="Chi tiết chứng chỉ" />} footer={<Button title="Đóng" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}><Note tone="info" title="Không tìm thấy chứng chỉ">Chứng chỉ không tồn tại hoặc không thuộc tài khoản đang đăng nhập. Nếu bạn nhận liên kết chia sẻ, hãy mở chứng chỉ từ trang kiểm chứng của liên kết đó.</Note></Screen>;

   const waiting = cert.status === 'under_review' || cert.status === 'submitted';

  const openDocument = (url?: string) => {
    if (!url) {
      Alert.alert('Không thể mở', 'Liên kết tài liệu không tồn tại.');
      return;
    }
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch(() => {
        Alert.alert('Lỗi', 'Không thể mở liên kết tài liệu.');
      });
    }
  };

  return (
    <Screen header={<ScreenHeader title="Chi tiết chứng chỉ" back />}>
      {cert.autoSync ? (
        <Note tone="ok" title="Chứng nhận chính thức">
          Chứng chỉ do nhà trường xác nhận và cấp phát chính thức, tự động hiển thị trong hồ sơ của bạn.
        </Note>
      ) : waiting ? (
        <Note tone="info" title="Đang chờ duyệt">
          Đơn vị đang rà soát các tài liệu minh chứng của bạn. Bạn sẽ nhận được thông báo ngay khi hoàn tất.
        </Note>
      ) : cert.status === 'rejected' ? (
        <Note tone="bad" title="Đã từ chối">{cert.rejectionReason || 'Vui lòng liên hệ đơn vị cấp để biết lý do.'}</Note>
      ) : (
        <Note tone="ok" title="Đã phê duyệt chính thức">
          Đơn vị đã kiểm tra các tài liệu minh chứng và phê duyệt chứng nhận cho bạn.
        </Note>
      )}

      <Card>
        <KV label="Tên chứng chỉ" value={cert.title} />
        <KV label="Loại đơn vị cấp" value={orgTypeLabel(cert)} />
        <KV label="Tên đơn vị cấp" value={cert.org} />
        <KV label="Ngày cấp" value={cert.issueDate ?? ''} />
        <KV label="Ngày gửi" value={cert.autoSync ? 'Tự động đồng bộ' : cert.submittedAt ?? ''} />
        <KV label="Ngày duyệt" value={waiting ? 'Chưa có' : cert.reviewedAt ?? ''} />
        <KV label="Người xử lý" value={cert.reviewer ?? ''} />
        {waiting ? <KV label="Dự kiến có kết quả" value={cert.expected ?? '1–3 ngày'} /> : null}
        {cert.txHash ? (
          <KV
            label="Mã chứng thực số"
            value={cert.txHash}
          />
        ) : null}
        {cert.autoSync ? <KV label="Hình thức" value="Nhà trường cấp phát chính thức" /> : null}
      </Card>

      {/* Danh sách minh chứng sinh viên đã gửi */}
      {evidenceList.length > 0 ? (
        <View style={styles.evidenceBox}>
          <Text style={[styles.evidenceTitle, { color: p.ink }]}>
            Tài liệu minh chứng đã nộp ({evidenceList.length})
          </Text>

          <View style={styles.docList}>
            {evidenceList.map((doc, idx) => {
              const isImg =
                doc.url &&
                (/\.(jpg|jpeg|png|webp|svg)/i.test(doc.url) ||
                  /\.(jpg|jpeg|png|webp|svg)/i.test(doc.name) ||
                  doc.url.includes('/evidence/'));
              const isPdf = doc.name.toLowerCase().endsWith('.pdf') || doc.url?.includes('.pdf');

              return (
                <View key={doc.id || idx} style={styles.docCard}>
                  {isImg && doc.url ? (
                    <Pressable onPress={() => setPreviewDoc(doc)} style={styles.thumbWrap}>
                      <Image source={{ uri: doc.url }} style={styles.thumbImg} resizeMode="cover" />
                    </Pressable>
                  ) : (
                    <View style={styles.iconWrap}>
                      <Text style={{ fontSize: 24 }}>{isPdf ? '📕' : '📄'}</Text>
                    </View>
                  )}

                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={styles.docName} numberOfLines={1}>
                      {idx + 1}. {doc.name}
                    </Text>
                    <Text style={[styles.docType, { color: p.mut }]}>
                      {isPdf ? 'Tài liệu PDF' : isImg ? 'Hình ảnh minh chứng' : 'Tập tin đính kèm'}
                    </Text>
                  </View>

                  <Pressable style={styles.openBtn} onPress={() => openDocument(doc.url)}>
                    <Text style={styles.openBtnText}>Xem file ↗</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Modal Lightbox */}
      <Modal visible={!!previewDoc} transparent animationType="fade" onRequestClose={() => setPreviewDoc(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {previewDoc?.name || 'Chi tiết minh chứng'}
            </Text>
            <Pressable onPress={() => setPreviewDoc(null)} style={styles.closeBtn} hitSlop={12}>
              <Icon name="x" size={20} color="#fff" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {previewDoc?.url ? (
              <Image source={{ uri: previewDoc.url }} style={styles.modalImg} resizeMode="contain" />
            ) : null}
          </ScrollView>
          <View style={styles.modalFoot}>
            <Pressable style={styles.openFullBtn} onPress={() => openDocument(previewDoc?.url)}>
              <Text style={styles.openFullBtnText}>Mở toàn màn hình trong tab mới ↗</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  evidenceBox: {
    gap: 10,
    marginTop: 6,
  },
  evidenceTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
  docList: {
    gap: 8,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    backgroundColor: '#fff',
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#EEF2F6',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#EFF4FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#16264F',
  },
  docType: {
    fontSize: 11.5,
    fontFamily: fonts.sans,
  },
  openBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EEF4FF',
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#2F66F0',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(10, 20, 30, 0.94)',
    justifyContent: 'space-between',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 44,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#fff',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  modalContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  modalImg: {
    width: '100%',
    height: '100%',
    minHeight: 380,
  },
  modalFoot: {
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
  },
  openFullBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#2F66F0',
  },
  openFullBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#fff',
  },
});
