import { Platform } from 'react-native';

/**
 * SkillPass design system — bảng màu & font trích từ file thiết kế HTML
 * (design/style.css cho Sinh viên, design/style_fixed.css cho Doanh nghiệp).
 * Phải khớp với tailwind.config.js.
 */

export const fonts = {
  sans: Platform.OS === 'web' ? 'BeVietnamPro_400Regular, "Be Vietnam Pro", -apple-system, sans-serif' : 'BeVietnamPro_400Regular',
  medium: Platform.OS === 'web' ? 'BeVietnamPro_500Medium, "Be Vietnam Pro", -apple-system, sans-serif' : 'BeVietnamPro_500Medium',
  semibold: Platform.OS === 'web' ? 'BeVietnamPro_600SemiBold, "Be Vietnam Pro", -apple-system, sans-serif' : 'BeVietnamPro_600SemiBold',
  bold: Platform.OS === 'web' ? 'BeVietnamPro_700Bold, "Be Vietnam Pro", -apple-system, sans-serif' : 'BeVietnamPro_700Bold',
  display: Platform.OS === 'web' ? 'Baloo2_600SemiBold, "Baloo 2", -apple-system, sans-serif' : 'Baloo2_600SemiBold',
  displaybold: Platform.OS === 'web' ? 'Baloo2_700Bold, "Baloo 2", -apple-system, sans-serif' : 'Baloo2_700Bold',
} as const;

export interface Palette {
  ink: string;
  mut: string;
  brand: string;
  line: string;
  ok: string;
  okbg: string;
  wait: string;
  waitbg: string;
  bad: string;
  badbg: string;
  duck: string;
  red: string;
  bg: string;
  /** Màu gradient nền màn hình */
  screenGradient: readonly [string, string, ...string[]];
  /** Gradient nút chính */
  btnGradient: readonly [string, string, ...string[]];
  /** Gradient khung hello */
  helloGradient: readonly [string, string, ...string[]];
  /** Màu nền tab bar */
  tabBg: string;
}

/** Bảng màu Sinh viên (xanh dương #2F66F0) */
export const student: Palette = {
  ink: '#16264F',
  mut: '#5E6F96',
  brand: '#2F66F0',
  line: '#DCE6FA',
  ok: '#12906A',
  okbg: '#DCF6EA',
  wait: '#A85F00',
  waitbg: '#FFE7C7',
  bad: '#E5484D',
  badbg: '#FFE4E6',
  duck: '#FFCF40',
  red: '#F2545B',
  bg: '#EAF1FF',
  screenGradient: ['#D6E6FF', '#EAF1FF', '#F4F7FF'],
  btnGradient: ['#3C77F7', '#2150D4'],
  helloGradient: ['#1B3A9C', '#2F66F0'],
  tabBg: '#FFFFFF',
};

/** Bảng màu Doanh nghiệp (teal #008d83, "premium redesign") */
export const business: Palette = {
  ink: '#102c42',
  mut: '#7890a4',
  brand: '#008d83',
  line: '#e0e9ef',
  ok: '#087c5e',
  okbg: '#e8f7ed',
  wait: '#a66a00',
  waitbg: '#fff3d9',
  bad: '#d44848',
  badbg: '#fff0f0',
  duck: '#FFCF40',
  red: '#de8548',
  bg: '#f3f7f9',
  screenGradient: ['#f6f9fb', '#edf3f6'],
  btnGradient: ['#0b756f', '#0b756f'],
  helloGradient: ['#0d2e45', '#184b58'],
  tabBg: '#FFFFFF',
};

/** Lấy palette theo vai trò */
export function palette(biz: boolean): Palette {
  return biz ? business : student;
}
