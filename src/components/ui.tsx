import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fonts, palette } from '../theme';
import {
  MIN_DATE_YEAR,
  YEAR_PAGE_SIZE,
  daysInMonth,
  formatCalendarDate,
  parseCalendarDate,
} from '../utils/calendarDate';
import { Duck } from './Duck';
import type { DuckVariant } from './Duck';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/* ================= Web: bỏ outline đen mặc định của trình duyệt ================= */

const WEB_INPUT_CSS = `
  input[data-sp-input="true"]:focus,
  textarea[data-sp-input="true"]:focus {
    outline: none !important;
    box-shadow: none !important;
  }
  input[data-sp-input="true"]::-ms-reveal,
  input[data-sp-input="true"]::-ms-clear {
    display: none !important;
  }
  input[data-sp-input="true"]::-webkit-search-cancel-button {
    display: none !important;
  }
  [data-sp-crop="true"] {
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
`;

let webInputCssInjected = false;

function ensureWebInputCss() {
  if (Platform.OS !== 'web' || webInputCssInjected) return;
  if (typeof document === 'undefined' || !document.head) return;
  if (!document.querySelector('style[data-skillpass-inputs="true"]')) {
    const el = document.createElement('style');
    el.setAttribute('data-skillpass-inputs', 'true');
    el.textContent = WEB_INPUT_CSS;
    document.head.appendChild(el);
  }
  webInputCssInjected = true;
}

function useWebInputCss() {
  useEffect(() => {
    ensureWebInputCss();
  }, []);
}

/** data-* để CSS ẩn outline/eye mặc định của trình duyệt (chỉ có tác dụng trên web) */
const webInputProps = Platform.OS === 'web'
  ? ({ dataSet: { spInput: 'true' } } as any)
  : undefined;

/* ================= Khung màn hình ================= */

