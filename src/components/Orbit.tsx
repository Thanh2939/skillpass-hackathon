import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * Hiệu ứng quỹ đạo ở màn chào mừng (thay cho con vịt) — chuyển từ
 * CSS .orbit / @keyframes spin, ripple, beat, twinkle trong design/style.css.
 */
interface OrbitProps {
  size?: number;
}

const SATS: IconName[] = ['wallet', 'qr', 'biz'];

export function Orbit({ size = 176 }: OrbitProps) {
  const [ringSpin] = useState(() => new Animated.Value(0));
  const [ripple] = useState(() => new Animated.Value(0));
  const [beat] = useState(() => new Animated.Value(0));
  const [sparks] = useState(() => [new Animated.Value(0), new Animated.Value(-0.33), new Animated.Value(-0.66)]);

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    loops.push(
      Animated.loop(Animated.timing(ringSpin, { toValue: 1, duration: 20000, easing: Easing.linear, useNativeDriver: true, isInteraction: false })),
      Animated.loop(Animated.timing(ripple, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(beat, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
          Animated.timing(beat, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
        ]),
      ),
    );
    sparks.forEach((s, i) => {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(s, { toValue: 1, duration: 1200 - i * 100, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
            Animated.timing(s, { toValue: 0, duration: 1200 - i * 100, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
          ]),
        ),
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [ringSpin, ripple, beat, sparks]);

  const ringRotate = ringSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rippleScale = ripple.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  const beatScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });

  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      {/* Vòng đứt nét xoay */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: ringRotate }] }]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 2}
            stroke="rgba(47,102,240,0.38)"
            strokeWidth={2}
            strokeDasharray="6 8"
            fill="none"
          />
        </Svg>
      </Animated.View>
      {/* Vòng sóng lan */}
      <Animated.View
        style={[
          styles.ripple,
          {
            top: 30,
            bottom: 30,
            left: 30,
            right: 30,
            borderRadius: (size - 60) / 2,
            opacity: rippleOpacity,
            transform: [{ scale: rippleScale }],
          },
        ]}
      />
      {/* Lõi */}
      <Animated.View
        style={[
          styles.core,
          { top: 52, bottom: 52, left: 52, right: 52, borderRadius: (size - 104) / 2, transform: [{ scale: beatScale }] },
        ]}
      >
        <LinearGradient colors={['#4C86FF', '#1E4FD8']} style={styles.coreGradient}>
          <Icon name="ok" size={38} color="#fff" strokeWidth={2} />
        </LinearGradient>
      </Animated.View>
      {/* Vệ tinh */}
      {SATS.map((icon, i) => {
        const phase = (i * 360) / SATS.length;
        const rotate = ringSpin.interpolate({ inputRange: [0, 1], outputRange: [`${phase}deg`, `${phase + 360}deg`] });
        const counter = ringSpin.interpolate({ inputRange: [0, 1], outputRange: [`${-phase}deg`, `${-phase - 360}deg`] });
        return (
          <Animated.View key={icon} style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
            <Animated.View style={[styles.satChip, { left: size / 2 - 19, top: -19, transform: [{ rotate: counter }] }]}>
              <Icon name={icon} size={20} color="#2F66F0" />
            </Animated.View>
          </Animated.View>
        );
      })}
      {/* Đốm sáng */}
      <Animated.View
        style={[styles.spark, { top: 6, right: 22, width: 8, height: 8, opacity: sparks[0].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ scale: sparks[0].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) }] }]}
      />
      <Animated.View
        style={[styles.spark, { bottom: 14, left: 10, width: 6, height: 6, opacity: sparks[1].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ scale: sparks[1].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) }] }]}
      />
      <Animated.View
        style={[styles.spark, { bottom: 26, right: 2, width: 5, height: 5, opacity: sparks[2].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ scale: sparks[2].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ripple: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(47,102,240,0.16)' },
  core: { position: 'absolute', shadowColor: 'rgba(47,102,240,0.45)', shadowOpacity: 1, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 6 },
  coreGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  satChip: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(40,60,140,0.22)',
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  spark: { position: 'absolute', borderRadius: 99, backgroundColor: '#7FB0FF' },
});
