import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';

interface EmptyStateProps {
  /** 图标。传字符串（历史用法）或 <Icon /> 都可 */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

/** 空状态。移动端首屏空状态要给出「下一步做什么」的明确引导，而不是只显示「暂无数据」。 */
export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        // 空状态是「页面刚换过来」时唯一的画面，淡入比硬切更像「页面已经就位」
        'm-rise flex flex-col items-center justify-center text-center px-6',
        compact ? 'py-8' : 'py-16',
      )}
    >
      <div className={compact ? 'mb-2' : 'mb-3'}>
        {icon ?? <Icon name="task" size={compact ? 28 : 40} className="text-ink-faint" />}
      </div>
      <div className="text-lead font-medium text-ink-soft">{title}</div>
      {description && (
        <div className="mt-1 text-meta leading-6 text-ink-faint">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
