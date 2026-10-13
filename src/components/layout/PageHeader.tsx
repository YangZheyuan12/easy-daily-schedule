import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

interface PageHeaderProps {
  title: string;
  /**
   * 副标题。允许传节点：任务页把其中的「日期」做成可点的日期选择入口，
   * 而「完成 2/6（33%）」保持纯文本（点它跳日历会让人费解）。
   */
  subtitle?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
  /** 板块主色（概念稿页头不再用色条，保留参数兼容旧调用） */
  accent?: string;
}

/**
 * 页头（对齐概念稿 C4-C7）：大号标题 + 副标题，返回键是圆形下沉底按钮；
 * 整页头直接坐在页面底色上（不再是白条）。
 *
 * 副标题提到 `body`（15px）：它承载的是「哪一天 / 完成多少 / 这一页怎么看」，
 * 是会被真读的信息，不是装饰。压在 13px 时跟正文差了两档，视线会自动跳过它。
 */
export function PageHeader({ title, subtitle, onBack, right }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-app/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2.5 px-5 pt-2.5 pb-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-[30px] h-[30px] shrink-0 rounded-pill bg-surface-sunken flex items-center justify-center text-ink-soft active:opacity-60"
            aria-label="返回"
          >
            <Icon name="chevron-left" size={16} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-title font-semibold text-ink leading-7 tracking-tight truncate">
            {title}
          </div>
          {subtitle && <div className="mt-0.5 text-body text-ink-faint truncate">{subtitle}</div>}
        </div>
        {right && <div className="flex items-center gap-1 shrink-0">{right}</div>}
      </div>
    </header>
  );
}
