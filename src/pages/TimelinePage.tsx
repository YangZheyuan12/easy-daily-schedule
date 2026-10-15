import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { SECTION_CONFIG_MAP, sectionColor, sectionTint } from '@/domain/constants';
import type { TimeSlot } from '@/domain/types';
import { useDayStore } from '@/store/useDayStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useRangeStore } from '@/store/useRangeStore';
import { useUiStore } from '@/store/useUiStore';
import { DateNavigator, type DateViewMode } from '@/components/date/DateNavigator';
import { ReminderBanner } from '@/components/reminder/ReminderBanner';
import { WeekTimetable } from '@/components/timeline/WeekTimetable';
import {
  EMPTY_FORM,
  SlotEditorSheet,
  type SlotForm,
} from '@/components/timeline/SlotEditorSheet';
import { listDueSlots } from '@/services/reminderService';
import { buildWeekTimetable } from '@/services/weekViewService';
import { useTimelineWindowStore } from '@/store/useTimelineWindowStore';
import { useNowMin } from '@/hooks/useNowMin';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';
import { staggerDelay } from '@/utils/motion';
import {
  formatShortDate,
  formatTimeRange,
  todayKey,
  weekKeys,
  weekRangeShortLabel,
} from '@/utils/date';

/**
 * 时间轴页面：按天编排时间段，tap 勾选完成、点行编辑 / 删除；
 * 右上角可切到**本周**（课程表视图，见 `WeekTimetable`）。
 *
 * 🔴 周视图里的编辑**不新建一套写逻辑**：点某个块 / 某个空格先 `setDate(那天)`，
 * 再打开同一个抽屉。于是增删改走的还是日维度的 `useTimeSlotStore`，
 * 不存在「这条记录到底属于哪个作用域」的歧义，撤销语义也保持单一。
 * 代价是点一下会切全局日期 —— 但这恰恰符合「看周表、点进去改那天」的直觉。
 */
