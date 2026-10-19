import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setupNativeBridge } from '@/platform/capacitorBridge';
import { registerServiceWorker } from '@/platform/pwaBridge';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

// 原生壳（Capacitor）内的能力绑定：切后台落盘 / 状态栏配色 / 键盘工具条。
// 在浏览器里 setupNativeBridge() 立刻返回空操作，不影响 Web 构建。
setupNativeBridge();

// 浏览器里的离线缓存（Service Worker）。原生壳内不注册 —— 见 pwaBridge 的说明。
registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
