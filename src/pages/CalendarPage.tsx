import { Icon } from '@/components/ui/Icon';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { DaySummaryCard } from '@/components/calendar/DaySummaryCard';
import { DurationBar } from '@/components/calendar/DurationBar';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { WeekGrid } from '@/components/calendar/WeekGrid';
import { WeekTaskOverview } from '@/components/calendar/WeekTaskOverview';
import { YearGrid } from '@/components/calendar/YearGrid';
import { PageHeader } from '@/components/layout/PageHeader';
import { emptySummary, resolveCalendarSelection } from '@/services/calendarService';
import { useCalendarStore } from '@/store/useCalendarStore';
import { useDayStore } from '@/store/useDayStore';
import { todayKey, toMonthKey, weekKeys, yearLabel } from '@/utils/date';

/**
 * 日历页。
 *
 * 职责边界：本页只做「选月 / 选年 / 选天 / 展示摘要」，完成度的计算全部在
 * `calendarService` 里、取数全部在 `useCalendarStore` 里 —— 这样将来首页
 * 想加一个日历弹层时，复用 `MonthGrid` / `YearGrid` 与 store 即可，不需要搬页面逻辑。
 *
 * 两种进入方式，两种语义（由 `location.state.pickDateFrom` 区分）：
 * - **回看模式**（从底部 Tab 进来）：点一格更新下方摘要卡、**不跳页** —— 回看场景
 *   用户会连着点好几天比对，跳进详情页再退出就得重新找月份。
 * - **选日子模式**（从首页 / 任务页 / 时间轴的日期进来）：点一格即切换全局日期
 *   并自动回到来路。用户点这里的意图就是「换成那一天」，让他再按一次
 *   「当日」是多余的一步。
 *
 * 🔴 但**两种模式都写全局日期**（`useDayStore.setDate`）。
 * 曾经只有「选日子」才写，结果用户在日历里翻到 12 号看完摘要、切回今日页，
 * 今日页还停在今天 —— 「我在日历看的是 12 号」这件事完全没传到别的页面。
 * 现在点一格 = 全应用切到那一天，日历成了真正的全局日期入口。
 */
