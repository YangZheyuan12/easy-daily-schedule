import { SECTION_CONFIGS } from '@/domain/constants';
import type { SectionKey } from '@/domain/enums';
import type { DailySelfStatus, DaySummary, Inspiration, Item, Task, TimeSlot } from '@/domain/types';
import { groupBy } from '@/utils/array';
import { monthGrid, monthsInYear, shiftDateKey, toMonthKey, yearRange } from '@/utils/date';
import type { MonthCell } from '@/utils/date';
import { computeAllSections, computeTaskProgress } from './progressService';
import { collectSyncedSlotIds } from './slotSyncService';

/**
 * 日历月视图的摘要计算（纯函数，零浏览器 API）。
 *
 * 两条必须守住的约束：
 * 1. **完成度口径与首页完全一致** —— 四板块数字一律复用 `progressService`，
 *    不在本文件里重写聚合逻辑。否则日历上显示「3/5」、首页环形图显示「3/8」，
 *    用户会直接判定数据错了。
 * 2. **入参是整月数据** —— 由 store 用一次区间查询（区间 = 月历网格覆盖的 42 天）
 *    取回后整体传入，本函数只做内存分组，不做任何 I/O。
 */

/** 判断「某天是否有记录」所需的最小数据集 */
export interface DayDataInput {
  items: readonly Item[];
  tasks: readonly Task[];
  timeSlots: readonly TimeSlot[];
  inspirations: readonly Inspiration[];
  selfStatus?: DailySelfStatus | null;
}

function emptySections(): Record<SectionKey, { done: number; total: number }> {
  const sections = {} as Record<SectionKey, { done: number; total: number }>;
  for (const config of SECTION_CONFIGS) {
    sections[config.key] = { done: 0, total: 0 };
  }
  return sections;
}

/**
 * 空摘要。
 *
 * 每次调用都返回**新对象**：`sections` 是嵌套结构，共用一个冻结常量会被
 * 某处误改后污染整张日历，代价太大。
 */
export function emptySummary(date: string): DaySummary {
  return {
    date,
    hasData: false,
    sections: emptySections(),
    taskDone: 0,
    taskTotal: 0,
    mood: 0,
    body: 0,
    overall: 0,
  };
}

/** 无数据日的兜底常量（只读用途，需要绑定日期时请用 `emptySummary(date)`） */
export const EMPTY_SUMMARY: DaySummary = emptySummary('');

/**
 * 某天是否留下了任何痕迹。
 *
 * 只看「有没有」，不看「完成没完成」：打了卡但一条没做完，日历上也要能看出来。
 * 软删记录不算数 —— 否则删掉的东西还在日历上留点，与首页观感不一致。
 */
export function hasAnyData(day: DayDataInput): boolean {
  if (day.items.some((item) => item.deletedAt === null)) return true;
  if (day.tasks.some((task) => task.deletedAt === null)) return true;
  if (day.timeSlots.some((slot) => slot.deletedAt === null)) return true;
  if (day.inspirations.some((row) => row.deletedAt === null)) return true;
  const selfStatus = day.selfStatus;
  if (!selfStatus) return false;
  return (
    selfStatus.mood > 0 ||
    selfStatus.body > 0 ||
    selfStatus.moodText.trim().length > 0 ||
    selfStatus.bodyText.trim().length > 0
  );
}

