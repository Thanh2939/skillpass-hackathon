import React, { useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Button } from './ui';
import { Icon } from './Icon';
import { fonts, palette } from '../theme';

interface Props {
  initials: string;
  uri?: string | null;
  biz?: boolean;
  onSave: (uri: string) => Promise<void>;
}

/** Khung cắt hiển thị (px, toạ độ màn hình) */
const VIEW = 260;
/** Kích thước ảnh đại diện xuất ra */
const OUTPUT = 512;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface Picked {
  uri: string;
  width: number;
  height: number;
}

interface CropTransform {
  scale: number;
  rotation: number;
  offset: { x: number; y: number };
  displayW: number;
  displayH: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Giới hạn kéo để ảnh không hở mép trong khung cắt */
function clampOffset(
  x: number,
  y: number,
  scale: number,
  rotation: number,
  displayW: number,
  displayH: number,
) {
  const swapped = Math.abs(rotation) % 180 !== 0;
  const effectiveW = (swapped ? displayH : displayW) * scale;
  const effectiveH = (swapped ? displayW : displayH) * scale;
  const maxX = Math.max(0, (effectiveW - VIEW) / 2);
  const maxY = Math.max(0, (effectiveH - VIEW) / 2);
  return {
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY),
  };
}

/**
 * Touch point dùng cho tính toán gesture.
 * `touches` của React Native là readonly nên helper phải nhận readonly array.
 */
interface TouchPoint {
  readonly pageX: number;
  readonly pageY: number;
}

function touchDistance(touches: readonly TouchPoint[]) {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Lấy danh sách điểm chạm; chuột trên web không có `touches` nên fallback về nativeEvent. */
function eventPoints(event: GestureResponderEvent): readonly TouchPoint[] {
  const { touches, pageX, pageY } = event.nativeEvent;
  if (touches && touches.length > 0) return touches;
  return [{ pageX, pageY }];
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Không đọc được ảnh đã chọn.'));
    image.src = uri;
  });
}

/**
 * Xuất ảnh đã cắt/zoom/kéo/xoay thành data URL.
 * Chỉ dùng trên web (canvas); native dùng khung cắt của hệ điều hành.
 */
async function cropToDataUrl(source: Picked, transform: CropTransform): Promise<string> {
  const image = await loadImage(source.uri);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Thiết bị không hỗ trợ cắt ảnh.');
  const k = OUTPUT / VIEW;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, OUTPUT, OUTPUT);
  ctx.translate(OUTPUT / 2 + transform.offset.x * k, OUTPUT / 2 + transform.offset.y * k);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale * k, transform.scale * k);
  ctx.drawImage(
    image,
    -transform.displayW / 2,
    -transform.displayH / 2,
    transform.displayW,
    transform.displayH,
  );
  return canvas.toDataURL('image/jpeg', 0.9);
}

