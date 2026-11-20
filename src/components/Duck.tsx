import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

/**
 * Vịt vàng linh vật SkillPass — 3 biến thể từ design/Skillpass.html:
 *  - plain: vịt thường
 *  - tie:   vịt đeo cà vạt (vai trò Doanh nghiệp)
 *  - scan:  vịt đeo kính quét QR (màn Quét)
 */
export type DuckVariant = 'plain' | 'tie' | 'scan';

interface DuckProps {
  variant?: DuckVariant;
  width?: number;
  height?: number;
  tieColor?: string;
  /** Nhún lên xuống như animation bob trong CSS */
  bob?: boolean;
}

function DuckBody({ tieColor, withTie }: { tieColor: string; withTie: boolean }) {
  return (
    <G>
      {/* bóng đổ */}
      <Ellipse cx="60" cy="114" rx="30" ry="4" fill="#12304F" opacity={0.1} />
      {/* chân */}
      <Path d="M46 111h12M62 111h12" stroke="#FF9F2E" strokeWidth={5} strokeLinecap="round" fill="none" />
      {/* cánh */}
      <Ellipse cx="28" cy="84" rx="9" ry="16" fill="#F7B92B" rotation={14} originX={28} originY={84} />
      <Ellipse cx="92" cy="84" rx="9" ry="16" fill="#F7B92B" rotation={-14} originX={92} originY={84} />
      {/* thân */}
      <Ellipse cx="60" cy="82" rx="36" ry="27" fill="#FFCF40" />
      <Ellipse cx="60" cy="88" rx="21" ry="15" fill="#FFE382" />
      {/* đầu */}
      <Circle cx="60" cy="44" r="28" fill="#FFD94E" />
      <Path d="M55 17c-3-7 4-10 6-4 3-5 9 0 4 5z" fill="#FFD94E" />
      {/* mỏ */}
      <Path d="M47 50c4-6 22-6 26 0-3 9-23 9-26 0z" fill="#FF9F2E" />
      {/* mắt */}
      <Circle cx="47" cy="39" r="4.2" fill="#12304F" />
      <Circle cx="73" cy="39" r="4.2" fill="#12304F" />
      <Circle cx="48.5" cy="37.5" r="1.4" fill="#fff" />
      <Circle cx="74.5" cy="37.5" r="1.4" fill="#fff" />
      {/* má hồng */}
      <Circle cx="37" cy="50" r="5" fill="#FF8FA3" opacity={0.55} />
      <Circle cx="83" cy="50" r="5" fill="#FF8FA3" opacity={0.55} />
      {/* cà vạt (chỉ khi variant tie/scan) */}
      {withTie ? (
        <G>
          <Path d="M50 70l8 6-10 3zM70 70l-8 6 10 3z" fill="#fff" />
          <Path d="M53 71h14l-2.5 6h-9z" fill="#1E4FD8" />
          <Path d="M57 77h6l5 19-8 6-8-6z" fill={tieColor} />
          <Path d="M60 79v17" stroke="#1E4FD8" strokeWidth={1.5} opacity={0.5} fill="none" />
        </G>
      ) : null}
    </G>
  );
}

function ScanOverlay() {
  return (
    <G>
      {/* vòng quét quanh mắt */}
      <Circle cx="73" cy="39" r="15" fill="#fff" fillOpacity={0.45} stroke="#2F66F0" strokeWidth={5} />
      <Circle cx="73" cy="39" r="7.5" fill="#12304F" />
      <Circle cx="75.5" cy="36.5" r="2.4" fill="#fff" />
      <Path d="M63 31a12 12 0 0 1 8-6" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.9} />
      {/* tia quét */}
      <Path d="M82 52l19 20" stroke="#1E4FD8" strokeWidth={6} strokeLinecap="round" fill="none" />
      {/* cánh sau phải vẫy */}
      <Ellipse cx="102" cy="74" rx="7" ry="9" fill="#F7B92B" rotation={-25} originX={102} originY={74} />
    </G>
  );
}

export function Duck({ variant = 'plain', width = 104, height = 104, tieColor = '#2F66F0', bob = false }: DuckProps) {
  const [y] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!bob) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -6, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, y]);

  return (
    <Animated.View style={[styles.wrap, { width, height, transform: [{ translateY: y }] }]}>
      <Svg width="100%" height="100%" viewBox="0 0 120 120">
        <DuckBody tieColor={tieColor} withTie={variant === 'tie' || variant === 'scan'} />
        {variant === 'scan' ? <ScanOverlay /> : null}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
