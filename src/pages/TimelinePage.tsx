import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { sectionColor, sectionTint } from '@/domain/constants';
import { useSectionConfigs } from '@/hooks/useSectionConfigs';
import type { TimeSlot } from '@/domain/types';
import { useDayStore } from '@/store/useDayStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useRangeStore } from '@/store/useRangeStore';
import { useItemStore } from '@/store/useItemStore';
import { useUiStore } from '@/store/useUiStore';
import { Icon } from '@/components/ui/Icon';
import { SyncCheck } from '@/components/ui/SyncCheck';
import { DateNavigator, type DateViewMode } from '@/components/date/DateNavigator';
import { DatePickerModal } from '@/components/date/DatePickerModal';
import { ReminderBanner } from '@/components/reminder/ReminderBanner';
import { WeekTimetable } from '@/components/timeline/WeekTimetable';
import {
  EMPTY_FORM,
  SlotEditorSheet,
  type SlotForm,
} from '@/components/timeline/SlotEditorSheet';
import { listDueSlots } from '@/services/reminderService';
import { buildWeekTimetable } from '@/services/weekViewService';
import { collectSyncedSlotIds, planSlotSync } from '@/services/slotSyncService';
import type { SlotSyncPlan } from '@/services/slotSyncService';
import { useTimelineWindowStore } from '@/store/useTimelineWindowStore';
import { useNowMin } from '@/hooks/useNowMin';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';
import { useKeyboardVisible, KEYBOARD_HIDDEN_CLASS } from '@/hooks/useKeyboardVisible';
import { staggerDelay } from '@/utils/motion';
import { describeSyncCounts, syncButtonLabel } from '@/utils/syncMessage';
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
  /** 就地日期选择弹窗：点日期不再跳日历 Tab，而是原地弹出选日期卡片 */
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const slots = useTimeSlotStore((s) => s.slots);
  const addSlot = useTimeSlotStore((s) => s.addSlot);
  const updateSlot = useTimeSlotStore((s) => s.updateSlot);
  const toggleDone = useTimeSlotStore((s) => s.toggleDone);
  const removeSlot = useTimeSlotStore((s) => s.removeSlot);
  const pushToast = useUiStore((s) => s.pushToast);

  // 键盘弹起 → 底部操作栏收下去（与 Tab 胶囊同一机制）
  const keyboardVisible = useKeyboardVisible();

  const rangeSlots = useRangeStore((s) => s.slots);
  const loadRange = useRangeStore((s) => s.loadRange);

  /*
    「同步到今日」的勾选模式 —— **勾选即对齐**（2026-10-20 改）。

    已同步过的时间段（今日页存在**存活**的 `sourceSlotId` 指向它的条目）进入勾选模式时
    **默认勾上**：再确认一次是「把今日页那条更新成时间轴现在的样子」，而不是堆出第二条。
    可以取消勾选 —— 那只是「这一轮不碰它」，不会删掉今日页的条目。
    （今日页那条被删掉后，这里默认不再勾，可以重新同步一次。）

    🔴 去重要靠同一套 `sourceSlotId` 标记，而且**今日页的只读投影也必须排除掉这些时段**
    （见 `diaryService` / `calendarService` 里的 `collectSyncedSlotIds`），
    否则一条时段会同时作为「投影」和「条目」各占一个编号。
  */
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const items = useItemStore((s) => s.items);
  const syncFromSlots = useItemStore((s) => s.syncFromSlots);
  const syncedSlotIds = useMemo(() => collectSyncedSlotIds(items), [items]);

  // 时间块上的板块标签取用户自定义后的配置（改名 / 改色都跟着变）
  const sectionConfigs = useSectionConfigs();

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
  /*
    真实的「今天」（用于周视图里高亮今天那一列）。
    🔴 不能用空依赖数组的 useMemo —— 那样它算一次就永不过期，跨零点后周视图会
    高亮错一天（App 挂在后台一整夜再切回来就是这种情况）。取一次日期键开销极小，
    每次渲染重算即可。
  */
  const todayDateKey = todayKey();

  // 时间轴周视图的时间窗（起始 / 结束 / 分割线间隔）来自用户设置，默认 06:00–24:00 / 2 小时
  const windowSettings = useTimelineWindowStore((s) => s.settings);

  useEffect(() => {
    if (mode !== 'week') return;
    /*
      🔴 force=true：日视图里给时间段「分组 / 勾选 / 改内容」后切回周视图，必须重新从仓储读取。
      否则 `useRangeStore` 按周区间缓存的旧快照不会刷新 —— 在日视图分好的组，
      周视图里仍是未分组的中性块（用户反馈的「日视图分了组无法同步到周视图」）。
      把 `slots`（日维度 store）也纳入依赖：周视图里通过同一张抽屉改了某天的时间段，
      这里会立刻重新拉取整周，完成态 / 分组随之同步。
    */
    void loadRange(weekDays[0] ?? date, weekDays[6] ?? date, true);
  }, [mode, weekDays, date, slots, loadRange]);

  const weekCells = useMemo(
    () => buildWeekTimetable(rangeSlots, weekDays, windowSettings),
    [rangeSlots, weekDays, windowSettings],
  );

  // 软删的时间段不渲染（删除即隐藏，与 AppShell 的 loadDate 过滤口径一致）
  const visibleSlots = slots.filter((slot) => slot.deletedAt === null);
  // 已到计划时间且未完成的（用于行高亮；看非今天时 nowMin 无意义，高亮自然不触发）
  const dueIds = new Set(listDueSlots(visibleSlots, nowMin).map((slot) => slot.id));

  /*
    逐行错峰的入场动画**只在首次进入这一页时播**。
    切日期后所有行的 key（slot.id）都会变、整列表重挂，若照样按 index 给
    animationDelay，就会看到「下面的行先各自错开 10px 再慢慢归位」——这正是用户
    描述的「切到别的日期，排版就乱」（2026-10-17）。首屏保留错峰（那是刻意的呼吸感），
    之后换日期一律统一延迟，整 list 一起淡上来，看着就是「换了一天」而不是「重排了」。
  */
  const staggerRef = useRef(true);
  useEffect(() => {
    staggerRef.current = false;
  }, []);
  const rowDelay = (index: number) => (staggerRef.current ? staggerDelay(index) : undefined);

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

  /** 进入勾选模式（周视图里格子太小不好勾，先回到当日视图） */
  const startSelecting = () => {
    if (mode === 'week') setMode('day');
    // 已同步过的默认勾上：再确认一次 = 更新今日页那条，而不是再建一条
    setChecked(new Set(syncedSlotIds));
    setSelecting(true);
  };

  const toggleChecked = (slotId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  /** 勾选 → 计划的纯函数（组件只负责「用户勾了谁」） */
  const currentPlan = (): SlotSyncPlan => {
    const selected = visibleSlots.filter((slot) => checked.has(slot.id));
    return planSlotSync(selected, items, date);
  };

  const confirmSync = () => {
    const plan = currentPlan();
    const { created, updated } = syncFromSlots(plan);
    pushToast(describeSyncCounts(created, updated));
    setSelecting(false);
    setChecked(new Set());
  };

  /** 底部按钮的计数：新建 / 更新分别多少（确认前就能看见这次会动什么） */
  const planCounts = useMemo(() => {
    // 一项都没勾 → null：按钮回到中性文案「同步到今日」，而不是「今日页已是最新」
    if (!selecting || checked.size === 0) return null;
    const selected = visibleSlots.filter((slot) => checked.has(slot.id));
    const plan = planSlotSync(selected, items, date);
    return {
      create: plan.create.length,
      update: plan.update.length,
      total: plan.create.length + plan.update.length,
    };
  }, [selecting, checked, visibleSlots, items, date]);

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
        onDateClick={() => setDatePickerOpen(true)}
        viewMode={mode}
        onViewModeChange={setMode}
        centerLabel={mode === 'week' ? weekRangeShortLabel(date) : undefined}
      />

      {mode === 'day' && <ReminderBanner />}

      {/*
        顶部右侧两个入口：「同步到今日」（把勾选的时间段复制成今日页条目）
        与「导入课表」（课程是「每周重复」的，从周视图进最自然，但日视图也留一个）。
        勾选模式下这一行让位给一行说明 —— 两个入口此刻都不该被点到。
      */}
      <div className="px-5 mt-2">
        {selecting ? (
          <p className="text-caption leading-5 text-ink-faint">
            勾选要同步到今日的事件。
            <span className="text-ink-muted">未分组的时间段不能同步</span>
            （今日页的条目必须落在某个板块下）；
            <span className="text-ink-muted">已经同步的默认勾上</span>
            ，确认后会把今日页那条更新成时间轴现在的样子。
          </p>
        ) : (
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={startSelecting}
              data-testid="timeline-sync-button"
              className="press inline-flex items-center gap-1.5 text-caption text-accent active:opacity-60"
            >
              <Icon name="task" size={13} />
              同步到今日
            </button>
            <button
              type="button"
              onClick={() => navigate('/timetable/import')}
              className="press inline-flex items-center gap-1.5 text-caption text-accent active:opacity-60"
            >
              <Icon name="sync" size={13} />
              导入课表
            </button>
          </div>
        )}
      </div>

      <div className={clsx('px-5', mode === 'day' ? 'mt-3' : 'mt-2')} data-no-swipe>
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
              const config = slot.sectionId
                ? (sectionConfigs.find((cfg) => cfg.key === slot.sectionId) ?? null)
                : null;
              // 勾选模式：没归板块的不能同步（没有落点）；已同步的默认勾上且可取消
              const synced = syncedSlotIds.has(slot.id);
              const selectable = slot.sectionId !== null;
              const isChecked = checked.has(slot.id);
              return (
                <li
                  key={slot.id}
                  className="m-rise flex gap-2.5"
                  style={{ animationDelay: rowDelay(index) }}
                >
                  {/* 勾选模式的勾选框：行首多出的一列（退出勾选后整列消失，不错位） */}
                  {selecting && (
                    <SyncCheck
                      checked={isChecked}
                      disabled={!selectable}
                      title={!selectable ? '未分组的时间段不能同步' : undefined}
                      onToggle={() => toggleChecked(slot.id)}
                    />
                  )}

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

                  {/* 时间块卡片。勾选模式下点卡片 = 勾选 / 取消勾选（编辑先退出勾选） */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!selecting) {
                        openEdit(slot);
                        return;
                      }
                      if (selectable) toggleChecked(slot.id);
                    }}
                    className={clsx(
                      'press flex-1 min-w-0 text-left my-2 rounded-sm px-3.5 py-3',
                      selecting && isChecked
                        ? 'bg-accent-soft border border-accent'
                        : dueIds.has(slot.id)
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
                    {(config || synced || slot.actualStartMin !== null) && (
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {/* 已同步到今日的标记：平时就能看见「这条已经在今日清单里了」 */}
                        {synced && (
                          <span className="text-caption px-1.5 py-0.5 rounded-pill inline-flex items-center gap-1 bg-accent-soft text-accent">
                            <Icon name="check" size={9} strokeWidth={3} />
                            已同步
                          </span>
                        )}
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

      {/*
        主操作固定在 Tab Bar 之上，滚动时始终可达。
        勾选模式下这一格换成「取消 + 同步 N 项」—— 添加时间段此刻不该被误点。
        键盘弹起时整栏收下去：fixed 在 adjustResize 下会被键盘顶上来。
      */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-[100px] flex justify-center px-5 pointer-events-none',
          'transition-opacity duration-150 ease-[var(--m-ease-out)]',
          keyboardVisible && KEYBOARD_HIDDEN_CLASS,
        )}
        aria-hidden={keyboardVisible}
      >
        <div className="w-full max-w-[430px] pointer-events-auto flex gap-2">
          {selecting ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelecting(false);
                  setChecked(new Set());
                }}
                className="press flex-1 min-h-[46px] rounded-pill border border-surface-line bg-surface text-body text-ink-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmSync}
                disabled={
                  checked.size === 0 ||
                  planCounts === null ||
                  planCounts.create + planCounts.update === 0
                }
                data-testid="timeline-sync-confirm"
                className="press flex-[2] min-h-[46px] rounded-pill bg-accent text-lead text-accent-fg disabled:opacity-50"
              >
                {syncButtonLabel(planCounts)}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openAdd()}
              className="press w-full min-h-[46px] rounded-pill bg-accent text-accent-fg text-lead"
            >
              + 添加时间段
            </button>
          )}
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

      <DatePickerModal
        open={datePickerOpen}
        value={date}
        onSelect={(d) => setDate(d)}
        onClose={() => setDatePickerOpen(false)}
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