export function TimelinePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const date = useDayStore((s) => s.date);
  const shiftDate = useDayStore((s) => s.shiftDate);
  const setDate = useDayStore((s) => s.setDate);
  const goToday = useDayStore((s) => s.goToday);
  const slots = useTimeSlotStore((s) => s.slots);
  const addSlot = useTimeSlotStore((s) => s.addSlot);
  const updateSlot = useTimeSlotStore((s) => s.updateSlot);
  const toggleDone = useTimeSlotStore((s) => s.toggleDone);
  const removeSlot = useTimeSlotStore((s) => s.removeSlot);
  const pushToast = useUiStore((s) => s.pushToast);

  const rangeSlots = useRangeStore((s) => s.slots);
  const loadRange = useRangeStore((s) => s.loadRange);

  /*
    视图模式。正常从底部 Tab 进来是「当日」；
    从日历「周任务总览」跳入时带 `{ mode: 'week' }`，要直接呈本周课程表，
    且用跳转前对齐好的全局日期作为本周定位。
  */
  const [mode, setMode] = useState<DateViewMode>(
    location.state && (location.state as { mode?: string }).mode === 'week' ? 'week' : 'day',
  );
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM);
  const nowMin = useNowMin();

  const weekDays = useMemo(() => weekKeys(date), [date]);
  /** 真实的「今天」（用于周视图里高亮今天那一列） */
  const todayDateKey = useMemo(() => todayKey(), []);

  // 时间轴周视图的时间窗（起始 / 结束 / 分割线间隔）来自用户设置，默认 06:00–24:00 / 2 小时
  const windowSettings = useTimelineWindowStore((s) => s.settings);

  useEffect(() => {
    if (mode !== 'week') return;
    void loadRange(weekDays[0] ?? date, weekDays[6] ?? date);
  }, [mode, weekDays, date, loadRange]);

  const weekCells = useMemo(
    () => buildWeekTimetable(rangeSlots, weekDays, windowSettings),
    [rangeSlots, weekDays, windowSettings],
  );

  // 软删的时间段不渲染（删除即隐藏，与 AppShell 的 loadDate 过滤口径一致）
  const visibleSlots = slots.filter((slot) => slot.deletedAt === null);
  // 已到计划时间且未完成的（用于行高亮；看非今天时 nowMin 无意义，高亮自然不触发）
  const dueIds = new Set(listDueSlots(visibleSlots, nowMin).map((slot) => slot.id));

  const openAdd = (startMin: number = EMPTY_FORM.startMin) => {
    setForm({ ...EMPTY_FORM, startMin });
    setFormOpen(true);
  };

  const openEdit = (slot: TimeSlot) => {
    setForm({
      id: slot.id,
      startMin: slot.startMin,
      endMin: slot.endMin,
      actualStartMin: slot.actualStartMin,
      actualEndMin: slot.actualEndMin,
      content: slot.content,
      sectionId: slot.sectionId,
    });
    setFormOpen(true);
  };

  /** 周视图点块：切到那一天再编辑（抽屉里会显示所属日期，避免点错列） */
  const handleWeekSelectSlot = (slot: TimeSlot) => {
    if (slot.date !== date) setDate(slot.date);
    openEdit(slot);
  };

  /** 周视图点空格：切到那一天，预填该整点为开始时间 */
  const handleWeekSelectEmpty = (dateKey: string, startMin: number) => {
    if (dateKey !== date) setDate(dateKey);
    openAdd(startMin);
  };

  const handleSave = () => {
    // 保存按钮在内容为空时是禁用的，这里是第二道闸（快捷键 / 程序化调用也拦得住）
    if (form.content.trim().length === 0) return;
    if (form.id) {
      updateSlot(form.id, {
        startMin: form.startMin,
        endMin: form.endMin,
        actualStartMin: form.actualStartMin,
        actualEndMin: form.actualEndMin,
        content: form.content.trim(),
        sectionId: form.sectionId,
      });
      pushToast('已保存');
    } else {
      addSlot({
        date,
        startMin: form.startMin,
        endMin: form.endMin,
        content: form.content.trim(),
        sectionId: form.sectionId,
      });
    }
    setFormOpen(false);
  };

  const handleDelete = () => {
    if (form.id) removeSlot(form.id);
    setFormOpen(false);
  };

  const weekStep = mode === 'week' ? 7 : 1;

  return (
    <div className="flex flex-col min-h-full pb-28">
      {/* 概念稿 C3：这一屏直接以日期导航开场，不放页面大标题 */}
      <DateNavigator
        date={date}
        onPrev={() => shiftDate(-weekStep)}
        onNext={() => shiftDate(weekStep)}
        onToday={goToday}
        onDateClick={() => navigate('/calendar', { state: { pickDateFrom: '/timeline' } })}
        viewMode={mode}
        onViewModeChange={setMode}
        centerLabel={mode === 'week' ? weekRangeShortLabel(date) : undefined}
      />

      {mode === 'day' && <ReminderBanner />}

      <div className={clsx('px-5', mode === 'day' ? 'mt-3' : 'mt-2')}>
        {mode === 'week' ? (
          <>
            {weekCells.length === 0 && (
              <p className="mb-2 text-caption text-ink-faint">
                本周还没有排时间段。点任意空格就能直接加到那一天。
              </p>
            )}
            <WeekTimetable
              weekDays={weekDays}
              cells={weekCells}
              todayKey={todayDateKey}
              timeWindow={windowSettings}
              tickStepHours={windowSettings.tickHours}
              onSelectSlot={handleWeekSelectSlot}
              onSelectEmpty={handleWeekSelectEmpty}
            />
          </>
        ) : visibleSlots.length === 0 ? (
          <div className="rounded-card bg-surface border border-surface-line p-6 text-center text-body text-ink-faint">
            还没有排时间段，点下面「添加时间段」开始规划。
          </div>
        ) : (
          /* 概念稿 C2：轴式布局 —— 左侧计划时间列 + 中轴节点/连线 + 右侧时间块卡片 */
          <ul>
            {visibleSlots.map((slot, index) => {
              const config = slot.sectionId ? SECTION_CONFIG_MAP[slot.sectionId] : null;
              return (
                <li
                  key={slot.id}
                  className="m-rise flex gap-2.5"
                  style={{ animationDelay: staggerDelay(index) }}
                >
                  {/* 计划时间列。宽度 100px 是为了 14px 下的「09:00–10:00」不会折行 */}
                  <span
                    className={clsx(
                      'w-[100px] shrink-0 pt-4 text-meta leading-5 text-right tabular-nums',
                      slot.done ? 'text-ink-faint' : 'text-ink-soft',
                    )}
                  >
                    {formatTimeRange(slot.startMin, slot.endMin)}
                  </span>

                  {/* 中轴：节点（完成=实心）+ 贯穿连线 */}
                  <AxisNode done={slot.done} onToggle={() => toggleDone(slot.id)} />

                  {/* 时间块卡片 */}
                  <button
                    type="button"
                    onClick={() => openEdit(slot)}
                    className={clsx(
                      'press flex-1 min-w-0 text-left my-2 rounded-sm px-3.5 py-3',
                      dueIds.has(slot.id)
                        ? 'bg-orange-50'
                        : slot.done
                          ? 'bg-surface-sunken'
                          : 'bg-surface border border-surface-line shadow-card',
                    )}
                  >
                    <div
                      className={clsx(
                        'text-lead leading-6 truncate',
                        slot.done ? 'text-ink-faint' : 'text-ink',
                      )}
                    >
                      <span className="m-strike" data-done={slot.done}>
                        {slot.content || '未命名时间段'}
                      </span>
                    </div>
                    {(config || slot.actualStartMin !== null) && (
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {config && (
                          <span
                            className="text-caption px-1.5 py-0.5 rounded-pill inline-flex items-center gap-1.5"
                            style={{
                              backgroundColor: sectionTint(config),
                              color: sectionColor(config),
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: sectionColor(config) }}
                            />
                            {config.name}
                          </span>
                        )}
                        {slot.actualStartMin !== null && (
                          <span className="text-caption text-ink-faint tabular-nums">
                            实际 {formatTimeRange(slot.actualStartMin, slot.actualEndMin ?? 0)}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 主操作固定在 Tab Bar 之上，滚动时始终可达 */}
      <div className="fixed inset-x-0 bottom-[100px] flex justify-center px-5 pointer-events-none">
        <div className="w-full max-w-[430px] pointer-events-auto">
          <button
            type="button"
            onClick={() => openAdd()}
            className="press w-full min-h-[46px] rounded-pill bg-accent text-accent-fg text-lead"
          >
            + 添加时间段
          </button>
        </div>
      </div>

      <SlotEditorSheet
        open={formOpen}
        form={form}
        isEditing={Boolean(form.id)}
        onChange={setForm}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setFormOpen(false)}
        dateLabel={mode === 'week' ? formatShortDate(date) : undefined}
      />
    </div>
  );
}

/**
 * 轴上的节点：完成 = 实心重音，未完成 = 空心。
 * 切换时弹一下（和其他勾选框同一套微反馈），否则这颗 8px 的点是「变」还是「没变」很难察觉。
 */
function AxisNode({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  const popped = useRecentlyChanged(done);

  return (
    <div className="relative w-5 shrink-0 flex flex-col items-center">
      <span className="absolute top-0 bottom-0 w-0.5 bg-surface-line" aria-hidden />
      <button
        type="button"
        onClick={onToggle}
        className="relative min-h-[40px] w-full flex items-start justify-center pt-[18px]"
        aria-label={done ? '标记为未完成' : '标记为已完成'}
      >
        <span
          className={clsx(
            'w-2 h-2 rounded-pill transition-colors',
            done ? 'bg-accent' : 'border-[1.5px] border-edge-strong bg-app',
            popped && 'm-pop-soft',
          )}
        />
      </button>
    </div>
  );
}
