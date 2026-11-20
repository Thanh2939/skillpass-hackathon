import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { fonts } from '../theme';
import { Icon } from '../components/Icon';

/** Màn HR quét mã QR trên CV (design #biz-scan) — hỗ trợ Camera thật & chọn ảnh QR */
export function ScanScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const [beam] = useState(() => new Animated.Value(0));
  const [inputCode, setInputCode] = useState('');
  const [cameraPaused, setCameraPaused] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scanSize = cameraError ? 112 : compact ? 180 : 240;
  const torchBusy = useRef(false);

  const html5QrCodeRef = useRef<any>(null);
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beam, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beam, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beam]);

  const stopCameraSafely = useCallback(async () => {
    const scanner = html5QrCodeRef.current;
    html5QrCodeRef.current = null;

    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (err) {
        console.warn('Silent catch scanner stop error:', err);
      }
    }

  }, []);

  const handleDetectedCode = useCallback(async (decodedText: string) => {
    if (isNavigatingRef.current || !decodedText) return;

    let code = decodedText.trim();
    if (code.includes('/verify/')) {
      code = code.split('/verify/').pop()?.split('?')[0]?.split('/')[0] || '';
    } else if (code.includes('/')) {
      code = code.split('/').pop()?.split('?')[0] || '';
    }
    code = code.trim().toUpperCase();

    if (!/^SP-[A-Z0-9_-]+$/.test(code)) {
      setScanError('Mã SkillPass không hợp lệ.');
      return;
    }
    setScanError(null);

    isNavigatingRef.current = true;
    await stopCameraSafely();
    router.push(`/verify/${code}` as any);
  }, [router, stopCameraSafely]);

  // Khởi động Camera Web tự động quét mã QR
  useEffect(() => {
    if (Platform.OS !== 'web' || pathname !== '/scan' || cameraPaused) return;
    isNavigatingRef.current = false;
    let isCancelled = false;

    async function startWebScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (isCancelled || isNavigatingRef.current) return;
        setScannerActive(false);
        setTorchSupported(false);
        setIsTorchOn(false);
        setCameraError(null);

        // Tạo phần tử DOM con an toàn độc lập với React Virtual DOM
        const container = document.getElementById('qr-reader-container');
        if (!container) return;
        container.innerHTML = '';
        const mount = document.createElement('div');
        mount.id = 'qr-reader-mount';
        mount.style.width = '100%';
        mount.style.height = '100%';
        container.appendChild(mount);

        const scanner = new Html5Qrcode('qr-reader-mount', {
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 20,
            qrbox: (viewWidth: number, viewHeight: number) => {
              const min = Math.min(viewWidth, viewHeight);
              const sz = Math.floor(min * 0.85);
              return { width: sz, height: sz };
            },
          },
          (decodedText: string) => {
            if (decodedText && !isCancelled && !isNavigatingRef.current) {
              handleDetectedCode(decodedText);
            }
          },
          () => {}
        );

        if (isCancelled) {
          if (scanner.isScanning) await scanner.stop();
        } else {
          setScannerActive(true);
          setTorchSupported(Boolean(scanner.getRunningTrackCameraCapabilities()?.torchFeature?.().isSupported()));
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('Camera error or permission denied:', err);
          setCameraError('Không thể mở camera (vui lòng cho phép quyền camera hoặc chọn ảnh QR từ thư viện).');
        }
      }
    }

    startWebScanner();

    return () => {
      isCancelled = true;
      stopCameraSafely();
    };
  }, [pathname, cameraPaused, handleDetectedCode, stopCameraSafely]);

  const handleCheckCode = async () => {
    if (!inputCode.trim()) {
      setScanError('Vui lòng nhập mã hồ sơ ứng viên.');
      return;
    }
    await handleDetectedCode(inputCode);
  };

  const pickImage = async () => {
    if (cameraPaused) return;
    if (Platform.OS !== 'web') {
      setScanError('Bạn có thể nhập mã hồ sơ hoặc mở bản web để đọc ảnh QR.');
      return;
    }

    setScanError(null);
    setCameraPaused(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      await stopCameraSafely();
      const { Html5Qrcode } = await import('html5-qrcode');
      const blob = await fetch(result.assets[0].uri).then((response) => response.blob());
      const file = new File([blob], 'qr.jpg', { type: blob.type || 'image/jpeg' });
      const scanner = new Html5Qrcode('qr-reader-container');
      try {
        const decoded = await scanner.scanFile(file, false);
        await handleDetectedCode(decoded);
      } finally {
        scanner.clear();
      }
    } catch {
      setScanError('Không tìm thấy mã QR hợp lệ. Thử ảnh khác hoặc nhập mã hồ sơ.');
    } finally {
      setCameraPaused(false);
    }
  };

  const toggleFlash = async () => {
    const scanner = html5QrCodeRef.current;
    if (!scanner?.isScanning || !torchSupported || torchBusy.current) return;
    torchBusy.current = true;
    try {
      await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(!isTorchOn);
      setIsTorchOn(!isTorchOn);
    } catch {
      setScanError('Không điều khiển được đèn camera trên thiết bị này.');
    } finally {
      torchBusy.current = false;
    }
  };

  return (
    <LinearGradient colors={['#27364F', '#0E1726']} style={styles.bg}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.bar}>
          <Pressable hitSlop={12} onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Quét mã QR</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyCompact]} keyboardShouldPersistTaps="handled">
          <Text style={styles.tip}>Đưa mã QR trên CV vào khung quét hoặc chọn ảnh QR từ thư viện</Text>

          {/* Vùng camera HTML5 cho Web */}
          <View style={[styles.scanWrapper, { width: scanSize, height: scanSize }]}>
            {Platform.OS === 'web' ? (
              <>
                <style
                  dangerouslySetInnerHTML={{
                    __html: `
                      #qr-reader-container, #qr-reader-mount {
                        width: ${scanSize}px !important;
                        height: ${scanSize}px !important;
                        border: none !important;
                        border-radius: 20px !important;
                        overflow: hidden !important;
                        position: relative !important;
                        background: #000 !important;
                      }
                      #qr-reader-container video, #qr-reader-mount video {
                        width: 100% !important;
                        height: 100% !important;
                        object-fit: cover !important;
                        border-radius: 20px !important;
                        display: block !important;
                      }
                      #qr-shaded-region {
                        display: none !important;
                      }
                      #qr-reader-container__scan_region, #qr-reader-mount__scan_region {
                        border: none !important;
                      }
                      #qr-reader-container__header_message, #qr-reader-mount__header_message {
                        display: none !important;
                      }
                    `,
                  }}
                />
                <div id="qr-reader-container" />
              </>
            ) : null}

            {/* Khung ngắm giao diện ôm khít camera */}
            <View style={[styles.scanbox, { width: scanSize, height: scanSize }]} pointerEvents="none">
              <View style={[styles.corner, styles.c1]} />
              <View style={[styles.corner, styles.c2]} />
              <View style={[styles.corner, styles.c3]} />
              <View style={[styles.corner, styles.c4]} />
              {scannerActive ? <Animated.View
                style={[
                  styles.beam,
                  { transform: [{ translateY: beam.interpolate({ inputRange: [0, 1], outputRange: [0, scanSize - 26] }) }] },
                ]}
              /> : null}
              {!scannerActive ? <View style={styles.cameraPlaceholder}><Icon name="cam" size={42} color="#9FB2D3" /><Text style={styles.cameraStatus}>{cameraPaused ? 'Đang đọc ảnh QR...' : cameraError ? 'Camera tắt' : 'Đang mở camera...'}</Text></View> : null}
            </View>
          </View>

          {cameraError ? (
            <Text style={styles.errSub}>{cameraError}</Text>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.codeInput}
              placeholder={inputCode ? undefined : "Nhập mã SP-XXXXXX…"}
              placeholderTextColor="#8CA1C4"
              value={inputCode}
              onChangeText={(value) => { setInputCode(value); setScanError(null); }}
              autoCapitalize="characters"
            />
            <Pressable accessibilityRole="button" style={styles.demoBtn} onPress={handleCheckCode} disabled={cameraPaused}>
              <Icon name="qr" size={18} color="#fff" />
              <Text style={styles.demoBtnText}>Kiểm tra</Text>
            </Pressable>
          </View>
          {scanError ? <View style={styles.errorBox}><Icon name="help" size={18} color="#FCA5A5" /><Text accessibilityLiveRegion="polite" style={styles.scanError}>{scanError}</Text></View> : null}
        <View style={[styles.foot, compact && { paddingBottom: 14, paddingTop: 6 }]}>
          {scannerActive && torchSupported ? <Pressable style={styles.rbtn} onPress={toggleFlash}>
            <View style={styles.rbtnIcon}>
              <Icon name="flash" size={24} color="#fff" />
            </View>
            <Text style={styles.rbtnLabel}>{isTorchOn ? "Tắt đèn" : "Bật đèn"}</Text>
          </Pressable> : null}
          <Pressable accessibilityRole="button" style={styles.rbtn} onPress={pickImage} disabled={cameraPaused}>
            <View style={styles.rbtnIcon}>
              <Icon name="img" size={24} color="#fff" />
            </View>
            <Text style={styles.rbtnLabel}>Chọn ảnh QR</Text>
          </Pressable>
        </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 12 : 6,
    paddingBottom: 10,
  },
  backBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  back: { fontSize: 30, lineHeight: 32, color: '#fff' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', fontFamily: fonts.display, color: '#fff', textAlign: 'center' },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 20 },
  bodyCompact: { gap: 12, padding: 12 },
  cameraPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#152239', margin: 5, borderRadius: 16 },
  cameraStatus: { fontFamily: fonts.medium, fontSize: 12, color: '#B5C7E3' },
  errorBox: { width: '100%', maxWidth: 320, padding: 12, borderRadius: 12, backgroundColor: 'rgba(248,113,113,0.10)', flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)' },
  scanError: { flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 19, color: '#FCA5A5' },
  tip: { maxWidth: 280, fontSize: 14.5, fontWeight: '600', fontFamily: fonts.semibold, lineHeight: 21, color: '#fff', textAlign: 'center' },
  scanWrapper: {
    position: 'relative',
    width: 240,
    height: 240,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanbox: { position: 'absolute', top: 0, left: 0, width: 240, height: 240, borderRadius: 20 },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: '#fff' },
  c1: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 20 },
  c2: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 20 },
  c3: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 20 },
  c4: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 20 },
  beam: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    height: 3,
    borderRadius: 3,
    backgroundColor: '#4C86FF',
    shadowColor: '#4C86FF',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  sub: { fontSize: 13, fontFamily: fonts.sans, color: '#9FB2D3', textAlign: 'center' },
  errSub: { fontSize: 12.5, fontFamily: fonts.sans, color: '#FFA4A4', textAlign: 'center', maxWidth: 300 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 320,
  },
  codeInput: {
    flex: 1,
    minWidth: 0,
    width: 0,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(159,178,211,0.4)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: 13.5,
    fontFamily: fonts.medium,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(76,134,255,0.65)',
    backgroundColor: 'rgba(47,102,240,0.28)',
  },
  demoBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: '#fff',
  },
  foot: { width: '100%', maxWidth: 320, flexDirection: 'row', justifyContent: 'center', gap: 20, paddingTop: 10, paddingBottom: 20 },
  rbtn: { width: 120, minHeight: 90, alignItems: 'center', gap: 8 },
  rbtnIcon: { padding: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  rbtnLabel: { fontSize: 12.5, fontFamily: fonts.sans, color: '#C9D6EE' },
});
