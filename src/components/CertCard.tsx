import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, palette } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Tag } from './ui';
import type { TagTone } from './ui';

/**
 * Thẻ chứng chỉ / yêu cầu — có vạch xanh bên trái + mũi tên › (sinh viên),
 * hoặc kiểu ô yêu cầu của doanh nghiệp (icon + không vạch).
 */
interface CertCardProps {
  title: string;
  subtitle?: string;
  sub2?: string;
  tag?: { tone: TagTone; label: string };
  onPress?: () => void;
  /** Thẻ nét đứt "+ Thêm..." */
  dashed?: boolean;
  /** Kiểu thẻ yêu cầu của doanh nghiệp (icon đầu dòng) */
  biz?: boolean;
  icon?: IconName;
  right?: React.ReactNode;
}

export function CertCard({ title, subtitle, sub2, tag, onPress, dashed, biz = false, icon, right }: CertCardProps) {
  const p = palette(biz);
  const body = (
    <View style={[styles.card, { borderColor: p.line }, biz ? styles.cardBiz : null]}>
      {!biz && !dashed ? <View style={[styles.stripe, { backgroundColor: p.brand }]} /> : null}
      {biz && icon ? (
        <View style={styles.bizIcon}>
          <Icon name={icon} size={19} color="#416f93" />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={[styles.title, biz && styles.titleBiz, { color: p.ink }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sub, biz && styles.subBiz, { color: p.mut }]}>{subtitle}</Text> : null}
        {sub2 ? <Text style={[styles.sub, biz && styles.subBiz, { color: p.mut }]}>{sub2}</Text> : null}
      </View>
      {right}
      {tag ? <Tag tone={tag.tone} biz={biz}>{tag.label}</Tag> : null}
      {!biz && !dashed && onPress ? <Text style={[styles.chev, { color: p.mut }]}>›</Text> : null}
    </View>
  );
  if (dashed) {
    return (
      <Pressable onPress={onPress}>
        <View style={[styles.card, styles.dashed, { borderColor: p.line }]}>
          <Text style={[styles.dashedText, { color: p.mut }]}>{title}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    paddingLeft: 20,
    borderWidth: 1.5,
    borderRadius: 18,
    backgroundColor: '#fff',
    shadowColor: 'rgba(40,60,140,0.07)',
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardBiz: { paddingLeft: 12, borderRadius: 16, borderWidth: 1, minHeight: 74, shadowOpacity: 0, elevation: 0 },
  stripe: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  bizIcon: { width: 41, height: 41, borderRadius: 12, backgroundColor: '#eaf0f8', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, marginBottom: 2 },
  titleBiz: { fontSize: 12 },
  sub: { fontSize: 12.5, fontFamily: fonts.sans },
  subBiz: { fontSize: 10 },
  chev: { fontSize: 22 },
  dashed: {
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    backgroundColor: '#fff',
    paddingLeft: 14,
  },
  dashedText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium, color: '#5E6F96' },
});
