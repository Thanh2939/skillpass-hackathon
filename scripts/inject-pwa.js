const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../dist/index.html');

if (!fs.existsSync(indexPath)) {
  console.error('dist/index.html not found');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

const pwaHeadTags = `
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="SkillPass" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="format-detection" content="telephone=no" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <style id="skillpass-pwa-frame">
    html, body, #root {
      background-color: #EEF4FF;
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
        flex: none;
        border-radius: 36px;
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(22, 38, 79, 0.22), 0 0 0 8px rgba(255, 255, 255, 0.75);
        background-color: #EEF4FF;
      }
    }
  </style>
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
    }
  </script>
</head>`;

if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />'
  );
  html = html.replace('</head>', pwaHeadTags);
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('Injected iOS & Android PWA tags into dist/index.html');
}