/** 单日摘要。四板块走 progressService，任务走 computeTaskProgress（同一套口径） */
export function buildDaySummary(
  date: string,
  items: readonly Item[],
  tasks: readonly Task[],
  timeSlots: readonly TimeSlot[],
  inspirations: readonly Inspiration[],
  selfStatus: DailySelfStatus | null,
): DaySummary {
  // 防御性按当天过滤：本函数的 contract 是「某一天」，若调用方漏过滤（比如把整周
  // 数据整包塞进来），不在这里拦住就会把别天的条目算进这天 —— 日历上出现
  // 「3/5」而首页显示「1/2」这种无法解释的差异，排查成本极高。
  const dayItems = items.filter((item) => item.date === date);
  const dayTasks = tasks.filter((task) => task.date === date);
  const dayTimeSlots = timeSlots.filter(
    (slot) => slot.date === date && slot.deletedAt === null,
  );
  // 灵感只影响「有没有记录」，不进板块完成度 / overall / 色点
  const dayInspirations = inspirations.filter((row) => row.date === date);
  const daySelfStatus = selfStatus && selfStatus.date === date ? selfStatus : null;

  const progressMap = computeAllSections(dayItems);
  // 已同步成条目的时段：条目那边已经计过一次，这里必须排除，否则分母翻倍
  const syncedSlotIds = collectSyncedSlotIds(dayItems);

  const sections = emptySections();
  let totalCount = 0;
  let totalDone = 0;
  for (const config of SECTION_CONFIGS) {
    const progress = progressMap[config.key];
    let done = progress.done;
    let total = progress.total;
    // 时间段若归类到板块，则并入该板块的完成度（与条目同一口径）
    for (const slot of dayTimeSlots) {
      if (slot.sectionId === config.key && !syncedSlotIds.has(slot.id)) {
        total += 1;
        if (slot.done) done += 1;
      }
    }
    sections[config.key] = { done, total };
    totalCount += total;
    totalDone += done;
  }

  const taskProgress = computeTaskProgress(dayTasks.filter((task) => task.deletedAt === null));

  return {
    date,
    hasData: hasAnyData({
      items: dayItems,
      tasks: dayTasks,
      timeSlots: dayTimeSlots,
      inspirations: dayInspirations,
      selfStatus: daySelfStatus,
    }),
    sections,
    taskDone: taskProgress.done,
    taskTotal: taskProgress.total,
    mood: daySelfStatus?.mood ?? 0,
    body: daySelfStatus?.body ?? 0,
    // 与 RingData.overall 同源：Σ(顶层完成) ÷ Σ(顶层总数)，任务不参与
    // （归入板块的时间段已计入 sections，故一并进入加权平均）
    overall: totalCount === 0 ? 0 : totalDone / totalCount,
  };
}

/**
 * 构建整月的日摘要表。
 *
 * 产品口径（已确认）：
 * - 为月历网格的**全部 42 格**都产出摘要，每一格都基于该日期自己的真实记录。
 *   补位格（上月 / 下月的日期）同样取真值 —— 它在屏幕上看得见、点得到，
 *   对它返回空摘要等于对一个真实有记录的日子谎报「这一天还没有任何记录」，
 *   这是制造错误信息，比少渲染一点严重得多。
 * - **「本月不被上下月数据污染」由按日期精确分组保证**：每一格只认 `date`
 *   与自身相等的条目。这与「补位格取真值」是两件正交的事，互不冲突。
 * - 「本月视图里不显示别月的色点」属于渲染职责，由 `DayCell` 决定
 *   （只对当月格与今天渲染色点），与本函数无关。
 *
 * 网格内每一格都有摘要，UI 直接 `summaries[dateKey]` 取值即可，不用到处写兜底判断。
 */
/**
 * 月 / 年视图共用的「逐日聚合」核心。
 *
 * 给定一组网格单元（其 `dateKey` 即为本次要计算的范围），把整段数据按日期分组、
 * 只对落在范围内的日期算摘要。UI 直接 `summaries[dateKey]` 取值即可。
 */
function buildRangeSummaries(
  cells: readonly { dateKey: string; inMonth?: boolean }[],
  items: readonly Item[],
  tasks: readonly Task[],
  timeSlots: readonly TimeSlot[],
  inspirations: readonly Inspiration[],
  selfStatuses: readonly DailySelfStatus[],
): Record<string, DaySummary> {
  const knownDates = new Set(cells.map((cell) => cell.dateKey));

  const itemsByDate = groupBy(
    items.filter((item) => knownDates.has(item.date)),
    (item) => item.date,
  );
  const tasksByDate = groupBy(
    tasks.filter((task) => knownDates.has(task.date)),
    (task) => task.date,
  );
  const slotsByDate = groupBy(
    timeSlots.filter((slot) => knownDates.has(slot.date)),
    (slot) => slot.date,
  );
  const inspirationsByDate = groupBy(
    inspirations.filter((row) => knownDates.has(row.date)),
    (row) => row.date,
  );
  const selfStatusByDate = new Map<string, DailySelfStatus>();
  for (const selfStatus of selfStatuses) {
    if (knownDates.has(selfStatus.date)) selfStatusByDate.set(selfStatus.date, selfStatus);
  }

  const result: Record<string, DaySummary> = {};
  for (const cell of cells) {
    result[cell.dateKey] = buildDaySummary(
      cell.dateKey,
      itemsByDate.get(cell.dateKey) ?? [],
      tasksByDate.get(cell.dateKey) ?? [],
      slotsByDate.get(cell.dateKey) ?? [],
      inspirationsByDate.get(cell.dateKey) ?? [],
      selfStatusByDate.get(cell.dateKey) ?? null,
    );
  }
  return result;
}

