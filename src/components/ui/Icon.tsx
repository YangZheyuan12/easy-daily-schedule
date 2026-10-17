import type { ReactNode } from 'react';

/**
 * 线性图标集（24×24 网格，stroke 用 currentColor，因此颜色跟随文字类）。
 *
 * 为什么不用 emoji：emoji 的字重、基线、配色都由系统字体决定，跨平台差异极大，
 * 是移动端「高级感」的头号杀手 —— 概念稿里的图标全部是 1.8 描边的线性矢量。
 * 统一走 currentColor 后，一个 `text-ink-faint` 就能让图标跟着主题走。
 *
 * 只放项目真正用到的图标，不引入图标库（零包体）。
 */
export type IconName =
  | 'home'
  | 'task'
  | 'clock'
  | 'calendar'
  | 'settings'
  | 'bulb'
  | 'heart'
  | 'star'
  | 'check'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'sun'
  | 'user'
  | 'more'
  | 'plus'
  | 'trash'
  | 'undo'
  | 'sync'
  | 'image'
  | 'dot'
  /** 拖拽手柄：两列三点（排查 / 长按拖动排序用） */
  | 'grip'
  /** 放大 */
  | 'zoom-in'
  /** 缩小 */
  | 'zoom-out'
  /** 顺时针旋转 90° */
  | 'rotate-cw'
  /** 逆时针旋转 90° */
  | 'rotate-ccw'
  /** 裁剪 */
  | 'crop'
  /** 重置（刷新箭头） */
  | 'reset';

interface IconProps {
  name: IconName;
  /** 边长 px（图标为正方形） */
  size?: number;
  className?: string;
  /** 实心（心 / 星已评分时的状态） */
  filled?: boolean;
  strokeWidth?: number;
}

