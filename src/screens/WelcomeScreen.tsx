import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import { Screen } from '../components/ui';
import { Orbit } from '../components/Orbit';
import { Duck } from '../components/Duck';
import type { DuckVariant } from '../components/Duck';

/** Màn chào mừng — chọn vai trò (welcome → sinh viên / doanh nghiệp / quét) */

function RoleCard({
  variant,
  title,
  sub,
  to,
}: {
  variant: DuckVariant;
  title: string;
  sub: string;
  to: string;
}) {
  const router = useRouter();
  const p = palette(false);
  const inner = (
    <>
      <Duck variant={variant} width={64} height={64} />
      <View style={styles.roleText}>
        <Text style={[styles.roleTitle, { color: p.ink, fontFamily: fonts.display }]}>{title}</Text>
        <Text style={[styles.roleSub, { color: p.mut }]}>{sub}</Text>
      </View>
      <Text style={[styles.chev, { color: p.mut }]}>›</Text>
    </>
  );
  return (
    <Pressable onPress={() => router.push(to as any)}>
      <LinearGradient
        colors={variant === 'scan' ? ['#fff', '#EAF1FF'] : ['#fff', '#fff']}
        style={[styles.role, variant === 'scan' && { borderColor: '#BFD3FF' }]}
      >
        {inner}
      </LinearGradient>
    </Pressable>
  );
}

export function WelcomeScreen() {
  const p = palette(false);
  return (
    <Screen>
      <LinearGradient
        colors={['#C9DDFF', '#EAF1FF']}
        style={styles.hero}
      >
        <Orbit />
        <Text style={[styles.h1, { color: p.ink, fontFamily: fonts.displaybold }]}>Chào mừng bạn</Text>
        <Text style={[styles.sub, { color: p.mut }]}>Bạn dùng SkillPass với vai trò nào?</Text>
      </LinearGradient>
      <RoleCard
        variant="plain"
        title="Sinh viên"
        sub="Lưu và chia sẻ chứng chỉ của bạn"
        to="/login"
      />
      <RoleCard
        variant="tie"
        title="Doanh nghiệp"
        sub="Xác thực chứng chỉ của ứng viên"
        to="/biz/login"
      />
      <RoleCard
        variant="scan"
        title="Quét"
        sub="HR quét mã QR trên CV để kiểm tra thông tin sinh viên có đúng không"
        to="/scan"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 4,
    paddingHorizontal: 20,
    paddingVertical: 22,
    paddingBottom: 26,
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
    alignItems: 'center',
    gap: 4,
  },
  h1: { fontSize: 34, letterSpacing: -0.02, textAlign: 'center' },
  sub: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  role: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 88,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 18,
    backgroundColor: '#fff',
    shadowColor: 'rgba(40,60,140,0.07)',
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  roleText: { flex: 1, gap: 2 },
  roleTitle: { fontSize: 18 },
  roleSub: { fontSize: 13, fontFamily: fonts.sans },
  chev: { fontSize: 20 },
});