interface ScreenProps {
  biz?: boolean;
  /** Tiêu đề + nút quay lại, hiển thị cố định phía trên vùng cuộn */
  header?: React.ReactNode;
  /** Footer cố định dưới đáy (nút hành động) */
  footer?: React.ReactNode;
  /** Đặt nút xử lý sau nội dung để cuộn cùng hồ sơ. */
  scrollFooter?: boolean;
  /** Lớp nổi phủ trên nội dung (thông báo đẩy...) */
  overlay?: React.ReactNode;
  /** Thanh tab đáy (FloatingTabs) */
  tabBar?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  /** Thêm khoảng trống dưới đáy cho tab bar nổi */
  padTabs?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  biz = false,
  header,
  footer,
  scrollFooter = false,
  overlay,
  tabBar,
  children,
  scroll = true,
  padTabs = false,
  contentStyle,
}: ScreenProps) {
  const p = palette(biz);
  const content = (
    <View style={[styles.body, biz ? styles.bodyBiz : null, padTabs && { paddingBottom: 116 }, contentStyle]}>
      {children}
      {scrollFooter && footer ? <View style={{ gap: 10, paddingTop: 12 }}>{footer}</View> : null}
    </View>
  );
  return (
    <View style={styles.screen}>
      <LinearGradient colors={p.screenGradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
        {!scrollFooter && footer ? <View style={[styles.foot, biz && styles.footBiz]}>{footer}</View> : null}
        {tabBar}
        {overlay ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {overlay}
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/* ================= Đầu màn hình (bar + nút quay lại) ================= */

interface ScreenHeaderProps {
  title: string;
  back?: boolean;
  biz?: boolean;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, back = false, biz = false, right }: ScreenHeaderProps) {
  const router = useRouter();
  const p = palette(biz);
  return (
    <View style={[styles.bar, biz ? styles.barBiz : null]}>
      {back ? (
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="Quay lại" style={styles.backBtn}>
          <Text style={[styles.backText, { color: p.ink }]}>‹</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.barTitle, { color: p.ink, fontFamily: biz ? fonts.bold : fonts.display }]}>{title}</Text>
      {right ? <View style={styles.barRight}>{right}</View> : null}
    </View>
  );
}

/* ================= Hero (đầu màn đăng nhập / đăng ký) ================= */

interface HeroProps {
  biz?: boolean;
  /** Biến thể nhỏ (màn đăng ký) */
  sm?: boolean;
  title: string;
  sub?: string;
  duck?: DuckVariant;
}

export function Hero({ biz = false, sm = false, title, sub, duck = 'plain' }: HeroProps) {
  const p = palette(biz);
  const big = !sm;
  return (
    <LinearGradient
      colors={['#C9DDFF', '#EAF1FF']}
      style={[styles.hero, sm ? styles.heroSm : null, { backgroundColor: p.bg }]}
    >
      <View style={[styles.heroInner, sm && styles.heroInnerSm]}>
        <Duck variant={duck} width={big ? 104 : 76} height={big ? 104 : 76} bob={big} />
        <Text style={[big ? styles.h1 : styles.h2, { color: p.ink, fontFamily: big ? fonts.displaybold : fonts.display }]}>
          {title}
        </Text>
        {sub ? <Text style={[styles.sub, { color: p.mut }]}>{sub}</Text> : null}
      </View>
    </LinearGradient>
  );
}

/* ================= Nút bấm ================= */

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  biz?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({ title, onPress, variant = 'primary', biz = false, disabled, style, textStyle }: ButtonProps) {
  const p = palette(biz);
  const base: ViewStyle = {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  };
  let inner: React.ReactNode;
  let extra: ViewStyle = {};
  let colors: readonly [string, string, ...string[]] | null = null;
  let textColor = '#fff';
  if (variant === 'primary') {
    colors = p.btnGradient;
  } else if (variant === 'danger') {
    extra = {
      backgroundColor: p.bad,
      shadowColor: '#D12B33',
      shadowOpacity: 0.25,
      shadowRadius: 11,
      shadowOffset: { width: 0, height: 5 },
      elevation: 4,
    };
  } else {
    extra = {
      backgroundColor: '#fff',
      borderWidth: 1.5,
      borderColor: biz ? '#d0e8e5' : '#CFD8FA',
    };
    textColor = p.brand;
  }
  const content = (
    <Text style={[styles.btnText, { color: textColor }, textStyle]}>{title}</Text>
  );
  if (colors) {
    inner = (
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.85, y: 1 }} style={[base, extra, styles.btnShadow, style]}>
        {content}
      </LinearGradient>
    );
  } else {
    inner = (
      <View style={[base, extra, style]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled} style={disabled ? { opacity: 0.45 } : undefined}>
      {inner}
    </Pressable>
  );
}

/* ================= Thẻ trạng thái (tag) ================= */

export type TagTone = 'ok' | 'wait' | 'bad' | 'gray';

interface TagProps {
  tone: TagTone;
  children: React.ReactNode;
  biz?: boolean;
}

export function Tag({ tone, children, biz = false }: TagProps) {
  const p = palette(biz);
  const map: Record<TagTone, { bg: string; color: string }> = {
    ok: { bg: p.okbg, color: biz ? '#04785e' : p.ok },
    wait: { bg: p.waitbg, color: biz ? '#916000' : p.wait },
    bad: { bg: p.badbg, color: biz ? '#ca4242' : p.bad },
    gray: { bg: '#E9ECF5', color: p.mut },
  };
  const c = map[tone];
  return (
    <View style={[styles.tag, { backgroundColor: c.bg }, biz && styles.tagBiz]}>
      <Text style={[styles.tagText, { color: c.color }]}>{children}</Text>
    </View>
  );
}

/* ================= Thông báo (note) ================= */

interface NoteProps {
  tone: 'ok' | 'bad' | 'info';
  title: string;
  children?: React.ReactNode;
  biz?: boolean;
}

export function Note({ tone, title, children, biz = false }: NoteProps) {
  const p = palette(biz);
  const map = {
    ok: { bg: p.okbg, color: '#0A5E42' },
    bad: { bg: p.badbg, color: '#8F2022' },
    info: { bg: '#E4F0FF', color: '#16508F' },
  } as const;
  const c = map[tone];
  return (
    <View style={[styles.note, { backgroundColor: c.bg }, biz && styles.bordered]}>
      <Text style={[styles.noteTitle, { color: c.color }]}>{title}</Text>
      <Text style={[styles.noteBody, { color: c.color }]}>{children}</Text>
    </View>
  );
}

/* ================= Trường nhập liệu ================= */

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

interface TextFieldProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  biz?: boolean;
  editable?: boolean;
  /** Lỗi hiển thị ngay dưới ô nhập (thay vì chỉ báo ở đầu màn hình) */
  error?: string;
  hint?: string;
}

export function TextField({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  multiline,
  numberOfLines,
  autoCapitalize,
  biz = false,
  editable = true,
  error,
  hint,
}: TextFieldProps) {
  const p = palette(biz);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  useWebInputCss();

  const input = (
    <TextInput
      {...(webInputProps ?? {})}
      style={[
        styles.input,
        multiline && styles.inputMulti,
        secureTextEntry && { paddingRight: 54 },
        !editable && styles.inputReadonly,
        focused && { borderColor: p.brand, ...styles.inputFocus, shadowColor: p.brand },
        error ? { borderColor: p.bad } : null,
      ]}
      placeholder={placeholder}
      placeholderTextColor="#9AA8C7"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry && !passwordVisible}
      keyboardType={keyboardType}
      multiline={multiline}
      numberOfLines={numberOfLines}
      autoCapitalize={autoCapitalize}
      editable={editable}
      textAlignVertical={multiline ? 'top' : 'center'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
  const field = secureTextEntry ? (
    <View>
      {input}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        onPress={() => setPasswordVisible((visible) => !visible)}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, paddingHorizontal: 14, justifyContent: 'center' }}
      >
        <Icon name={passwordVisible ? 'eye-off' : 'eye'} size={20} color="#5E6F96" />
      </Pressable>
    </View>
  ) : input;
  const message = error || hint;
  const body = (
    <View style={styles.fieldBody}>
      {field}
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.fieldHint, error ? styles.fieldError : null]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
  return label ? <Field label={label}>{body}</Field> : body;
}

