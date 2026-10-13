import clsx from 'clsx';
import { Icon } from './Icon';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';

interface TickProps {
  done: boolean;
  onToggle: () => void;
  /** 视觉边长 px（概念稿：树顶层 20 / 树子项 17 / 任务 20 / 日记体 16） */
  size?: number;
  /** 形态：日记体是圆形，任务与树的层级是近方角 */
  shape?: 'circle' | 'square';
  /** 完成态填充色。默认主题重音；树的板块色从外面传 */
  color?: string;
  /**
   * 按钮自身的布局脚印（`min-w-*` / `min-h-*`）。
   * 由调用点给，是为了**保持各屏原有的行宽与对齐不变** ——
   * 这个组件只负责「勾选长什么样、怎么动」，不负责栅格。
   */
  className?: string;
}

/**
 * 勾选框。四个使用点（日记体 / 任务 / 树 / 时间轴）共用一份实现，
 * 保证「勾上」这件事在任何屏幕上的手感完全一致。
 *
 * 动效只在**真的被勾选/取消那一刻**播放（`useRecentlyChanged`）：
 * 盒子按 `--m-ease-spring` 弹一下（0.76 → 1.14 → 1），
 * 同时那一勾用 stroke-dashoffset 从左画到右 —— 这是清单类应用里
 * 唯一每天会被重复体验几十次的微交互，值得单独做。
 */
export function Tick({
  done,
  onToggle,
  size = 18,
  shape = 'square',
  color,
  className,
}: TickProps) {
  const popped = useRecentlyChanged(done);
  const fill = color ?? 'rgb(var(--c-accent))';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={clsx('flex items-center justify-center shrink-0 text-accent-fg', className)}
      aria-label={done ? '标记为未完成' : '标记为已完成'}
    >
      <span
        className={clsx(
          'flex items-center justify-center border-[1.5px] transition-colors',
          shape === 'circle' ? 'rounded-pill' : 'rounded-xs',
          done ? 'border-transparent' : 'border-edge-strong',
          popped && 'm-tick',
        )}
        style={{
          width: size,
          height: size,
          ...(done ? { backgroundColor: fill, borderColor: fill } : null),
        }}
      >
        {done && <Icon name="check" size={Math.round(size * 0.62)} strokeWidth={2.6} />}
      </span>
    </button>
  );
}
