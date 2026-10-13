import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  /**
   * 静态资源前缀。默认 `'/'`，本地开发与 Capacitor 打包都不用改。
   *
   * 只有部署到 **GitHub Pages 的子路径**（`https://<user>.github.io/<repo>/`）时才需要设成
   * `/<repo>/`——CI 通过环境变量 `VITE_BASE_PATH` 注入，不要写死在这里
   * （写死会让 `npm run dev` 和 Capacitor 打包全部 404）。
   */
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // 允许手机在同一局域网真机调试
    port: 5173,
  },
  test: {
    environment: 'node',
    // ⚠️ 改这里的扩展名时，必须同步改 scripts/check-test-baseline.mjs 的
    // collectTestFiles()（它按 *.test.ts 收文件）。两边不一致会造成
    // 「vitest 不跑、strict 也不跑」的双漏。
    include: ['src/**/*.test.ts'],
  },
});
