import { AppRouter } from '@/router/AppRouter';
import { useApplyTheme } from '@/theme/useApplyTheme';

export default function App() {
  // 主题必须在路由渲染前生效，否则首屏会先闪一下默认主题
  useApplyTheme();
  return <AppRouter />;
}
