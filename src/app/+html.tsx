import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * Cấu hình HTML gốc cho Progressive Web App (PWA) trên iOS (Safari Add to Home Screen) & Android/Web
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <title>SkillPass — Hồ sơ năng lực số Avalanche</title>
        <meta
          name="description"
          content="Ví hồ sơ năng lực số & chứng chỉ Soulbound Token trên Avalanche Fuji"
        />
        <meta name="theme-color" content="#2F66F0" />

        {/* Cấu hình PWA chuẩn cho iOS Safari (Add to Home Screen) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SkillPass" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" type="image/png" href="/icon-192.png" />

        {/* Google Fonts dự phòng cho Web */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

        <ScrollViewStyleReset />

        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                min-height: 100dvh;
                margin: 0;
                padding: 0;
                background-color: #DFE9FF;
                -webkit-tap-highlight-color: transparent;
                -webkit-touch-callout: none;
                overscroll-behavior-y: none;
              }
              @media (min-width: 520px) {
                body {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: radial-gradient(circle at 20% 10%, #DCE8FF 0%, #C6D8FA 100%);
                }
                #root {
                  width: 100%;
                  max-width: 420px;
                  height: 92dvh;
                  max-height: 880px;
                  border-radius: 36px;
                  overflow: hidden;
                  box-shadow: 0 24px 60px rgba(22, 38, 79, 0.22), 0 0 0 8px rgba(255, 255, 255, 0.75);
                  background-color: #EEF4FF;
                }
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
