/**
 * 底部 Tab 的顺序与「路径 → 主 Tab」的命中规则。
 *
 * 抽成共享常量而不是散落在 `BottomTabBar` / `useTabSwipe` 两处：
 * 左右滑动切 Tab 的钩子需要知道「当前在第几个、左滑去第几个」，
 * 它和底部导航栏的排列必须完全一致，否则滑一下会跳错页。
 */

/** 五个主 Tab 的路由，索引顺序即左右排列顺序 */
export const TAB_ORDER = ['/today', '/tasks', '/timeline', '/calendar', '/me'] as const;

export type TabPath = (typeof TAB_ORDER)[number];

/**
 * 给定当前 pathname，返回它归属的主 Tab 索引。
 *
 * 精确命中（如 `/today`）直接返回；子路由（如 `/tasks/deadline`、
 * `/section/:id`）归到其主 Tab 前缀（`/tasks`、`/today` 等）。
 * 不属于任何主 Tab 的页面（如板块详情）返回 -1 —— 那里不做滑动切 Tab。
 */
export function tabIndexForPath(pathname: string): number {
  const exact = (TAB_ORDER as readonly string[]).indexOf(pathname);
  if (exact >= 0) return exact;
  const base = (TAB_ORDER as readonly string[]).find(
    (tab) => pathname === tab || pathname.startsWith(`${tab}/`),
  );
  return base ? (TAB_ORDER as readonly string[]).indexOf(base) : -1;
}