/**
 * 构建整月的日摘要表。
 *
 * 产品口径（已确认）：
 * - 为月历网格的**全部 42 格**都产出摘要，每一格都基于该日期自己的真实记录。
 *   补位格（上月 / 下月的日期）同样取真值 —— 它在屏幕上看得见、点得到，
 *   对它返回空摘要等于对一个真实有记录的日子谎报「这一天还没有任何记录」，
 *   这是制造错误信息，比少渲染一点严重得多。
 * - 「本月不被上下月数据污染」由按日期精确分组保证：每一格只认 `date`
 *   与自身相等的条目。这与「补位格取真值」是两件正交的事，互不冲突。
 * - 「本月视图里不显示别月的色点」属于渲染职责，由 `DayCell` 决定
 *   （只对当月格与今天渲染色点），与本函数无关。
 *
 * 网格内每一格都有摘要，UI 直接 `summaries[dateKey]` 取值即可，不用到处写兜底判断。
 */
export function buildMonthSummaries(
  items: readonly Item[],
  tasks: readonly Task[],
  timeSlots: readonly TimeSlot[],
  inspirations: readonly Inspiration[],
  selfStatuses: readonly DailySelfStatus[],
  monthKey: string,
): Record<string, DaySummary> {
  return buildRangeSummaries(
    monthGrid(monthKey),
    items,
    tasks,
    timeSlots,
    inspirations,
    selfStatuses,
  );
}

/**
 * 构建**一周**（给定日期键集合）的日摘要表。
 *
 * 与 `buildMonthSummaries` 同一套逐日聚合核心（同一口径、同一组纯函数），
 * 区别只是「范围」由调用方显式传入这 7 个日期键，而不是从月历网格推导。
 * 这样一周跨两个月时，两个月的格子都能拿到真实摘要 —— 不会漏算。
 *
 * 日历周视图直接 `summaries[dateKey]` 取值，UI 不用写兜底。
 */
export function buildWeekSummaries(
  dateKeys: readonly string[],
  items: readonly Item[],
  tasks: readonly Task[],
  timeSlots: readonly TimeSlot[],
  inspirations: readonly Inspiration[],
  selfStatuses: readonly DailySelfStatus[],
): Record<string, DaySummary> {
  return buildRangeSummaries(
    dateKeys.map((dateKey) => ({ dateKey })),
    items,
    tasks,
    timeSlots,
    inspirations,
    selfStatuses,
  );
}

/** 年视图里某个月的迷你汇总（聚合该月每天的数据） */
export interface MonthMiniSummary {
  monthKey: string;
  /** 该月「有记录」的天数 */
  daysWithData: number;
  /** 该月是否整体有任意记录 */
  hasAny: boolean;
  /** 各板块完成度之和（四板块顶层条目 + 归入板块的时间段） */
  sections: Record<SectionKey, { done: number; total: number }>;
}

/** 列出某一年内的所有日期键（1/1 → 12/31，闭区间，本地时区） */
function yearDays(yearKey: string): { dateKey: string }[] {
  const { start, end } = yearRange(yearKey);
  const days: { dateKey: string }[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push({ dateKey: cursor });
    cursor = shiftDateKey(cursor, 1);
  }
  return days;
}

/**
 * 构建整年的月汇总表。
 *
 * 先按天算出整年的日摘要，再把 12 个月各自累加起来：
 * - `daysWithData` = 该月 hasData 为真的天数；
 * - `sections` = 该月每天同板块完成度的累加（用于年视图的小色点 / 进度提示）。
 * 边界日（跨月补位）不会重复计入：这里按真实自然月分组，而非复用月历的 42 格。
 */
