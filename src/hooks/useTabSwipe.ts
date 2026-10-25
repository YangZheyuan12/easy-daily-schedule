import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TAB_ORDER, tabIndexForPath } from '@/navigation/tabOrder';

/**
 * 横向滑动切换底部 Tab 的手势钩子。
 *
 * 用法：把返回的三个处理器铺在包裹 `<Outlet/>` 的容器上。
 * 在五个主 Tab 之间左右滑动越过阈值，就跳到相邻 Tab —— 视觉上像「翻页」，
 * 而不是点底部导航栏。
 *
 * 设计要点（避免误触）：
 * - 只认**基本横向**的手势：`|横向位移| ≥ 阈值` 且 `|横向| > |纵向| × 比例`，
 *   竖向滚动（dy 大）完全放行，不抢系统的滚动。
 * - 手势起点落在标了 `data-no-swipe` 的元素内（如任务/时间轴的拖拽排序区）
 *   直接放弃，避免和已有的横向拖拽冲突。
 * - 不调用 `preventDefault`：竖向滚动保持原生，横向滑动只是「读完坐标后跳一下」。
 * - 子路由（板块详情等）命中不到主 Tab 时不动，避免在详情页里误滑走。
 */
const SWIPE_THRESHOLD_PX = 56;
const HORIZONTAL_DOMINANCE = 1.4;

export function useTabSwipe() {
  const navigate = useNavigate();
  const location = useLocation();
  const start = useRef<{ x: number; y: number; blocked: boolean } | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    const target = event.target as HTMLElement | null;
    const blocked = target?.closest('[data-no-swipe]') !== null;
    start.current = { x: event.clientX, y: event.clientY, blocked };
  }, []);

  const reset = useCallback(() => {
    start.current = null;
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const begin = start.current;
      start.current = null;
      if (!begin || begin.blocked) return;

      const dx = event.clientX - begin.x;
      const dy = event.clientY - begin.y;
      const horizontal = Math.abs(dx);
      if (horizontal < SWIPE_THRESHOLD_PX) return;
      if (horizontal < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;

      const idx = tabIndexForPath(location.pathname);
      if (idx < 0) return;
      // 左滑（dx<0，手指向左）→ 去右侧相邻 Tab；右滑 → 去左侧相邻 Tab
      const next = dx < 0 ? idx + 1 : idx - 1;
      if (next < 0 || next >= TAB_ORDER.length) return;
      navigate(TAB_ORDER[next]);
    },
    [navigate, location.pathname],
  );

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: reset,
  };
}
