import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, palette } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * Thông báo đẩy trượt xuống ở đầu màn hình chính — chuyển từ
 * .push / @keyframes pushin (hiện 6 giây sau 0.8 giây rồi ẩn đi).
 */
interface PushBannerProps {
  icon: IconName;
  title: string;
  message: string;
  onPress?: () => void;
  biz?: boolean;
}

const HIDE_Y = -160;

export function PushBanner({ icon, title, message, onPress, biz = false }: PushBannerProps) {
  const p = palette(biz);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(800),
      Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(4600),
      Animated.timing(progress, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [HIDE_Y, 0] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
      <Pressable onPress={onPress} style={styles.banner}>
        <View style={[styles.icon, { backgroundColor: biz ? '#e1f4f1' : p.okbg }]}>
          <Icon name={icon} size={20} color={biz ? p.brand : p.ok} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: p.ink }]}>{title}</Text>
          <Text style={[styles.msg, { color: p.mut }]}>{message}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 8, left: 12, right: 12, zIndex: 10 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.98)',
    shadowColor: 'rgba(14,27,51,0.25)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 13.5, fontWeight: '600', fontFamily: fonts.semibold },
  msg: { fontSize: 12.5, fontFamily: fonts.sans, marginTop: 1 },
});
