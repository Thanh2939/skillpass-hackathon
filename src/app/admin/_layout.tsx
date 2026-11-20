import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useApp } from '../../store/AppContext';
import { LoadingScreen } from '../../components/ui';

export default function AdminLayout() {
  const { authReady, authUser } = useApp();
  if (!authReady) return <LoadingScreen />;
  if (authUser?.role !== 'admin') return <Redirect href="/staff/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
