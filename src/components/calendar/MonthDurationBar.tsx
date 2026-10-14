import type { SectionKey } from '@/domain/enums';
import { SECTION_CONFIGS, sectionColor } from '@/domain/constants';
import { formatDuration } from '@/services/durationService';

interface MonthDurationBarProps {
  /** 各板块本月时长（分钟） */
  durations: Record<SectionKey, number>;
  /** 本月合计（分钟） */
  total: number;
}

/**
 * 本月时长条（日历页）。
 *
 * 数据**全部来自时间轴**：只有排了时间段、且归到了板块的时间才计入
 * （口径见 `durationService`：实际时间优先，没记录就回退计划时间）。
 * 条目和任务没有时长概念，不参与 —— 时长是「时间轴」这个维度独有的信息。
 *
 * 两个显示上的取舍：
 * - 条形长度按**本月最大值**归一，不是按合计。四板块的量级可能差很多，
 *   按合计归一的话最短那条会只剩 2px，看起来和「0」没区别。
 * - 整月一条都没有时**不画四条空条**，而是直说「本月还没有时间轴记录」。
 *   画四条 0 会让人以为功能坏了（明明排过时间却显示 0 分）。
 */
export function MonthDurationBar({ durations, total }: MonthDurationBarProps) {
  const max = Math.max(...SECTION_CONFIGS.map((config) => durations[config.key] ?? 0));

  return (
    <section className="mx-5 mt-3 rounded-card bg-surface border border-surface-line p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-body font-medium text-ink">本月时长</span>
        <span className="text-caption text-ink-faint">
          {total > 0 ? `合计 ${formatDuration(total)}` : '来自时间轴'}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-1.5 text-caption text-ink-faint">
          本月还没有归类到板块的时间段。到时间轴排一段时间并选板块，这里就会累计。
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {SECTION_CONFIGS.map((config) => {
            const minutes = durations[config.key] ?? 0;
            // 至少留 6% 的一小截：有记录但极短时也要能看见「有」，而不是一条空气
            const ratio = max > 0 ? Math.max(0.06, minutes / max) : 0;
            return (
              <li key={config.key} className="flex items-center gap-2">
                <span className="w-[30px] shrink-0 text-caption text-ink-soft">{config.name}</span>
                <span className="flex-1 h-[8px] rounded-pill bg-surface-sunken overflow-hidden">
                  <span
                    className="block h-full rounded-pill transition-[width] duration-[var(--m-dur-3)] ease-[var(--m-ease-out)]"
                    style={{ width: `${ratio * 100}%`, backgroundColor: sectionColor(config) }}
                  />
                </span>
                <span className="w-[52px] shrink-0 text-right text-caption text-ink-muted tabular-nums">
                  {formatDuration(minutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
