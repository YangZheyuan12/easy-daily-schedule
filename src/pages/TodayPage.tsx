import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDayStore } from '@/store/useDayStore';
import { useRangeStore } from '@/store/useRangeStore';
import { DateNavigator, type DateViewMode } from '@/components/date/DateNavigator';
import { SelfStatusCard } from '@/components/selfstatus/SelfStatusCard';
import { DiaryList } from '@/components/diary/DiaryList';
import { WeekSectionBoards } from '@/components/diary/WeekSectionBoards';
import { ReminderBanner } from '@/components/reminder/ReminderBanner';
import { useDayFestivals } from '@/hooks/useDayFestivals';
import { buildWeekSectionBoards } from '@/services/weekViewService';
import { weekKeys, weekRangeLabel } from '@/utils/date';

/**
 * 今日首页：顶部日期导航，接着是紧凑的自我状态（心情 + 身体），
 * 主体是日记体统一列表（四板块编号条目 + 灵感），底部可加时间段。
 *
 * 右上角可切到**本周**：四个板块各占一格的田字格，格内按天汇总本周内容
 * （见 `WeekSectionBoards`）。与日历页的「本月时长条」是同一族视图 ——
 * 都是把日维度的数据换个跨度重新聚合，不新增任何写入路径。
 */
export function TodayPage() {
  const navigate = useNavigate();
  const date = useDayStore((s) => s.date);
  const shiftDate = useDayStore((s) => s.shiftDate);
  const setDate = useDayStore((s) => s.setDate);
  const goToday = useDayStore((s) => s.goToday);

  const rangeItems = useRangeStore((s) => s.items);
  const rangeSlots = useRangeStore((s) => s.slots);
  const loadRange = useRangeStore((s) => s.loadRange);

  const [mode, setMode] = useState<DateViewMode>('day');

  // 日期下方的农历 / 节日行（如「九月初三 · 中秋节」）；无内容时为空串
  const { festivalLine, lunarLine } = useDayFestivals(date);
  const subtitleText = [lunarLine, festivalLine].filter(Boolean).join(' · ');

  const weekDays = useMemo(() => weekKeys(date), [date]);

  useEffect(() => {
    if (mode !== 'week') return;
    void loadRange(weekDays[0] ?? date, weekDays[6] ?? date);
  }, [mode, weekDays, date, loadRange]);

  const boards = useMemo(
    () => buildWeekSectionBoards(rangeItems, rangeSlots, weekDays),
    [rangeItems, rangeSlots, weekDays],
  );

  /** 田字格里点某一天 → 切到那一天并回到当日视图（看的是那天的详情） */
  const handleSelectDay = (dateKey: string) => {
    setDate(dateKey);
    setMode('day');
  };

  const weekStep = mode === 'week' ? 7 : 1;

  return (
    <div className="pb-4">
      <DateNavigator
        date={date}
        subtitleText={mode === 'day' ? subtitleText || null : null}
        onPrev={() => shiftDate(-weekStep)}
        onNext={() => shiftDate(weekStep)}
        onToday={goToday}
        // 点中间日期 → 去日历选日子（选完自动回到本页）
        onDateClick={() => navigate('/calendar', { state: { pickDateFrom: '/today' } })}
        viewMode={mode}
        onViewModeChange={setMode}
        centerLabel={mode === 'week' ? weekRangeLabel(date) : undefined}
      />

      {/* 计划时间到了的提醒（仅当天，且只在当日视图 —— 周视图里它指的是哪一天说不清） */}
      {mode === 'day' && <ReminderBanner />}

      <div className="m-rise px-5 mt-2.5 space-y-4">
        {mode === 'week' ? (
          <>
            <p className="text-caption text-ink-faint">
              本周（{weekDays[0]} 起）四板块汇总。点某一天可以切过去看当日详情。
            </p>
            <WeekSectionBoards boards={boards} onSelectDay={handleSelectDay} />
          </>
        ) : (
          <>
            {/* 自我状态（心情 + 身体）— 紧凑单行，点开再编辑 */}
            <SelfStatusCard date={date} />

            {/* 日记体统一列表（四板块 + 灵感） */}
            <DiaryList date={date} />
          </>
        )}
      </div>
    </div>
  );
}
