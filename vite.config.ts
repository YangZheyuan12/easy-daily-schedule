import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
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
