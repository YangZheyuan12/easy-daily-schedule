import { SECTION_CONFIGS, sectionColor } from '@/domain/constants';
import type { DaySummary } from '@/domain/types';
import { toPercent } from '@/services/progressService';
import { useDayFestivals } from '@/hooks/useDayFestivals';
import { formatDateLabel, isFutureDate } from '@/utils/date';

interface DaySummaryCardProps {
  dateKey: string;
  summary: DaySummary;
  /** 跳到某个页面去补记：当日（日记体）/ 时间轴 / 任务 */
  onGo: (target: 'today' | 'timeline' | 'tasks') => void;
}

/** 三个补记入口按钮的配置（顺序固定：当日 / 时间轴 / 任务） */
const GO_TARGETS = [
  { target: 'today', label: '当日' },
  { target: 'timeline', label: '时间轴' },
  { target: 'tasks', label: '任务' },
] as const;

/**
 * 选中日的摘要卡（对齐概念稿 C4）：
 * 标题行 = 日期 18px 粗体 + 右上完成度 14px；下面**一行**四板块明细
 * （色点 + 名称 + 完成数/总数，total=0 用「—」），再一行三个下沉底补记入口。
 *
 * 设计取舍：**点日历格不跳页**，只更新下方这张卡。
 * 日历是「回看」场景，用户会连着点好几天比对；跳进详情页再退回来要把月份
 * 重新找一遍，代价太大。真要补记再点下面的「当日 / 时间轴 / 任务」三个入口。
 */
export function DaySummaryCard({ dateKey, summary, onGo }: DaySummaryCardProps) {
  // 未来日期要换一套文案：说「还没有任何记录」等于暗示数据丢了，
  // 而实际上只是还没到。补记入口保留 —— 提前把计划写进去是允许的。
  const future = isFutureDate(dateKey);

  // 标题行下方的农历 / 节日行（如「九月初三 · 中秋节」）；无内容时整行不渲染
  const { festivalLine, lunarLine } = useDayFestivals(dateKey);
  const metaLine = [lunarLine, festivalLine].filter(Boolean).join(' · ');

  return (
    <section className="m-rise px-3 pt-3" style={{ animationDelay: '80ms' }}>
      <div className="bg-surface rounded-card border border-surface-line shadow-card p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-heading font-semibold text-ink truncate">
            {formatDateLabel(dateKey)}
          </div>
          <div className="shrink-0 text-meta text-ink-faint tabular-nums">
            完成 {toPercent(summary.overall)}%
          </div>
        </div>

        {metaLine && (
          <div data-testid="day-summary-festival" className="mt-1 text-caption text-ink-faint truncate">
            {metaLine}
          </div>
        )}

        {/* 板块明细：压成一行，用「·」分隔（概念稿 C4 的形态） */}
        <div className="mt-2.5 flex items-center flex-wrap gap-x-1.5 gap-y-1 text-caption text-ink-muted">
          {SECTION_CONFIGS.map((config) => {
            const section = summary.sections[config.key];
            return (
              <span key={config.key} className="inline-flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: sectionColor(config) }}
                />
                {config.name}
                <span className="tabular-nums text-ink-faint">
                  {section.total === 0 ? '—' : `${section.done}/${section.total}`}
                </span>
                <span className="text-ink-faint pl-0.5">·</span>
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1">
            任务
            <span className="tabular-nums text-ink-faint">
              {summary.taskTotal === 0 ? '—' : `${summary.taskDone}/${summary.taskTotal}`}
            </span>
          </span>
        </div>

        {!summary.hasData && (
          <div className="mt-2.5 text-meta leading-5 text-ink-faint">
            {future ? '这一天还没到，可以提前把计划排进去。' : '这一天还没有任何记录。'}
          </div>
        )}

        {/* 补记入口（概念稿：三个下沉底按钮铺满一行） */}
        <div className="mt-3 flex gap-2.5">
          {GO_TARGETS.map(({ target, label }) => (
            <button
              key={target}
              type="button"
              onClick={() => onGo(target)}
              className="flex-1 min-h-[42px] rounded-sm bg-surface-sunken text-body text-ink-muted active:bg-surface-line/50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
