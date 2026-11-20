import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Button, Card, KV, Note, Screen, ScreenHeader } from '../components/ui';
import { orgTypeLabel } from '../constants/mockData';
import { useApp } from '../store/AppContext';

/** Màn Chi tiết chứng chỉ bị từ chối (design #rejected) */
export function RejectedScreen() {
  const router = useRouter();
  const { certs } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const cert = certs.find((c) => c.id === id && c.status === 'rejected');

  if (!cert) {
    return (
      <Screen
        header={<ScreenHeader title="Chi tiết chứng chỉ" back />}
        footer={<Button title="Quay về hồ sơ" onPress={() => router.replace('/home')} />}
      >
        <Note tone="info" title="Không có chứng chỉ bị từ chối">
          Hiện tại không có chứng chỉ nào trong hồ sơ của bạn bị từ chối.
        </Note>
      </Screen>
    );
  }

  return (
    <Screen
      header={<ScreenHeader title="Chi tiết chứng chỉ" back />}
      footer={<Button title="Gửi lại chứng chỉ" onPress={() => router.push('/submit')} />}
    >
      <Note tone="bad" title="Yêu cầu bổ sung hồ sơ">
        Đơn vị yêu cầu bổ sung thông tin hoặc chưa thể phê duyệt hồ sơ này.
      </Note>
      <Card>
        <KV label="Tên chứng chỉ" value={cert.title} />
        <KV label="Loại đơn vị cấp" value={orgTypeLabel(cert)} />
        <KV label="Tên đơn vị cấp" value={cert.org} />
        <KV label="Ngày cấp" value={cert.issueDate ?? ''} />
        <KV label="Ngày gửi" value={cert.submittedAt ?? ''} />
        <KV label="Từ chối lúc" value={cert.rejectionAt ?? ''} />
        <KV label="Người xử lý" value={cert.reviewer ?? ''} />
      </Card>
      <View style={styles.whyCard}>
        <Text style={styles.whyTitle}>Nguyên nhân từ chối</Text>
        <Text style={styles.whyBody}>
          {cert.rejectionReason}
          {'\n'}
          <Text style={styles.whyFix}>Cách khắc phục:</Text> {cert.fixGuide}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  whyCard: {
    padding: 16,
    borderLeftWidth: 5,
    borderLeftColor: '#E5484D',
    borderRadius: 18,
    backgroundColor: '#FFE4E6',
    gap: 4,
  },
  whyTitle: { fontSize: 15, fontWeight: '600', fontFamily: fonts.display, color: '#E5484D' },
  whyBody: { fontSize: 14, lineHeight: 22, fontFamily: fonts.sans, color: '#8F2022' },
  whyFix: { fontWeight: '700', fontFamily: fonts.bold },
});
