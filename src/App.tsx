import { useEffect } from 'react';
import { AppRouter } from '@/router/AppRouter';
import { useApplyTheme } from '@/theme/useApplyTheme';
import { useTimelineWindowStore } from '@/store/useTimelineWindowStore';
import { useSectionProfileStore } from '@/store/useSectionProfileStore';

export default function App() {
  // 主题必须在路由渲染前生效，否则首屏会先闪一下默认主题
  useApplyTheme();

  // 时间轴周视图时间窗偏好（与主题同级的启动期 hydrate）
  const hydrateWindow = useTimelineWindowStore((s) => s.hydrate);
  // 板块自定义（名称 / 颜色 / 图标）：不 hydrate 的话首屏会先闪一下内置板块名
  const hydrateSections = useSectionProfileStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateWindow();
    void hydrateSections();
  }, [hydrateWindow, hydrateSections]);

  return <AppRouter />;
}
