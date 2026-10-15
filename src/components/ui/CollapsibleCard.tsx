import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useExpanded } from '@/hooks/useExpanded';
import { Icon } from './Icon';

interface CollapsibleCardProps {
  title: string;
  /** 标题右侧的次要说明（折叠时也要看得见，如当前主题名） */
  hint?: string;
  children: ReactNode;
  /**
   * 默认展开。**默认收起**（用户要求）：设置页的卡片一屏扫得完，
   * 找哪张卡展开哪张；默认全摊开反而要把无关内容滚一遍。
   */
  defaultOpen?: boolean;
  /**
   * 展开态的稳定 key（跨页保持用）：切去别的 Tab 再回来，展开/收起不变。
   * 同一页里的每张卡各传一个（如 `me:appearance`）。
   */
  expandKey: string;
}

/**
 * 可折叠的设置卡（「我的」页通用）。
 *
 * 为什么需要折叠：设置页的每一卡里面都是**一组**控件（三个主题、三行时间窗、
 * 四个板块），全都摊开的话一屏装不下，要找一个开关得先滚过两屏无关内容。
 * 折叠后每卡只剩一行标题，扫一眼就能定位。
 *
 * 展开态走 `useExpanded(expandKey)` 存在 UI store 里（2026-10-16 用户要求：
 * 展开着切去别的页面再回来还得是展开的）。只活在会话内 —— 刷新重置，
 * 不落盘：那是「偏好」，不是「此刻在看什么」，两件事不该混在一个开关里。
 */
export function CollapsibleCard({
  title,
  hint,
  children,
  defaultOpen = false,
  expandKey,
}: CollapsibleCardProps) {
  const { open, toggle } = useExpanded(expandKey, defaultOpen);

  return (
    <section className="bg-surface rounded-card border border-surface-line shadow-card overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="press w-full flex items-center gap-2 px-3.5 min-h-[52px] text-left"
      >
        <span className="text-lead font-medium text-ink shrink-0">{title}</span>
        {hint && <span className="ml-auto text-caption text-ink-faint truncate">{hint}</span>}
        <Icon
          name="chevron-down"
          size={16}
          className={clsx(
            'shrink-0 text-ink-faint transition-transform duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
            !hint && 'ml-auto',
            open ? 'rotate-180' : 'rotate-0',
          )}
        />
      </button>

      {/* 内边距由外层统一给：内容就只管内容，不用每张卡自己凑一遍 px-3.5 */}
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </section>
  );
}
