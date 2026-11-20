import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

/**
 * Bộ icon nét (stroke) 24x24 dùng chung cho cả hai app,
 * chuyển từ <symbol> trong design/*.html.
 */
export type IconName =
  | 'wallet'
  | 'up'
  | 'qr'
  | 'ok'
  | 'help'
  | 'bell'
  | 'user'
  | 'out'
  | 'link'
  | 'lock'
  | 'x'
  | 'cam'
  | 'flash'
  | 'img'
  | 'chev'
  | 'search'
  | 'biz'
  | 'award'
  | 'eye'
  | 'eye-off';

interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}

const ICONS: Record<IconName, React.ReactNode> = {
  eye: (
    <>
      <Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <Circle cx="12" cy="12" r="2.5" />
    </>
  ),
  'eye-off': (
    <>
      <Path d="M3 3l18 18M10 6a10 10 0 0 1 2 0c6.5 0 10 6 10 6a15 15 0 0 1-3 3M6 7.5A16 16 0 0 0 2 12s3.5 6 10 6c1.4 0 2.7-.3 3.8-.8" />
    </>
  ),
  wallet: (
    <>
      <Rect x="3" y="7" width="18" height="13" rx="2.5" />
      <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
  up: (
    <>
      <Path d="M12 16V4m-5 5 5-5 5 5M4 20h16" />
    </>
  ),
  qr: (
    <>
      <Path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
    </>
  ),
  ok: (
    <>
      <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  help: <Path d="M4 5h16v11H9l-5 4z" />,
  bell: (
    <>
      <Path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4" />
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  out: (
    <>
      <Path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  link: (
    <>
      <Path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />
    </>
  ),
  lock: (
    <>
      <Rect x="5" y="11" width="14" height="9" rx="2" />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  x: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  cam: (
    <>
      <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <Circle cx="12" cy="13" r="3.5" />
    </>
  ),
  flash: <Path d="M13 3L5 13h6l-1 8 8-10h-6z" />,
  img: (
    <>
      <Rect x="4" y="5" width="16" height="14" rx="2" />
      <Circle cx="9" cy="10" r="1.6" />
      <Path d="M4 17l5-4 4 3 3-2 4 3" />
    </>
  ),
  chev: <Path d="M6 9l6 6 6-6" />,
  search: (
    <>
      <Circle cx="11" cy="11" r="6" />
      <Path d="M20 20l-4-4" />
    </>
  ),
  biz: (
    <>
      <Path d="M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M3 21h18" />
    </>
  ),
  award: (
    <>
      <Circle cx="12" cy="9" r="6" />
      <Path d="M8.5 14.5L7 21l5-2.5L17 21l-1.5-6.5" />
    </>
  ),
};

export function Icon({ name, size = 22, color = '#16264F', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <G>{ICONS[name]}</G>
    </Svg>
  );
}