const STROKE: Record<Exclude<IconName, 'heart' | 'star' | 'dot' | 'grip'>, ReactNode> = {
  home: (
    <>
      <path d="M3 10.6 12 3.4l9 7.2" />
      <path d="M5.4 9.4V20a1 1 0 0 0 1 1h3.6v-6h4v6h3.6a1 1 0 0 0 1-1V9.4" />
    </>
  ),
  task: (
    <>
      <path d="M9 6.5h11.5" />
      <path d="M9 12h11.5" />
      <path d="M9 17.5h11.5" />
      <path d="M4 6.5l1.4 1.4L7.8 5.6" />
      <path d="M4 12l1.4 1.4 2.4-2.3" />
      <path d="M4 17.5l1.4 1.4 2.4-2.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.6 2.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.2" y="5.2" width="17.6" height="15.6" rx="2.4" />
      <path d="M8 3.2v4" />
      <path d="M16 3.2v4" />
      <path d="M3.2 10.4h17.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.4v2.2" />
      <path d="M12 18.4v2.2" />
      <path d="M4.6 7.8l1.9 1.1" />
      <path d="M17.5 15.1l1.9 1.1" />
      <path d="M4.6 16.2l1.9-1.1" />
      <path d="M17.5 8.9l1.9-1.1" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3.4a5.8 5.8 0 0 0-3.4 10.5c.4.3.6.7.6 1.1v.8h5.6v-.8c0-.4.2-.8.6-1.1A5.8 5.8 0 0 0 12 3.4Z" />
      <path d="M9.8 18.6h4.4" />
      <path d="M10.6 21.2h2.8" />
    </>
  ),
  check: <path d="M4.6 12.6l4.9 4.8L19.6 6.6" />,
  close: (
    <>
      <path d="M6.2 6.2l11.6 11.6" />
      <path d="M17.8 6.2 6.2 17.8" />
    </>
  ),
  'chevron-left': <path d="M15 4.8 8.2 12l6.8 7.2" />,
  'chevron-right': <path d="M9 4.8 15.8 12 9 19.2" />,
  'chevron-up': <path d="M4.8 15.2 12 8.2l7.2 7" />,
  'chevron-down': <path d="M4.8 8.8 12 15.8l7.2-7" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.2" />
      <path d="M12 19v2.2" />
      <path d="M4.5 4.5l1.6 1.6" />
      <path d="M17.9 17.9l1.6 1.6" />
      <path d="M2.8 12H5" />
      <path d="M19 12h2.2" />
      <path d="M4.5 19.5l1.6-1.6" />
      <path d="M17.9 6.1l1.6-1.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 20.4c0-3.5 3.2-5.9 7.2-5.9s7.2 2.4 7.2 5.9" />
    </>
  ),
  more: (
    <>
      <circle cx="5.4" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.2v13.6" />
      <path d="M5.2 12h13.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.8h16" />
      <path d="M9.4 6.8V4.4h5.2v2.4" />
      <path d="M6.2 6.8l1 12.8h9.6l1-12.8" />
    </>
  ),
  undo: (
    <>
      <path d="M9.4 14.6 4.2 9.4l5.2-5.2" />
      <path d="M4.2 9.4h9a6.4 6.4 0 0 1 0 12.8H8.6" />
    </>
  ),
  /*
    同步：两段对向的弧形箭头。
    「复制一份到别处」这件事没有公认的单箭头表达，用循环箭头才不会和
    「撤销（undo）」「刷新」混淆 —— 后者都是单向的回退动作。
  */
  sync: (
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3" />
      <path d="M19.5 7.4V12h-4.6" />
      <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3" />
      <path d="M4.5 16.6V12h4.6" />
    </>
  ),
  image: (
    <>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.2" />
      <circle cx="8.6" cy="9.4" r="1.7" />
      <path d="M4.8 17.4 9.2 12.6l3 2.8 2.2-2 4.6 4.2" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3 20.5 20.5" />
      <path d="M10.5 7.5v6" />
      <path d="M7.5 10.5h6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3 20.5 20.5" />
      <path d="M7.5 10.5h6" />
    </>
  ),
  'rotate-cw': (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01" />
      <path d="M20.5 3.5V9h-5.5" />
    </>
  ),
  'rotate-ccw': (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.49-6.01" />
      <path d="M3.5 3.5V9h5.5" />
    </>
  ),
  crop: (
    <>
      <path d="M8 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 8h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  reset: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01" />
      <path d="M20.5 3.5V9h-5.5" />
    </>
  ),
};

/** 心 / 星：空心描边与实心两套（评分的「已选 / 未选」要靠它区分） */
const HEART_PATH =
  'M20.6 5.5a4.9 4.9 0 0 0-6.9 0L12 7.2l-1.7-1.7a4.9 4.9 0 1 0-6.9 6.9L12 21.3l8.6-8.9a4.9 4.9 0 0 0 0-6.9Z';
const STAR_PATH =
  'M12 3.6l2.7 5.5 6 .9-4.35 4.24 1.03 6-5.38-2.83L6.62 20.2l1.03-6L3.3 10l6-.9Z';

export function Icon({ name, size = 20, className, filled = false, strokeWidth = 1.8 }: IconProps) {
  // 子项圆点是纯填充的小圆，不参与描边体系
  if (name === 'dot') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      </svg>
    );
  }

  /*
    拖拽手柄：两列各三个点。
    不用「短线 + 圆头描边」的写法 —— 零长度子路径在部分 WebView 上根本不画，
    实心圆才是各端都稳的画法。
  */
  if (name === 'grip') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
        {[7, 12, 17].map((cy) => (
          <g key={cy}>
            <circle cx={9.5} cy={cy} r={1.4} fill="currentColor" />
            <circle cx={14.5} cy={cy} r={1.4} fill="currentColor" />
          </g>
        ))}
      </svg>
    );
  }

  if (name === 'heart' || name === 'star') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        aria-hidden="true"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={name === 'heart' ? HEART_PATH : STAR_PATH} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {STROKE[name]}
    </svg>
  );
}
