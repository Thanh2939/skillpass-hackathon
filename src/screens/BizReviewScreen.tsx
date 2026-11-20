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
import { Button, Card, KV, LoadingScreen, Note, Screen, ScreenHeader, Steps } from '../components/ui';
import { Icon } from '../components/Icon';
import { useApp } from '../store/AppContext';
import * as supabaseService from '../services/supabase';
import type { EvidenceFile } from '../constants/mockData';

/** Màn Duyệt & ký số chứng chỉ sinh viên gửi lên — hỗ trợ Doanh nghiệp & Trường ĐH XEM MINH CHỨNG trực tiếp */
export function BizReviewScreen() {
  const router = useRouter();
  const p = palette(true);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { approveRequest, bizRequests, authReady, dataReady } = useApp();
  const [signing, setSigning] = useState(false);
  const [justApproved, setJustApproved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Danh sách tài liệu minh chứng
  const [remoteEvidence, setRemoteEvidence] = useState<{ id: string; files: EvidenceFile[] } | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<EvidenceFile | null>(null);

  const req = bizRequests.find((r) => r.id === id);

  // Nạp thêm danh sách minh chứng từ Supabase nếu có
  const initialList: EvidenceFile[] = [...(req?.evidenceFiles || [])];
  if (req?.evidenceUrl && !initialList.some((e) => e.url === req?.evidenceUrl)) {
    initialList.unshift({
      id: 'primary',
      name: req?.evidence || 'Minh chứng đính kèm',
      url: req?.evidenceUrl,
    });
  }
  const evidenceList = remoteEvidence && remoteEvidence.id === req?.id ? remoteEvidence.files : initialList;

  useEffect(() => {
    let active = true;

    if (!req) return;

    // Lấy từ req nếu đã có

    // Truy vấn thêm từ bảng evidence_documents
    async function fetchLiveDocs() {
      try {
        setLoadingEvidence(true);
        const docs = await supabaseService.getEvidenceDocuments(req?.id || '');
        if (active && docs.length > 0) {
          const mapped: EvidenceFile[] = docs.map((d) => ({
            id: d.id,
            name: d.file_name,
            url: d.storage_path || '',
            size: d.file_size ?? undefined,
          }));
          setRemoteEvidence({ id: req!.id, files: mapped });
        }
      } catch (err) {
        console.warn('Error fetching evidence for review:', err);
      } finally {
        if (active) setLoadingEvidence(false);
      }
    }

    fetchLiveDocs();
    return () => {
      active = false;
    };
  }, [req]);

  if (!authReady || !dataReady) return <LoadingScreen />;
  if (!req) {
    return (
      <Screen
        biz
        header={<ScreenHeader biz title="Duyệt chứng nhận" back />}
        footer={<Button biz title="Về trang chủ" onPress={() => router.replace('/biz')} />}
      >
        <Note biz tone="info" title="Chưa có yêu cầu cần duyệt">
          Hiện tại chưa có sinh viên nào gửi tài liệu tới đơn vị của bạn.
        </Note>
      </Screen>
    );
  }

  const isReqApproved = justApproved || req.status === 'approved';
  const isRejected = req.status === 'rejected';

  const handleApprove = async () => {
    if (signing) return;
    setActionError(null);
    setSigning(true);
    try {
      await approveRequest(req.id);
      setJustApproved(true);
    } catch (err: any) {
      setActionError(err?.message ?? 'Chưa phê duyệt được hồ sơ. Vui lòng thử lại.');
      Alert.alert('Phê duyệt thất bại', err?.message ?? 'Đã có lỗi xảy ra trong quá trình phê duyệt.');
    } finally {
      setSigning(false);
    }
  };

  const openDocument = (url?: string) => {
    if (!url) {
      Alert.alert('Không thể mở', 'Liên kết tài liệu không tồn tại hoặc bị lỗi.');
      return;
    }
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch(() => {
        Alert.alert('Lỗi', 'Không thể mở liên kết tài liệu trên thiết bị này.');
      });
    }
  };

  return (
    <Screen
      biz
      header={<ScreenHeader biz title="Thẩm định chứng nhận" back />}
      scrollFooter
      footer={
        isReqApproved || isRejected ? (
          <Button biz title="Về trang chủ" onPress={() => router.replace('/biz')} />
        ) : (
          <>
            <Button
              biz
              title={signing ? 'Đang xử lý phê duyệt...' : 'Phê duyệt chứng nhận'}
              disabled={signing}
              onPress={handleApprove}
            />
            <Button
              biz
              title="Từ chối yêu cầu"
              variant="danger"
              disabled={signing}
              onPress={() => router.push(`/biz/reject?id=${req.id}` as any)}
            />
          </>
        )
      }
    >
      {actionError ? <Note biz tone="bad" title="Chưa thể phê duyệt">{actionError}</Note> : null}
      {isRejected ? (
        <Note biz tone="bad" title="Hồ sơ đã từ chối">
          {req.rejectionReason || 'Chưa có lý do được ghi nhận.'}{'\n'}
          Ngày xử lý: {req.rejectedAt || 'Chưa cập nhật'}
          {req.fixGuide ? `\nHướng dẫn bổ sung: ${req.fixGuide}` : ''}
        </Note>
      ) : isReqApproved ? (
        <Note biz tone="ok" title="Đã phê duyệt thành công!">
          Chứng nhận đã được xác thực chính thức và cập nhật trực tiếp vào hồ sơ của sinh viên {req.student}.
        </Note>
      ) : (
        <Note biz tone="info" title="Yêu cầu xác thực từ sinh viên">
          Vui lòng kiểm tra kỹ các hình ảnh, tài liệu minh chứng đính kèm bên dưới và đối chiếu thông tin sinh viên trước khi phê duyệt.
        </Note>
      )}

      {/* Thông tin hồ sơ */}
      <Card biz>
        <KV label="Sinh viên" value={req.student} />
        <KV label="MSSV" value={req.mssv ?? 'Chưa cập nhật'} />
        <KV label="Trường đào tạo" value={req.school ?? 'Chưa cập nhật'} />
        <KV label="Tên chứng nhận" value={req.title} />
        <KV label="Đơn vị cấp" value={req.org ?? ''} />
        <KV label="Thời gian cấp" value={req.timeRange ?? req.date} />
      </Card>

      {/* KHU VỰC XEM MINH CHỨNG CỦA SINH VIÊN */}
      <View style={styles.evidenceContainer}>
        <View style={styles.evidenceHead}>
          <View style={[styles.bar, { backgroundColor: p.brand }]} />
          <Text style={[styles.evidenceTitle, { color: p.ink }]}>
            Tài liệu minh chứng sinh viên gửi ({evidenceList.length})
          </Text>
        </View>
        <Text style={[styles.evidenceSub, { color: p.mut }]}>
          Bấm vào hình ảnh hoặc nút &quot;Xem minh chứng&quot; để phóng to hoặc mở toàn màn hình kiểm tra chi tiết.
        </Text>

        {evidenceList.length === 0 ? (
          <View style={styles.emptyEvidence}>
            <Text style={[styles.emptyText, { color: p.mut }]}>
              {loadingEvidence
                ? 'Đang tải tài liệu minh chứng...'
                : req.evidence
                ? `Minh chứng: ${req.evidence}`
                : 'Sinh viên không đính kèm minh chứng bổ sung.'}
            </Text>
            {req.evidenceUrl ? (
              <Pressable style={styles.viewBtn} onPress={() => openDocument(req.evidenceUrl)}>
                <Icon name="search" size={16} color="#008d83" />
                <Text style={styles.viewBtnText}>Mở tài liệu gốc ↗</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
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
                  {/* Thumbnail / Icon */}
                  {isImg && doc.url ? (
                    <Pressable onPress={() => setPreviewDoc(doc)} style={styles.thumbWrapper}>
                      <Image source={{ uri: doc.url }} style={styles.thumbImg} resizeMode="cover" />
                      <View style={styles.zoomPill}>
                        <Icon name="search" size={12} color="#fff" />
                        <Text style={styles.zoomPillText}>Phóng to</Text>
                      </View>
                    </Pressable>
                  ) : (
                    <View style={styles.docIconWrap}>
                      <Text style={{ fontSize: 28 }}>{isPdf ? '📕' : '📄'}</Text>
                    </View>
                  )}

                  {/* Info & View Actions */}
                  <View style={styles.docInfo}>
                    <Text style={[styles.docName, { color: p.ink }]} numberOfLines={2}>
                      {idx + 1}. {doc.name || 'Tài liệu minh chứng'}
                    </Text>
                    <Text style={[styles.docMeta, { color: p.mut }]}>
                      {isPdf ? 'Tài liệu PDF định dạng chuẩn' : isImg ? 'Hình ảnh chụp văn bằng / chứng chỉ' : 'Tập tin đính kèm'}
                    </Text>

                    <View style={styles.actionRow}>
                      {isImg && doc.url ? (
                        <Pressable style={styles.actionBtnPrimary} onPress={() => setPreviewDoc(doc)}>
                          <Icon name="search" size={14} color="#fff" />
                          <Text style={styles.actionBtnPrimaryText}>Xem ảnh</Text>
                        </Pressable>
                      ) : null}

                      {doc.url ? (
                        <Pressable style={styles.actionBtnSecondary} onPress={() => openDocument(doc.url)}>
                          <Text style={styles.actionBtnSecondaryText}>Mở tab mới ↗</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Steps
        steps={['Sinh viên gửi minh chứng', 'Đang xác thực', 'Đã xác thực']}
        onCount={isReqApproved ? 3 : 2}
      />

      {/* Modal Lightbox Phóng to minh chứng */}
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

          <ScrollView
            contentContainerStyle={styles.modalContent}
            maximumZoomScale={3}
            minimumZoomScale={1}
            showsVerticalScrollIndicator={false}
          >
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
  evidenceContainer: {
    gap: 10,
    marginTop: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#edf8f5',
    borderWidth: 1,
    borderColor: '#cde7de',
  },
  evidenceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bar: { width: 4, height: 16, borderRadius: 2 },
  evidenceTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
  evidenceSub: {
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.sans,
  },
  emptyEvidence: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#cde0dd',
    backgroundColor: '#f8fafb',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.sans,
    textAlign: 'center',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e6f5f3',
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#008d83',
  },
  docList: {
    gap: 10,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#d2e4e1',
    backgroundColor: '#ffffff',
    shadowColor: '#008d83',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  thumbWrapper: {
    position: 'relative',
    width: 76,
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#edf4f3',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  zoomPill: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  zoomPillText: {
    fontSize: 9.5,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#fff',
  },
  docIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#f0f6f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: {
    flex: 1,
    gap: 4,
  },
  docName: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
  docMeta: {
    fontSize: 12,
    fontFamily: fonts.sans,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#008d83',
  },
  actionBtnPrimaryText: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#fff',
  },
  actionBtnSecondary: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cde0dd',
    backgroundColor: '#f7faf9',
  },
  actionBtnSecondaryText: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#008d83',
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
    backgroundColor: '#008d83',
  },
  openFullBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#fff',
  },
});
