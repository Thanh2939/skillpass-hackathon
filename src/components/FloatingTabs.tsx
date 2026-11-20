import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, palette } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface TabItem {
  key: string;
  icon: IconName;
  label: string;
}

interface FloatingTabsProps {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Kiểu doanh nghiệp: thanh full-width ở đáy thay vì viên thuốc nổi */
  biz?: boolean;
}

export function FloatingTabs({ items, activeKey, onSelect, biz = false }: FloatingTabsProps) {
  const p = palette(biz);
  return (
    <View style={[styles.tabs, biz ? styles.tabsBiz : null, { backgroundColor: p.tabBg }]}>
      {items.map((t) => {
        const active = t.key === activeKey;
        return (
          <Pressable key={t.key} style={styles.tab} onPress={() => onSelect(t.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Icon name={t.icon} size={biz ? 21 : 22} color={active ? p.brand : p.mut} />
            <Text style={[styles.label, biz && styles.labelBiz, { color: active ? p.brand : p.mut }, active && styles.labelActive]}>
              {t.label}
            </Text>
            {active && !biz ? <View style={[styles.dot, { backgroundColor: p.brand }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 4,
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingBottom: 14,
    borderRadius: 26,
    shadowColor: 'rgba(30,70,180,0.2)',
    shadowOpacity: 1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tabsBiz: {
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
    paddingTop: 13,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#e4edf0',
    shadowColor: 'rgba(34,69,89,0.06)',
    shadowRadius: 11,
    shadowOffset: { width: 0, height: -3 },
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, position: 'relative' },
  label: { fontSize: 11.5, fontFamily: fonts.medium },
  labelBiz: { fontSize: 10 },
  labelActive: { fontWeight: '600', fontFamily: fonts.semibold },
  dot: { position: 'absolute', bottom: -8, width: 24, height: 3, borderRadius: 2 },
});