/* ================= Chọn ngày (lịch, không cho gõ tay) ================= */

interface DateFieldProps {
  label?: string;
  /** Chuỗi dạng dd/mm/yyyy do lịch trả về, rỗng khi chưa chọn */
  value?: string;
  onChange: (value: string) => void;
  biz?: boolean;
  error?: string;
  hint?: string;
}

type DateView = 'days' | 'months' | 'years';

const MONTH_LABELS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function pageStartFor(year: number) {
  return MIN_DATE_YEAR + Math.floor((year - MIN_DATE_YEAR) / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE;
}

export function DateField({ label, value = '', onChange, biz = false, error, hint }: DateFieldProps) {
  const p = palette(biz);
  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayYear = today.getFullYear();
  const selected = parseCalendarDate(value, today);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DateView>('days');
  const [cursor, setCursor] = useState({ year: todayYear, month: todayMonth });

  const openPicker = () => {
    const base = selected ?? { day: 1, month: todayMonth, year: todayYear };
    setCursor({ year: base.year, month: base.month });
    setView('days');
    setOpen(true);
  };

  const closePicker = () => setOpen(false);

  const yearPageStart = pageStartFor(cursor.year);
  const yearPageEnd = Math.min(yearPageStart + YEAR_PAGE_SIZE - 1, todayYear);
  const lastPageStart = pageStartFor(todayYear);
  const canPrevMonth = cursor.year > MIN_DATE_YEAR || cursor.month > 1;
  const canNextMonth = cursor.year < todayYear || cursor.month < todayMonth;
  const canPrevYear = cursor.year > MIN_DATE_YEAR;
  const canNextYear = cursor.year < todayYear;
  const canPrevPage = yearPageStart > MIN_DATE_YEAR;
  const canNextPage = yearPageStart < lastPageStart;

  const shiftMonth = (delta: 1 | -1) => {
    setCursor((c) => {
      let month = c.month + delta;
      let year = c.year;
      if (month < 1) {
        month = 12;
        year -= 1;
      } else if (month > 12) {
        month = 1;
        year += 1;
      }
      if (year < MIN_DATE_YEAR || year > todayYear) return c;
      if (year === todayYear && month > todayMonth) return c;
      return { year, month };
    });
  };

  const shiftYear = (delta: 1 | -1) => {
    setCursor((c) => ({
      ...c,
      year: Math.max(MIN_DATE_YEAR, Math.min(todayYear, c.year + delta)),
    }));
  };

  const shiftYearPage = (delta: 1 | -1) => {
    setCursor((c) => {
      const start = pageStartFor(c.year);
      const nextStart = Math.max(
        MIN_DATE_YEAR,
        Math.min(lastPageStart, start + delta * YEAR_PAGE_SIZE),
      );
      const year = delta < 0 ? nextStart + YEAR_PAGE_SIZE - 1 : nextStart;
      return { ...c, year: Math.min(year, todayYear) };
    });
  };

  const onPrev = () => {
    if (view === 'days') shiftMonth(-1);
    else if (view === 'months') shiftYear(-1);
    else shiftYearPage(-1);
  };

  const onNext = () => {
    if (view === 'days') shiftMonth(1);
    else if (view === 'months') shiftYear(1);
    else shiftYearPage(1);
  };

  const pickDay = (day: number) => {
    onChange(formatCalendarDate({ day, month: cursor.month, year: cursor.year }));
    closePicker();
  };

  const pickMonth = (month: number) => {
    setCursor((c) => ({ ...c, month }));
    setView('days');
  };

  const pickYear = (year: number) => {
    setCursor((c) => ({ ...c, year }));
    setView('months');
  };

  const monthCells: (number | null)[] = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearCells: (number | null)[] = Array.from(
    { length: yearPageEnd - yearPageStart + 1 },
    (_, i) => yearPageStart + i,
  );
  const firstWeekday = (new Date(cursor.year, cursor.month - 1, 1).getDay() + 6) % 7;
  const dayCells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth(cursor.year, cursor.month) }, (_, i) => i + 1),
  ];
  while (dayCells.length % 7 !== 0) dayCells.push(null);

  const navDisabled = view === 'days'
    ? { prev: !canPrevMonth, next: !canNextMonth }
    : view === 'months'
      ? { prev: !canPrevYear, next: !canNextYear }
      : { prev: !canPrevPage, next: !canNextPage };
  const navLabels = view === 'days'
    ? { prev: 'Tháng trước', next: 'Tháng sau' }
    : view === 'months'
      ? { prev: 'Năm trước', next: 'Năm sau' }
      : { prev: 'Trang năm trước', next: 'Trang năm sau' };

  const body = (
    <View style={styles.fieldBody}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Ngày cấp'}: ${value || 'chưa chọn'}`}
        accessibilityHint="Mở lịch để chọn ngày"
        onPress={openPicker}
        style={[styles.dateDisplay, error ? { borderColor: p.bad } : null]}
      >
        <Text style={[styles.dateValue, !value && styles.datePlaceholder]}>
          {value || 'Chọn ngày'}
        </Text>
        <Icon name="chev" size={16} color={p.mut} />
      </Pressable>
      {error || hint ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.fieldHint, error ? styles.fieldError : null]}
        >
          {error || hint}
        </Text>
      ) : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={closePicker}>
        <Pressable style={styles.modalBackdrop} onPress={closePicker}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label ?? 'Chọn ngày cấp'}</Text>

            <View style={styles.calHead}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={navLabels.prev}
                accessibilityState={{ disabled: navDisabled.prev }}
                disabled={navDisabled.prev}
                onPress={onPrev}
                style={[styles.calNav, navDisabled.prev && styles.calDisabled]}
              >
                <Text style={[styles.calNavText, { color: p.brand }]}>‹</Text>
              </Pressable>
              <View style={styles.calTitle}>
                {view === 'days' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn tháng, đang là ${MONTH_LABELS[cursor.month - 1]}`}
                    onPress={() => setView('months')}
                    style={styles.calTitleBtn}
                  >
                    <Text style={[styles.calTitleText, { color: p.ink }]}>
                      {MONTH_LABELS[cursor.month - 1]}
                    </Text>
                  </Pressable>
                ) : null}
                {view === 'years' ? (
                  <Text style={[styles.calTitleText, { color: p.ink }]}>
                    {yearPageStart} – {yearPageEnd}
                  </Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Chọn năm, đang là ${cursor.year}`}
                    onPress={() => setView('years')}
                    style={styles.calTitleBtn}
                  >
                    <Text style={[styles.calTitleText, { color: p.ink }]}>{cursor.year}</Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={navLabels.next}
                accessibilityState={{ disabled: navDisabled.next }}
                disabled={navDisabled.next}
                onPress={onNext}
                style={[styles.calNav, navDisabled.next && styles.calDisabled]}
              >
                <Text style={[styles.calNavText, { color: p.brand }]}>›</Text>
              </Pressable>
            </View>

            {view === 'days' ? (
              <>
                <View style={styles.calRow}>
                  {WEEKDAY_LABELS.map((day) => (
                    <Text key={day} style={[styles.calWeekday, { color: p.mut }]}>
                      {day}
                    </Text>
                  ))}
                </View>
                {chunkRows(dayCells, 7).map((week, weekIndex) => (
                  <View key={weekIndex} style={styles.calRow}>
                    {week.map((day, dayIndex) => {
                      if (day === null) {
                        return <View key={`blank-${dayIndex}`} style={styles.calCell} />;
                      }
                      const future =
                        new Date(cursor.year, cursor.month - 1, day).getTime() > today.getTime();
                      const isSelected =
                        !!selected &&
                        selected.day === day &&
                        selected.month === cursor.month &&
                        selected.year === cursor.year;
                      return (
                        <Pressable
                          key={day}
                          accessibilityRole="button"
                          accessibilityLabel={`Ngày ${day} tháng ${cursor.month} năm ${cursor.year}`}
                          accessibilityState={{ disabled: future, selected: isSelected }}
                          disabled={future}
                          onPress={() => pickDay(day)}
                          style={[
                            styles.calCell,
                            styles.calDayCell,
                            isSelected && { backgroundColor: p.brand },
                            future && styles.calDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calDayText,
                              { color: isSelected ? '#fff' : p.ink },
                              isSelected && styles.calSelectedText,
                            ]}
                          >
                            {day}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </>
            ) : null}

            {view === 'months' ? (
              <>
                {chunkRows(monthCells, 3).map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.calRow}>
                    {row.map((month) => {
                      const disabled =
                        cursor.year === todayYear && month !== null && month > todayMonth;
                      const isSelected =
                        !!selected &&
                        month !== null &&
                        selected.month === month &&
                        selected.year === cursor.year;
                      return (
                        <Pressable
                          key={month}
                          accessibilityRole="button"
                          accessibilityLabel={`Tháng ${month} năm ${cursor.year}`}
                          accessibilityState={{ disabled, selected: isSelected }}
                          disabled={disabled}
                          onPress={() => month !== null && pickMonth(month)}
                          style={[
                            styles.calCell,
                            styles.calMonthCell,
                            isSelected && { backgroundColor: p.brand },
                            disabled && styles.calDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calMonthText,
                              { color: isSelected ? '#fff' : p.ink },
                              isSelected && styles.calSelectedText,
                            ]}
                          >
                            {month !== null ? MONTH_LABELS[month - 1] : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </>
            ) : null}

            {view === 'years' ? (
              <>
                {chunkRows(yearCells, 4).map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.calRow}>
                    {row.map((year) => {
                      if (year === null) {
                        return <View key={`blank-${rowIndex}`} style={styles.calCell} />;
                      }
                      const isSelected = !!selected && selected.year === year;
                      return (
                        <Pressable
                          key={year}
                          accessibilityRole="button"
                          accessibilityLabel={`Năm ${year}`}
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => pickYear(year)}
                          style={[
                            styles.calCell,
                            styles.calMonthCell,
                            isSelected && { backgroundColor: p.brand },
                          ]}
                        >
                          <Text
                            style={[
                              styles.calMonthText,
                              { color: isSelected ? '#fff' : p.ink },
                              isSelected && styles.calSelectedText,
                            ]}
                          >
                            {year}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </>
            ) : null}

            <View style={styles.calFooter}>
              {value ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xóa ngày cấp"
                  onPress={() => {
                    onChange('');
                    closePicker();
                  }}
                  style={styles.calAction}
                >
                  <Text style={[styles.calActionText, { color: p.mut }]}>Xóa ngày</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hủy chọn ngày"
                onPress={closePicker}
                style={styles.calAction}
              >
                <Text style={[styles.calActionText, { color: p.brand }]}>Hủy</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  return label ? <Field label={label}>{body}</Field> : body;
}

/* ================= Ô tìm kiếm dùng chung ================= */

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  biz?: boolean;
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Tìm kiếm...',
  accessibilityLabel = 'Tìm kiếm',
  biz = false,
}: SearchFieldProps) {
  const p = palette(biz);
  const [focused, setFocused] = useState(false);
  useWebInputCss();
  return (
    <View
      style={[
        styles.search,
        biz && styles.searchBiz,
        focused && { borderColor: p.brand, shadowColor: p.brand, ...styles.searchFocus },
      ]}
    >
      <View pointerEvents="none">
        <Icon name="search" size={19} color={biz ? '#7890a4' : '#64748B'} />
      </View>
      <TextInput
        {...(webInputProps ?? {})}
        style={[styles.searchInput, { color: p.ink }]}
        placeholder={placeholder}
        placeholderTextColor={biz ? '#9ab0c2' : '#94A3B8'}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={accessibilityLabel}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Xóa nội dung tìm kiếm"
          hitSlop={8}
          style={styles.searchClear}
        >
          <Icon name="x" size={16} color={p.mut} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ================= Chọn từ danh sách (thay <select>) ================= */

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
}

export function SelectField({ label, placeholder, options, value, onChange }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const control = (
    <>
      <Pressable style={styles.selectBox} onPress={() => setOpen(true)}>
        <Text style={[styles.selectText, !selected && { color: '#9AA8C7' }]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Icon name="chev" size={14} color="#2F66F0" />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {options.map((o) => {
                const isSel = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    style={[styles.sheetOption, isSel && { backgroundColor: '#F0F5FF' }]}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.sheetOptionText, isSel && { color: '#2253CA', fontWeight: '600' }]}>
                      {o.label}
                    </Text>
                    {isSel ? <Icon name="ok" size={16} color="#2F66F0" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
  return label ? <Field label={label}>{control}</Field> : control;
}

/* ================= Các bước xử lý ================= */

interface StepsProps {
  steps: string[];
  /** Số bước đầu tiên đang ở trạng thái "on" (đã xong / đang làm) */
  onCount: number;
}

export function Steps({ steps, onCount }: StepsProps) {
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => {
        const on = i < onCount;
        return (
          <View key={s} style={styles.stepRow}>
            <View style={[styles.stepNum, on && styles.stepNumOn]}>
              <Text style={[styles.stepNumText, on && { color: '#fff' }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, on && styles.stepLabelOn]}>{s}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ================= Hàng chức năng (hồ sơ, vai trò...) ================= */

interface RowProps {
  icon?: IconName;
  iconColor?: string;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  chevron?: boolean;
  danger?: boolean;
  biz?: boolean;
}

export function Row({ icon, iconColor, label, sublabel, onPress, right, chevron, danger, biz = false }: RowProps) {
  const p = palette(biz);
  const inner = (
    <>
      {icon ? <Icon name={icon} size={biz ? 19 : 22} color={iconColor ?? (danger ? p.bad : p.brand)} /> : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? p.bad : p.ink }]}>{label}</Text>
        {sublabel ? <Text style={[styles.rowSub, { color: p.mut }]}>{sublabel}</Text> : null}
      </View>
      {right}
      {chevron ? <Text style={[styles.rowChev, { color: p.mut }]}>›</Text> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.row,
          { backgroundColor: '#fff' },
          biz && styles.rowBiz,
          danger && { borderColor: biz ? '#f1d9d6' : '#F6C3C6' },
        ]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={[styles.row, { backgroundColor: '#fff' }, biz && styles.rowBiz]}>{inner}</View>;
}

/** Hàng có công tắc bật/tắt (thay <input class="sw">) */
interface SwitchRowProps {
  icon?: IconName;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  biz?: boolean;
}

export function SwitchRow({ icon, label, value, onChange, biz = false }: SwitchRowProps) {
  const p = palette(biz);
  return (
    <Row
      icon={icon}
      label={label}
      biz={biz}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#C9D0E4', true: biz ? '#079184' : p.ok }}
          thumbColor="#fff"
          style={biz ? { transform: [{ scaleX: 0.95 }, { scaleY: 0.9 }] } : undefined}
        />
      }
    />
  );
}

/* ================= Ảnh đại diện ================= */

interface AvatarProps {
  initials: string;
  uri?: string | null;
  size?: number;
  biz?: boolean;
}

export function Avatar({ initials, uri, size = 48, biz = false }: AvatarProps) {
  const p = palette(biz);
  return (
    <View
      style={[
        styles.av,
        {
          width: size,
          height: size,
          borderRadius: biz ? 15 : size / 2,
          backgroundColor: biz ? '#def0ec' : p.red,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%', borderRadius: biz ? 15 : size / 2 }}
        />
      ) : (
        <Text style={[styles.avText, { fontSize: size * 0.36, color: biz ? '#08766e' : '#fff' }]}>{initials}</Text>
      )}
    </View>
  );
}

/* ================= Thẻ chi tiết (card) ================= */

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  biz?: boolean;
}

export function Card({ children, style, biz = false }: CardProps) {
  const kids = React.Children.toArray(children);
  return (
    <View style={[styles.card, biz && styles.cardBiz, style]}>
      {kids.map((c, i) =>
        React.isValidElement(c) && c.type === KV
          ? React.cloneElement(c as React.ReactElement<{ last?: boolean; biz?: boolean }>, {
              last: i === kids.length - 1,
              biz,
            })
          : c,
      )}
    </View>
  );
}

export function KV({
  label,
  value,
  last,
  biz = false,
  copyable = false,
}: {
  label: string;
  value: string;
  last?: boolean;
  biz?: boolean;
  /** Hiện nút "Sao chép" cạnh giá trị (địa chỉ ví, hợp đồng...) */
  copyable?: boolean;
}) {
  const p = palette(biz);
  const [copied, setCopied] = useState(false);
  const longCode = /^0x[0-9a-fA-F]{30,}$/.test(value);
  const copy = async () => {
    try {
      const ok = await Clipboard.setStringAsync(value);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // Trình duyệt chặn clipboard → người dùng vẫn có thể bôi đen để chép.
    }
  };
  return (
    <View style={[styles.kv, longCode && styles.kvCodeRow, biz && { borderBottomColor: p.line }, last && styles.kvLast]}>
      <Text style={[styles.kvLabel, { color: p.mut }]}>{label}</Text>
      <View style={[styles.kvValueWrap, longCode && styles.kvValueWrapCode]}>
        <Text
          selectable
          style={[
            styles.kvValue,
            { color: p.ink },
            longCode && styles.kvCode,
            Platform.OS === 'web' && { overflowWrap: 'anywhere' } as TextStyle,
          ]}
        >
          {value}
        </Text>
        {copyable ? (
          <Pressable
            onPress={copy}
            accessibilityRole="button"
            accessibilityLabel={`Sao chép ${label}`}
            hitSlop={6}
            style={[styles.copyBtn, longCode && styles.copyBtnCode]}
          >
            <Text style={[styles.copyText, { color: p.brand }]}>{copied ? 'Đã chép' : 'Sao chép'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Màn hình đang tải font */
export function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#2F66F0" />
    </View>
  );
}

/* ================= Styles ================= */

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  body: { flexGrow: 1, gap: 14, padding: 20 },
  bodyBiz: { gap: 17, padding: 17, paddingTop: 20 },
  foot: { gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22 },
  footBiz: { paddingHorizontal: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6 },
  barBiz: { paddingHorizontal: 18, paddingTop: 21, paddingBottom: 12 },
  backBtn: { paddingHorizontal: 8 },
  backText: { fontSize: 28, lineHeight: 30 },
  barTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  barRight: { flexDirection: 'row', alignItems: 'center' },
  hero: {
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 4,
    paddingHorizontal: 20,
    paddingVertical: 22,
    paddingBottom: 26,
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
  },
  heroSm: { paddingVertical: 6, paddingBottom: 20 },
  heroInner: { alignItems: 'center', gap: 4 },
  heroInnerSm: { gap: 2 },
  h1: { fontSize: 34, letterSpacing: -0.02 },
  h2: { fontSize: 18, fontWeight: '600' },
  sub: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  btnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold },
  btnShadow: { shadowColor: '#2F66F0', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99 },
  tagBiz: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  tagText: { fontSize: 11.5, fontWeight: '600', fontFamily: fonts.semibold },
  note: { padding: 16, borderRadius: 18, gap: 2 },
  bordered: { borderWidth: 1, borderColor: '#e2ebf0' },
  noteTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 2 },
  noteBody: { fontSize: 13, lineHeight: 19.5 },
  field: { gap: 6, textAlign: 'left' },
  fieldBody: { gap: 6 },
  fieldHint: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sans, color: '#5E6F96' },
  fieldError: { color: '#B42318' },
  label: { fontSize: 13, fontWeight: '500', fontFamily: fonts.medium, color: '#16264F' },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 12,
    backgroundColor: '#fff',
    color: '#16264F',
    fontSize: 15,
    fontFamily: fonts.sans,
  },
  inputReadonly: { backgroundColor: '#F4F7FC' },
  inputFocus: {
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  inputMulti: { minHeight: 76 },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  dateValue: { flex: 1, fontSize: 15, fontFamily: fonts.sans, color: '#16264F' },
  datePlaceholder: { color: '#9AA8C7' },
  calHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  calNav: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F5FF',
  },
  calNavText: { fontSize: 24, lineHeight: 27, fontFamily: fonts.medium },
  calTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  calTitleBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  calTitleText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold },
  calRow: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
  calCell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  calDayCell: { height: 40, borderRadius: 10 },
  calDayText: { fontSize: 14, fontFamily: fonts.sans },
  calMonthCell: { minHeight: 44, paddingVertical: 10, borderRadius: 10 },
  calMonthText: { fontSize: 13.5, fontFamily: fonts.sans, textAlign: 'center' },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: fonts.medium, paddingVertical: 4 },
  calSelectedText: { fontWeight: '700', fontFamily: fonts.bold },
  calDisabled: { opacity: 0.35 },
  calFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E9EEF9',
  },
  calAction: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9 },
  calActionText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
  },
  searchBiz: { borderWidth: 1, borderColor: '#dde8ed' },
  searchFocus: {
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  searchInput: { flex: 1, height: 46, fontSize: 13.5, fontFamily: fonts.sans },
  searchClear: { padding: 2 },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  selectText: { fontSize: 14.5, fontFamily: fonts.sans, color: '#16264F', flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,25,45,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28 },
  sheetTitle: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#16264F', marginBottom: 8 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  sheetOptionText: { fontSize: 14.5, fontFamily: fonts.sans, color: '#16264F', flex: 1 },
  steps: { gap: 12, padding: 0 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumOn: { borderColor: '#2F66F0', backgroundColor: '#2F66F0' },
  stepNumText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, color: '#5E6F96' },
  stepLabel: { flex: 1, fontSize: 13.5, fontFamily: fonts.sans, color: '#5E6F96' },
  stepLabelOn: { color: '#16264F', fontWeight: '600', fontFamily: fonts.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#DCE6FA',
    borderRadius: 18,
    shadowColor: 'rgba(40,60,140,0.07)',
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  rowBiz: { minHeight: 65, borderRadius: 13, borderWidth: 1, borderColor: '#e2ebf0', paddingHorizontal: 12, gap: 10 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14.5, fontWeight: '500', fontFamily: fonts.medium },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowChev: { fontSize: 20 },
  av: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avText: { fontWeight: '700', fontFamily: fonts.bold },
  card: { paddingVertical: 4, paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#fff', shadowColor: 'rgba(40,60,140,0.07)', shadowOpacity: 1, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardBiz: { borderWidth: 1, borderColor: '#e2ebf0', shadowOpacity: 0, elevation: 0 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#DCE6FA' },
  kvLast: { borderBottomWidth: 0 },
  kvLabel: { fontSize: 13, fontFamily: fonts.sans, color: '#5E6F96' },
  kvValueWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  kvValueWrapCode: { width: '100%', flexDirection: 'column', alignItems: 'stretch' },
  kvValue: { flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13.5, fontWeight: '600', fontFamily: fonts.semibold, color: '#16264F' },
  kvCodeRow: { flexDirection: 'column', gap: 8 },
  kvCode: { flex: 0, textAlign: 'left', lineHeight: 21, fontSize: 12, padding: 12, backgroundColor: '#F4F7FC', borderRadius: 10 },
  copyBtn: { paddingVertical: 2 },
  copyBtnCode: { alignSelf: 'flex-end' },
  copyText: { fontSize: 11.5, fontWeight: '600', fontFamily: fonts.semibold },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1FF' },
});
