import React, { useMemo } from 'react';
import QRCode from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';

export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const { path, side } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const rows: string[] = [];
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.get(y, x)) rows.push(`M${x + 4} ${y + 4}h1v1h-1z`);
      }
    }
    return { path: rows.join(''), side: modules.size + 8 };
  }, [value]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${side} ${side}`} accessibilityLabel="Mã QR kiểm chứng hồ sơ năng lực">
      <Rect width={side} height={side} fill="#fff" />
      <Path d={path} fill="#12233a" />
    </Svg>
  );
}
