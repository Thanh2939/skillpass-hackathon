import React from 'react';
import { Redirect } from 'expo-router';

/** Khi truy cập /verify không kèm mã -> chuyển hướng tự động sang màn hình quét QR */
export default function VerifyIndexRoute() {
  return <Redirect href="/scan" />;
}
