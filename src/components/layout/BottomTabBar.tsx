import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, type IconName } from '@/components/ui/Icon';

const TABS = [
  { to: '/today', label: '今日', icon: 'sun' },
  { to: '/tasks', label: '任务', icon: 'task' },
  { to: '/timeline', label: '时间轴', icon: 'clock' },
  { to: '/calendar', label: '日历', icon: 'calendar' },
  { to: '/me', label: '我的', icon: 'user' },
] as const satisfies readonly { to: string; label: string; icon: IconName }[];

/**
 * 底部 Tab Bar（胶囊式）。
 *
 * 形态来自概念稿：整条导航是一个悬浮的胶囊容器，激活项用**实色填充**而不是
 * 「换个文字颜色」—— 这是移动端少有的高级感来源，也让三套主题的形态差异
 * （A 近方角 / C 纸片 / B 圆润）在导航上一眼可辨。
 *
 * 规格：胶囊高 70 · 圆角 --r-pill · 内 padding 4 · 单项圆角 --r-pill ·
 * 图标 21 · 标签 13px（`text-caption`）。
 *
 * ⚠️ 胶囊高度与 `AppShell` 的底部留白、三处主操作按钮和 `UndoBar` 的
 * `bottom-*` 是**一套联动值**（留出胶囊高度 + 外边距 + 呼吸空间）。
 * 改这里就必须同步改那四处，否则悬浮按钮会被导航压住 —— 见各处注释。
 *
 * 激活态的实色块是一个**独立浮层**（不是给激活项加背景）：
 * 它带 `transform` 过渡，切换 Tab 时会从旧位置滑到新位置。
 * 这是全应用唯一一处「滑动」，也是用户确认「页面真的换了」的第一反馈 ——
 * 页面本身只在内容层做落定（外层不能用 transform，理由见 AppShell 注释）。
 *
 * 微信小程序 tabBar 支持 2–5 项，5 项在规范之内，二期可直接使用原生 tabBar。
 */
export function BottomTabBar() {
  const location = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const [visible, setVisible] = useState(false);

  /** 当前激活项。-1 = 不在任何 Tab 上（如板块详情页），指示器淡出但留在原地 */
  const activeIndex = TABS.findIndex((tab) => location.pathname.startsWith(tab.to));

  const measure = useCallback(() => {
    const item = listRef.current?.querySelectorAll<HTMLElement>('[data-tab-item]')[activeIndex];
    if (!item) {
      setVisible(false);
      return;
    }
    setIndicator({ x: item.offsetLeft, w: item.offsetWidth });
    setVisible(true);
  }, [activeIndex]);

  // useLayoutEffect 而非 useEffect：指示器的位置必须在**首次绘制前**算好，
  // 否则会先看到一个 width:0 的色块闪一下再展开。
  useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list) return;
    // 旋转屏幕 / 软键盘弹起都会改变等分宽度，指示器必须跟着重算
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  return (
    // bottom 留白 = 呼吸空间 16 + 安全区（叠加而非覆盖，见 index.css 里的说明）
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-center px-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
      <div
        ref={listRef}
        className="relative w-full max-w-[430px] h-[70px] rounded-pill bg-surface border border-surface-line shadow-card flex items-center gap-1 p-1"
      >
        <span
          aria-hidden
          className={clsx(
            'absolute top-1 bottom-1 left-0 rounded-pill bg-accent shadow-glow',
            'transition-[transform,width,opacity] duration-[var(--m-dur-3)] ease-[var(--m-ease-out)]',
            visible ? 'opacity-100' : 'opacity-0',
          )}
          style={{ transform: `translateX(${indicator?.x ?? 0}px)`, width: indicator?.w ?? 0 }}
        />

        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            data-tab-item
            className={({ isActive }) =>
              clsx(
                'relative z-10 flex-1 h-full rounded-pill flex flex-col items-center justify-center gap-1',
                'transition-colors duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
                isActive ? 'text-accent-fg' : 'text-ink-faint',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} size={21} strokeWidth={isActive ? 2 : 1.8} />
                <span className={clsx('text-caption leading-none', isActive && 'font-medium')}>
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