export function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // 来路。有值 = 本次是「选日子」，选完要回这里。
  const pickFrom =
    (location.state as { pickDateFrom?: string } | null)?.pickDateFrom ?? null;

  const view = useCalendarStore((s) => s.view);
  const monthKey = useCalendarStore((s) => s.monthKey);
  const yearKey = useCalendarStore((s) => s.yearKey);
  const weekStartKey = useCalendarStore((s) => s.weekStartKey);
  const selectedDate = useCalendarStore((s) => s.selectedDate);
  const summaries = useCalendarStore((s) => s.summaries);
  const weekSummaries = useCalendarStore((s) => s.weekSummaries);
  const weekItems = useCalendarStore((s) => s.weekItems);
  const weekSlots = useCalendarStore((s) => s.weekSlots);
  const yearDayDots = useCalendarStore((s) => s.yearDayDots);
  const monthDurations = useCalendarStore((s) => s.monthDurations);
  const monthTotalMinutes = useCalendarStore((s) => s.monthTotalMinutes);
  const weekDurations = useCalendarStore((s) => s.weekDurations);
  const weekTotalMinutes = useCalendarStore((s) => s.weekTotalMinutes);
  const loading = useCalendarStore((s) => s.loading);
  const setView = useCalendarStore((s) => s.setView);
  const loadMonth = useCalendarStore((s) => s.loadMonth);
  const shiftMonth = useCalendarStore((s) => s.shiftMonth);
  const shiftYear = useCalendarStore((s) => s.shiftYear);
  const shiftWeek = useCalendarStore((s) => s.shiftWeek);
  const selectDate = useCalendarStore((s) => s.selectDate);

  const initialized = useRef(false);

  // 首次进入：按当前查看日期所在月份加载，并优先选中「当前全局日期」
  // （从时间轴点日期进日历时落在同一天，而不是被拉回今天）
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void (async () => {
      const preferred = useDayStore.getState().date;
      const month = toMonthKey(preferred);
      await loadMonth(month);
      selectDate(resolveCalendarSelection(month, preferred, todayKey()));
    })();
  }, [loadMonth, selectDate]);

  // 摘要卡取数：周视图用 weekSummaries，月视图用 summaries（两者 key 都是日期键）
  const summarySource = view === 'week' ? weekSummaries : summaries;
  const summary = summarySource[selectedDate] ?? emptySummary(selectedDate);
  /** 周视图的 7 天（周一 → 周日） */
  const weekDays = useMemo(() => weekKeys(weekStartKey), [weekStartKey]);

  /**
   * 点一格：选中态与**全局日期**一起切（所有页面跟着走到这一天）；
   * 若本次是「选日子」，再自动回到来路。
   */
  const handleSelectDay = (dateKey: string) => {
    selectDate(dateKey);
    useDayStore.getState().setDate(dateKey);
    if (!pickFrom) return;
    navigate(pickFrom, { replace: true });
  };

  const handleGo = (target: 'today' | 'timeline' | 'tasks') => {
    // 先把全局日期切到选中日，再跳目标页 —— AppShell 会据此重新装载该日数据
    useDayStore.getState().setDate(selectedDate);
    navigate(target === 'today' ? '/today' : target === 'timeline' ? '/timeline' : '/tasks');
  };

  /**
   * 周任务总览里的两个跳转入口：先对齐全局日期到选中日（让目标页的「本周」
   * 与日历当前周一致），再带 `{ mode: 'week' }` 进入本周视图。
   * 今日页与时间轴页都认这个 state 来初始化周视图。
   */
  const handleGoWeek = (target: 'today' | 'timeline') => {
    useDayStore.getState().setDate(selectedDate);
    navigate(target === 'today' ? '/today' : '/timeline', { state: { mode: 'week' } });
  };

  const handleSelectMonth = (targetMonth: string) => {
    setView('month');
    void (async () => {
      await loadMonth(targetMonth);
      selectDate(resolveCalendarSelection(targetMonth, useDayStore.getState().date, todayKey()));
    })();
  };

  return (
    <div className="flex flex-col min-h-full pb-4">
      <PageHeader
        title="日历"
        onBack={pickFrom ? () => navigate(pickFrom, { replace: true }) : undefined}
        subtitle={
          loading
            ? '加载中…'
            : pickFrom
              ? '点一格即切换到那一天，并回到上一页'
              : view === 'year'
                ? '点月份看当月，可跨年回看'
                : view === 'week'
                  ? '点一格即切换到那一天，可跨周补记'
                  : '点一格即切换到那一天，可跨月补记'
        }
      />

      {/*
        overflow-x-clip 只包住「段控 + 视图面板」这一块，**不包页头** ——
        `m-zoom-in` 起始是 1.04 倍，头几帧会比视口宽约 8px，不裁住就会短暂出现
        横向滚动条（手机上还能横向拖动一下）。用 clip 而不是 hidden：
        clip 不创建滚动容器，也不会像 hidden 那样把祖先变成新的粘附参照。
      */}
      <div className="overflow-x-clip">
        {/*
          月 / 年 段控：滑块**滑过去**而不是跳过去（与底部 Tab 指示器同一手法）。
          两段等宽，所以位移量 = 一个段宽，不需要测量 —— 少一处 ResizeObserver
          就少一处能坏的地方。段宽写死 54px 是为了让「位移一个段宽」这个式子成立。
        */}
        <div className="flex items-center px-5 pt-1.5">
          <div className="relative inline-flex rounded-pill bg-surface-sunken p-[3px] text-body">
            {/*
              三段等宽，位移量 = 段宽 × 视图序号。周/月/年分别落在 0/54/108px，
              与月视图时期（两段）共用同一套「滑块滑过去」的手法。段宽写死 54px。
            */}
            <span
              aria-hidden
              className="absolute top-[3px] bottom-[3px] left-[3px] w-[54px] rounded-pill bg-surface shadow-card transition-transform duration-[var(--m-dur-3)] ease-[var(--m-ease-out)]"
              style={{ transform: `translateX(${(view === 'week' ? 0 : view === 'month' ? 1 : 2) * 54}px)` }}
            />
            {(
              [
                ['week', '周'],
                ['month', '月'],
                ['year', '年'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={clsx(
                  'relative z-10 w-[54px] py-1.5 rounded-pill transition-colors duration-[var(--m-dur-2)]',
                  view === key ? 'text-accent font-medium' : 'text-ink-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/*
          两个视图面板整块换 key → 每次切换都重新挂载并播一次进场动画。
          方向即语义：进**年**视图是视角拉远（一个月 → 一整年），
          进**月**视图是拉近（钻进那个月）。首屏也是 month，所以这一下同时也是页面入场。
        */}
        <div key={view} className={view === 'year' ? 'm-zoom-out' : view === 'week' ? 'm-fade' : 'm-zoom-in'}>
          {view === 'year' ? (
            <>
              <div className="flex items-center justify-between px-5 pt-2">
                <button
                  type="button"
                  onClick={() => void shiftYear(-1)}
                  className="press min-w-tap min-h-tap flex items-center justify-center text-ink-muted"
                  aria-label="上一年"
                >
                  <Icon name="chevron-left" size={22} />
                </button>
                <div className="text-title font-semibold text-ink tabular-nums">
                  {yearLabel(yearKey)}
                </div>
                <button
                  type="button"
                  onClick={() => void shiftYear(1)}
                  className="press min-w-tap min-h-tap flex items-center justify-center text-ink-muted"
                  aria-label="下一年"
                >
                  <Icon name="chevron-right" size={22} />
                </button>
              </div>

              <YearGrid
                yearKey={yearKey}
                yearDayDots={yearDayDots}
                activeMonthKey={monthKey}
                onSelectMonth={handleSelectMonth}
              />
            </>
          ) : view === 'week' ? (
            <>
              <WeekGrid
                weekStartKey={weekStartKey}
                weekDays={weekDays}
                summaries={weekSummaries}
                selectedDate={selectedDate}
                todayKey={todayKey()}
                onSelect={handleSelectDay}
                onShiftWeek={(delta) => void shiftWeek(delta)}
              />

              {/* 本周时长条：与月视图同族，数据来自时间轴 */}
              <DurationBar
                durations={weekDurations}
                total={weekTotalMinutes}
                title="本周时长"
                emptyHint="本周还没有归类到板块的时间段。到时间轴排一段时间并选板块，这里就会累计。"
              />

              {/* 本周任务总览：四板块完成度 + 跳转「今日 / 时间轴」的本周视图 */}
              <WeekTaskOverview
                items={weekItems}
                slots={weekSlots}
                weekDays={weekDays}
                onOpen={handleGoWeek}
              />

              <DaySummaryCard dateKey={selectedDate} summary={summary} onGo={handleGo} />
            </>
          ) : (
            <>
              <MonthGrid
                monthKey={monthKey}
                summaries={summaries}
                selectedDate={selectedDate}
                todayKey={todayKey()}
                onSelect={handleSelectDay}
                onShiftMonth={(delta) => void shiftMonth(delta)}
              />

              {/* 本月时长条：数据来自时间轴，只在月视图显示（年视图下「本月」没有意义） */}
              <DurationBar durations={monthDurations} total={monthTotalMinutes} />

              <DaySummaryCard dateKey={selectedDate} summary={summary} onGo={handleGo} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