export function AvatarEditor({ initials, uri, biz, onSave }: Props) {
  const p = palette(!!biz);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = picked ? Math.max(VIEW / picked.width, VIEW / picked.height) : 1;
  const displayW = picked ? picked.width * base : VIEW;
  const displayH = picked ? picked.height * base : VIEW;

  // Điểm bắt đầu gesture: chỉ ghi/đọc trong event handler (không đọc ref lúc render).
  const gestureStart = useRef({ x: 0, y: 0, scale: 1, distance: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });

  const handleGrant = (event: GestureResponderEvent) => {
    if (Platform.OS !== 'web') return;
    const points = eventPoints(event);
    dragOrigin.current = { x: points[0].pageX, y: points[0].pageY };
    gestureStart.current = {
      x: offset.x,
      y: offset.y,
      scale,
      distance: touchDistance(points),
    };
  };

  const handleMove = (event: GestureResponderEvent) => {
    if (Platform.OS !== 'web') return;
    const points = eventPoints(event);
    const start = gestureStart.current;

    // Chụm 2 ngón để thu phóng (bắt đầu giữa chừng vẫn hoạt động)
    if (points.length >= 2) {
      const distance = touchDistance(points);
      if (start.distance <= 0) {
        gestureStart.current = { x: offset.x, y: offset.y, scale, distance };
        return;
      }
      if (distance <= 0) return;
      const next = clamp(start.scale * (distance / start.distance), MIN_SCALE, MAX_SCALE);
      setScale(next);
      setOffset((previous) => clampOffset(previous.x, previous.y, next, rotation, displayW, displayH));
      return;
    }

    // Kéo 1 ngón để di chuyển ảnh trong khung
    const dx = points[0].pageX - dragOrigin.current.x;
    const dy = points[0].pageY - dragOrigin.current.y;
    setOffset(
      clampOffset(start.x + dx, start.y + dy, scale, rotation, displayW, displayH),
    );
  };

  const handleRelease = () => {
    gestureStart.current = { ...gestureStart.current, distance: 0 };
  };

  const resetTransform = () => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const open = () => {
    setPicked(null);
    setError(null);
    resetTransform();
    setEditing(true);
  };

  const close = () => {
    if (saving) return;
    setEditing(false);
    setPicked(null);
    setError(null);
    resetTransform();
  };

  const pick = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        // Native: dùng khung cắt của hệ thống (kéo/thu phóng, Android có xoay).
        // Web: tự cắt trong khung tròn bên dưới để xoay/zoom mượt như Zalo.
        allowsEditing: Platform.OS !== 'web',
        aspect: [1, 1],
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        setPicked({
          uri: asset.uri,
          width: asset.width || VIEW,
          height: asset.height || VIEW,
        });
        resetTransform();
      }
    } catch {
      setError('Không mở được thư viện ảnh.');
    }
  };

  const changeZoom = (delta: number) => {
    const next = clamp(Number((scale + delta).toFixed(2)), MIN_SCALE, MAX_SCALE);
    setScale(next);
    setOffset((previous) => clampOffset(previous.x, previous.y, next, rotation, displayW, displayH));
  };

  const rotateBy = (delta: number) => {
    const next = (rotation + delta + 360) % 360;
    setRotation(next);
    setOffset((previous) => clampOffset(previous.x, previous.y, scale, next, displayW, displayH));
  };

  const save = async () => {
    if (!picked || saving) return;
    setError(null);
    setSaving(true);
    try {
      const output =
        Platform.OS === 'web'
          ? await cropToDataUrl(picked, { scale, rotation, offset, displayW, displayH })
          : picked.uri;
      await onSave(output);
      setPicked(null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được ảnh. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const canEditTransform = Platform.OS === 'web' && !!picked;

  return (
    <View style={styles.root}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Đổi ảnh đại diện"
        style={styles.trigger}
      >
        <Avatar initials={initials} uri={uri} biz={biz} size={72} />
        <View style={[styles.camera, { backgroundColor: p.brand }]}>
          <Icon name="cam" color="#fff" size={15} />
        </View>
      </Pressable>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <View style={styles.heading}>
              <View style={styles.headingText}>
                <Text style={[styles.title, { color: p.ink }]}>Ảnh đại diện</Text>
                <Text style={[styles.subtitle, { color: p.mut }]}>Cắt, thu phóng và chọn góc ảnh</Text>
              </View>
              <Pressable
                onPress={close}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Đóng đổi ảnh"
                style={styles.close}
              >
                <Icon name="x" color={p.mut} size={21} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.preview} showsVerticalScrollIndicator={false}>
              <View
                {...(Platform.OS === 'web' ? ({ dataSet: { spCrop: 'true' } } as any) : {})}
                onStartShouldSetResponder={() => Platform.OS === 'web'}
                onMoveShouldSetResponder={() => Platform.OS === 'web'}
                onResponderGrant={handleGrant}
                onResponderMove={handleMove}
                onResponderRelease={handleRelease}
                onResponderTerminate={handleRelease}
                style={[
                  styles.crop,
                  { width: VIEW, height: VIEW, borderRadius: biz ? 30 : VIEW / 2 },
                ]}
              >
                {picked ? (
                  <View
                    style={[
                      styles.cropLayer,
                      {
                        left: (VIEW - displayW) / 2,
                        top: (VIEW - displayH) / 2,
                        transform: [{ translateX: offset.x }, { translateY: offset.y }],
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: picked.uri }}
                      resizeMode="stretch"
                      style={{
                        width: displayW,
                        height: displayH,
                        transform: [{ scale }, { rotate: `${rotation}deg` }],
                      }}
                    />
                  </View>
                ) : uri ? (
                  <Image source={{ uri }} style={styles.cropFill} resizeMode="cover" />
                ) : (
                  <View style={[styles.cropPlaceholder, { backgroundColor: biz ? '#def0ec' : p.red }]}>
                    <Text style={[styles.cropInitials, { color: biz ? '#08766e' : '#fff' }]}>{initials}</Text>
                  </View>
                )}
              </View>

              {picked ? (
                <Text style={[styles.hint, { color: p.mut }]}>
                  {canEditTransform
                    ? 'Kéo ảnh để căn · chụm 2 ngón hoặc bấm − / + để thu phóng · bấm xoay để chọn góc.'
                    : 'Ảnh đã được cắt vuông bằng khung chỉnh của hệ thống. Chọn ảnh khác nếu muốn căn lại.'}
                </Text>
              ) : (
                <Text style={[styles.hint, { color: p.mut }]}>
                  Chọn một bức ảnh, sau đó căn khung tròn để mọi người dễ nhận ra bạn.
                </Text>
              )}

              {canEditTransform ? (
                <View style={styles.tools}>
                  <View style={styles.toolRow}>
                    <Text style={[styles.toolLabel, { color: p.mut }]}>Thu phóng</Text>
                    <View style={styles.zoomGroup}>
                      <Pressable
                        onPress={() => changeZoom(-0.25)}
                        accessibilityRole="button"
                        accessibilityLabel="Thu nhỏ ảnh"
                        style={styles.toolBtn}
                      >
                        <Text style={[styles.toolBtnText, { color: p.ink }]}>−</Text>
                      </Pressable>
                      <Text style={[styles.zoomValue, { color: p.ink }]}>{scale.toFixed(2)}×</Text>
                      <Pressable
                        onPress={() => changeZoom(0.25)}
                        accessibilityRole="button"
                        accessibilityLabel="Phóng to ảnh"
                        style={styles.toolBtn}
                      >
                        <Text style={[styles.toolBtnText, { color: p.ink }]}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.toolRow}>
                    <Text style={[styles.toolLabel, { color: p.mut }]}>Góc xoay</Text>
                    <View style={styles.rotateGroup}>
                      <Pressable
                        onPress={() => rotateBy(-90)}
                        accessibilityRole="button"
                        accessibilityLabel="Xoay trái 90 độ"
                        style={styles.toolBtnWide}
                      >
                        <Text style={[styles.toolBtnWideText, { color: p.ink }]}>⟲ 90°</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => rotateBy(90)}
                        accessibilityRole="button"
                        accessibilityLabel="Xoay phải 90 độ"
                        style={styles.toolBtnWide}
                      >
                        <Text style={[styles.toolBtnWideText, { color: p.ink }]}>⟳ 90°</Text>
                      </Pressable>
                      <Pressable
                        onPress={resetTransform}
                        accessibilityRole="button"
                        accessibilityLabel="Đặt lại khung cắt"
                        style={styles.toolBtnWide}
                      >
                        <Text style={[styles.toolBtnWideText, { color: p.brand }]}>Đặt lại</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}

              {error ? (
                <Text accessibilityLiveRegion="polite" style={styles.error}>
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View style={styles.actions}>
              <Button
                title={picked ? 'Chọn ảnh khác' : 'Chọn ảnh từ thư viện'}
                variant="ghost"
                disabled={saving}
                onPress={pick}
                biz={biz}
              />
              <Button
                title={saving ? 'Đang lưu...' : 'Lưu ảnh'}
                disabled={!picked || saving}
                onPress={save}
                biz={biz}
              />
              <Pressable onPress={close} disabled={saving} accessibilityRole="button" style={styles.cancel}>
                <Text style={[styles.cancelText, { color: p.mut }]}>Hủy</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0 },
  trigger: { padding: 3 },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(16,30,55,0.52)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 400, maxHeight: '95%', borderRadius: 24, backgroundColor: '#fff', padding: 20, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headingText: { flex: 1, gap: 2 },
  title: { fontSize: 19, fontFamily: fonts.bold },
  subtitle: { fontSize: 12.5, fontFamily: fonts.sans },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F2F5FA', alignItems: 'center', justifyContent: 'center' },
  preview: { alignItems: 'center', gap: 14, paddingVertical: 4 },
  crop: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#0f1e32',
    shadowColor: 'rgba(16,30,55,0.28)',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  cropLayer: { position: 'absolute' },
  cropFill: { width: '100%', height: '100%' },
  cropPlaceholder: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  cropInitials: { fontSize: 74, fontFamily: fonts.bold },
  hint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 21, textAlign: 'center', maxWidth: 290 },
  tools: { width: '100%', maxWidth: 320, gap: 10 },
  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toolLabel: { fontSize: 12.5, fontFamily: fonts.medium },
  zoomGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCE6FA',
    backgroundColor: '#F7FAFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnText: { fontSize: 19, fontFamily: fonts.semibold, lineHeight: 21 },
  zoomValue: { minWidth: 54, textAlign: 'center', fontSize: 13, fontFamily: fonts.semibold },
  rotateGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolBtnWide: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#DCE6FA',
    backgroundColor: '#F7FAFF',
  },
  toolBtnWideText: { fontSize: 12, fontFamily: fonts.semibold },
  error: { color: '#B42318', fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  actions: { gap: 10 },
  cancel: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: fonts.semibold, fontSize: 13 },
});