export function buildYearSummaries(
  yearKey: string,
  items: readonly Item[],
  tasks: readonly Task[],
  timeSlots: readonly TimeSlot[],
  inspirations: readonly Inspiration[],
  selfStatuses: readonly DailySelfStatus[],
): Record<string, MonthMiniSummary> {
  const daySummaries = buildRangeSummaries(
    yearDays(yearKey),
    items,
    tasks,
    timeSlots,
    inspirations,
    selfStatuses,
  );

  const result: Record<string, MonthMiniSummary> = {};
  for (const monthKey of monthsInYear(yearKey)) {
    result[monthKey] = {
      monthKey,
      daysWithData: 0,
      hasAny: false,
      sections: emptySections(),
    };
  }

  for (const summary of Object.values(daySummaries)) {
    const monthKey = toMonthKey(summary.date);
    const bucket = result[monthKey];
    if (!bucket) continue;
    if (summary.hasData) {
      bucket.daysWithData += 1;
      bucket.hasAny = true;
    }
    for (const config of SECTION_CONFIGS) {
      bucket.sections[config.key].done += summary.sections[config.key].done;
      bucket.sections[config.key].total += summary.sections[config.key].total;
    }
  }

  return result;
}

/**
 * 构建整年**每一天**是否有记录的布尔表（key 为日期键）。
 *
 * 给年视图的「迷你月历」用：每个月份渲染成缩小版的当月格子，
 * 有记录的那天才点亮一个小点。直接复用 `buildRangeSummaries` 的逐日聚合核心，
 * 不重复实现「什么叫有记录」的口径（与月 / 周摘要同源）。
 */
export function buildYearDayDots(
  yearKey: string,
  items: readonly Item[],
  tasks: readonly Task[],
  timeSlots: readonly TimeSlot[],
  inspirations: readonly Inspiration[],
  selfStatuses: readonly DailySelfStatus[],
): Record<string, boolean> {
  const daySummaries = buildRangeSummaries(
    yearDays(yearKey),
    items,
    tasks,
    timeSlots,
    inspirations,
    selfStatuses,
  );
  const dots: Record<string, boolean> = {};
  for (const [dateKey, summary] of Object.entries(daySummaries)) {
    dots[dateKey] = summary.hasData;
  }
  return dots;
}

/**
 * 该格要不要渲染四个板块色点。
 *
 * 两个条件各管一件事，别合并回去：
 * - `inMonth`：别月的点不串到本月视图里，否则「10/1」旁边挂着 9 月的点会被误读。
 * - `|| isToday`：锚点例外。今天完全可能落在**非当月的补位格**上（今天是 11-03、
 *   正在看 10 月），那一格带着蓝色高亮，若再不给点，用户就看不到「今天到底记没记」
 *   —— 日历上唯一的锚点反而是瞎的。
 *
 * 抽成纯函数而不是写在组件里：这条规则踩过一次坑（只有组件知道、无法测），
 * 放在 services 层才能被单测锁住。
 */
export function shouldShowDayDots(cell: MonthCell, isToday: boolean): boolean {
  return cell.inMonth || isToday;
}

/**
 * 决定日历页进入某个月时应选中哪一天。
 *
 * 优先级（避免「从时间轴点日期进日历、却落在今天」的错位，也避免选中日取不到摘要）：
 * 1. `preferredDate`（通常是全局日期）若落在该月 → 选它；
 * 2. 否则 `today` 若落在该月 → 选今天；
 * 3. 否则选该月第一天 —— 兜底保证摘要卡永远有内容。
 *
 * 抽成纯函数以便被单测锁住（切月 / 跨年 / 补位日最容易算错）。
 */
export function resolveCalendarSelection(
  monthKey: string,
  preferredDate: string,
  today: string,
): string {
  const inMonthKeys = monthGrid(monthKey)
    .filter((cell) => cell.inMonth)
    .map((cell) => cell.dateKey);
  if (inMonthKeys.includes(preferredDate)) return preferredDate;
  if (inMonthKeys.includes(today)) return today;
  return inMonthKeys[0] ?? `${monthKey}-01`;
}
