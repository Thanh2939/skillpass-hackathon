import React, { Component } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Baloo2_600SemiBold,
  Baloo2_700Bold,
} from '@expo-google-fonts/baloo-2';
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
} from '@expo-google-fonts/be-vietnam-pro';
import { AppProvider } from '../store/AppContext';
import { LoadingScreen } from '../components/ui';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Unhandled app error caught by RootErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    } else {
      this.setState({ hasError: false });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.emoji}>⚠️</Text>
          <Text style={errStyles.title}>Có lỗi bất ngờ xảy ra</Text>
          <Text style={errStyles.msg}>
            Ứng dụng đã tự động bảo vệ dữ liệu. Vui lòng bấm bên dưới để tiếp tục.
          </Text>
          <Pressable style={errStyles.btn} onPress={this.handleReload}>
            <Text style={errStyles.btnText}>Quay về trang chủ</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E1726',
    padding: 24,
    gap: 12,
  },
  emoji: { fontSize: 48 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff' },
  msg: { fontSize: 13, color: '#9FB2D3', textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  btn: {
    marginTop: 14,
    backgroundColor: '#2F66F0',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

/**
 * Root layout — nạp font Baloo 2 + Be Vietnam Pro (khớp tailwind.config.js),
 * bọc trạng thái dùng chung và khai báo Stack toàn app.
 * Trên Web: Không bao giờ chặn màn hình bằng LoadingScreen nếu font chưa load xong,
 * để tránh treo vô tận do font network/CORS.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
  });

  // Trên Web: Cho phép render ngay lập tức với font dự phòng (không treo spinner)
  // Trên Native: Chỉ hiện LoadingScreen nếu chưa tải xong và chưa có lỗi
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) {
    return <LoadingScreen />;
  }

  return (
    <RootErrorBoundary>
      <AppProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AppProvider>
    </RootErrorBoundary>
  );
}
