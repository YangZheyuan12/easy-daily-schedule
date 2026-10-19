/**
 * 生成 App 图标（1024×1024）到 `assets/icon-only.png` 与 iOS 的 AppIcon 资源。
 *
 * 为什么用脚本而不是把 png 直接塞进仓库：
 * 以后想调颜色 / 间距，改这里的 SVG 重跑一次即可，不用再找设计文件。
 *
 * 视觉语言取自 paper 主题（应用默认主题）：
 * - 底 `#FBF8F2`（页面纸感暖白）、轨道 `#EAE3D5`（暖灰细线）
 * - 节点 `#A39B8B`（弱墨）与 `#9C6B3F`（木质重音，标「当前这一条」）
 * - 内容条 `#2D2A24`（暖墨）按透明度做层次
 * 图形本身是「时间轴 + 三条事项」—— 应用的核心页就是时间轴。
 *
 * ⚠️ iOS 的 App Store 校验**不接受带 alpha 通道**的图标，
 * 所以最后必须 `removeAlpha()`，而不是仅靠铺满背景色。
 *
 * 同一份图还要出 PWA 用的几档尺寸（加到主屏幕后的桌面图标）：
 * iOS 认 `apple-touch-icon`（180），其余靠 manifest 的 192 / 512。
 * 主屏幕图标同样不能有 alpha —— 透明部分在 iOS 上会被填成黑色。
 *
 * 用法：`node scripts/tools/make-app-icon.mjs`
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const APP_ICON_DIR = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
const PUBLIC_DIR = path.join(ROOT, 'public');

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#FBF8F2"/>
  <!--
    整体放大 1.5 倍（围绕画布中心）。原始图形只占约 46% 宽度，直接出图后在
    主屏上会显得「图很小、留白很大」；iOS 图标的内容通常占到 70% 左右。
  -->
  <g transform="translate(512 512) scale(1.5) translate(-512 -512)">
    <rect x="316" y="268" width="24" height="488" rx="12" fill="#EAE3D5"/>
    <circle cx="328" cy="340" r="44" fill="#A39B8B"/>
    <circle cx="328" cy="512" r="44" fill="#A39B8B"/>
    <circle cx="328" cy="684" r="56" fill="#9C6B3F"/>
    <rect x="448" y="324" width="300" height="32" rx="16" fill="#2D2A24" opacity="0.28"/>
    <rect x="448" y="496" width="300" height="32" rx="16" fill="#2D2A24" opacity="0.55"/>
    <rect x="448" y="668" width="300" height="32" rx="16" fill="#9C6B3F"/>
  </g>
</svg>
`;

async function main() {
  await mkdir(path.join(ROOT, 'assets'), { recursive: true });
  await mkdir(APP_ICON_DIR, { recursive: true });
  await mkdir(PUBLIC_DIR, { recursive: true });

  const png = await sharp(Buffer.from(SVG))
    .resize(1024, 1024)
    .flatten({ background: '#FBF8F2' })
    .removeAlpha()
    .png()
    .toBuffer();

  const targets = [
    path.join(ROOT, 'assets/icon-only.png'),
    path.join(APP_ICON_DIR, 'AppIcon-512@2x.png'),
  ];

  for (const target of targets) {
    await sharp(png).toFile(target);
    console.log(`wrote ${path.relative(ROOT, target)}`);
  }

  // PWA / 主屏幕图标：同一张图缩到各档，同样去 alpha
  const pwaTargets = [
    ['apple-touch-icon.png', 180],
    ['pwa-192.png', 192],
    ['pwa-512.png', 512],
  ];
  for (const [name, size] of pwaTargets) {
    const target = path.join(PUBLIC_DIR, name);
    await sharp(png).resize(size, size).toFile(target);
    console.log(`wrote ${path.relative(ROOT, target)} (${size})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
