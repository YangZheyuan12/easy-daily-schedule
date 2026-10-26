import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDayStore } from '@/store/useDayStore';
import { useRangeStore } from '@/store/useRangeStore';
import { useItemStore } from '@/store/useItemStore';
import { useUiStore } from '@/store/useUiStore';
import { sectionColor } from '@/domain/constants';
import { useSectionConfig } from '@/hooks/useSectionConfigs';
import type { SectionKey } from '@/domain/enums';
import { DateNavigator, type DateViewMode } from '@/components/date/DateNavigator';
import { DatePickerModal } from '@/components/date/DatePickerModal';
import { SelfStatusCard } from '@/components/selfstatus/SelfStatusCard';
import { DiaryList } from '@/components/diary/DiaryList';
import { WeekSectionBoards } from '@/components/diary/WeekSectionBoards';
import { ReminderBanner } from '@/components/reminder/ReminderBanner';
import { ItemSheet } from '@/components/item/ItemSheet';
import { useDayFestivals } from '@/hooks/useDayFestivals';
import { buildWeekSectionBoards } from '@/services/weekViewService';
import { weekKeys, weekRangeShortLabel } from '@/utils/date';

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
  const location = useLocation();
  const date = useDayStore((s) => s.date);
  const shiftDate = useDayStore((s) => s.shiftDate);
  const setDate = useDayStore((s) => s.setDate);
  const goToday = useDayStore((s) => s.goToday);

  const rangeItems = useRangeStore((s) => s.items);
  const rangeSlots = useRangeStore((s) => s.slots);
  const loadRange = useRangeStore((s) => s.loadRange);

  /*
    条目详情抽屉（图片 / 描述 / 子分支 / 删除）—— 与板块页共用同一个 `ItemSheet`
    与同一条全局 drawer 状态：今日页行尾「⋯」点开的，就是板块页里那一张。
    板块页仍在（组头可进，看整棵树的视图），但编辑不再非去它不可。
  */
  const items = useItemStore((s) => s.items);
  const drawerItemId = useUiStore((s) => s.drawerItemId);
  const drawerItem = items.find((item) => item.id === drawerItemId) ?? null;
  const drawerConfig = useSectionConfig((drawerItem?.sectionId ?? 'work') as SectionKey);

  /**
   * 视图模式。正常情况下从底部 Tab 进来是「当日」；
   * 从板块周详情页按返回时带 `{ mode: 'week' }`，要回到**本周视图下的今日页**而非当日。
   */
  const [mode, setMode] = useState<DateViewMode>(
    location.state && (location.state as { mode?: string }).mode === 'week' ? 'week' : 'day',
  );

  /** 就地日期选择弹窗：点中间日期不再跳日历 Tab，而是原地弹出一个选日期的卡片 */
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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

  /** 田字格里点整个板块 → 进该板块的本周时间线详情页（带 mode，便于返回时回到本周视图） */
  const handleOpenSection = (key: SectionKey) => {
    navigate(`/week-section/${key}`, { state: { mode: 'week' } });
  };

  const weekStep = mode === 'week' ? 7 : 1;

  return (
    <div
      className={
        mode === 'week'
          ? 'flex flex-col h-[calc(100dvh-120px)] overflow-hidden'
          : 'pb-4'
      }
    >
      <DateNavigator
        date={date}
        subtitleText={mode === 'day' ? subtitleText || null : null}
        onPrev={() => shiftDate(-weekStep)}
        onNext={() => shiftDate(weekStep)}
        onToday={goToday}
        // 点中间日期 → 就地弹出日期选择卡片（不切 Tab，见 DatePickerModal）
        onDateClick={() => setDatePickerOpen(true)}
        viewMode={mode}
        onViewModeChange={setMode}
        centerLabel={mode === 'week' ? weekRangeShortLabel(date) : undefined}
      />

      {mode === 'day' ? (
        <>
          {/* 计划时间到了的提醒（仅当天，且只在当日视图 —— 周视图里它指的是哪一天说不清） */}
          <ReminderBanner />

          <div className="m-rise px-5 mt-2.5 space-y-4">
            {/* 自我状态（心情 + 身体）— 紧凑单行，点开再编辑 */}
            <SelfStatusCard date={date} />

            {/* 日记体统一列表（四板块 + 灵感） */}
            <DiaryList date={date} />
          </div>

          {/* 条目详情抽屉：今日页行尾「⋯」打开（与板块页同一张） */}
          <ItemSheet
            item={drawerItem}
            accent={sectionColor(drawerConfig)}
            sectionName={drawerConfig.name}
          />

          <DatePickerModal
            open={datePickerOpen}
            value={date}
            onSelect={(d) => setDate(d)}
            onClose={() => setDatePickerOpen(false)}
          />
        </>
      ) : (
        <>
          <p className="text-caption text-ink-faint px-5 mt-2 shrink-0">
            本周（{weekDays[0]} 起）四板块汇总。点板块进入该板块本周时间线；点某一天切到当日详情。
          </p>
          <div className="flex-1 min-h-0 mt-2.5 px-5">
            <WeekSectionBoards
              boards={boards}
              onSelectDay={handleSelectDay}
              onOpenSection={handleOpenSection}
            />
          </div>
        </>
      )}
    </div>
  );
}
