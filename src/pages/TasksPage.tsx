import { Icon } from '@/components/ui/Icon';
import { useMemo, useState, useCallback } from 'react';
import clsx from 'clsx';
import { isDailyTask } from '@/domain/enums';
import { compareByOrder, isSyncableSection } from '@/domain/constants';
import type { Task } from '@/domain/types';
import { useTaskStore } from '@/store/useTaskStore';
import { useItemStore } from '@/store/useItemStore';
import { useDayStore } from '@/store/useDayStore';
import { useUiStore } from '@/store/useUiStore';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { TaskRow } from '@/components/task/TaskRow';
import { DateNavigator } from '@/components/date/DateNavigator';
import { DatePickerModal } from '@/components/date/DatePickerModal';
import { useDragSort } from '@/hooks/useDragSort';
import { DeadlineCard } from '@/components/task/DeadlineCard';
import { GoalCard } from '@/components/task/GoalCard';
import { EmptyState } from '@/components/feedback/EmptyState';
import { computeTaskProgress, toPercent } from '@/services/progressService';
import { collectSyncedTaskIds, planTaskSync } from '@/services/taskSyncService';
import { isPinProjection, isActivelyPinned } from '@/services/pinProjectionService';
import { useDayFestivals } from '@/hooks/useDayFestivals';
import { formatShortDate, isToday } from '@/utils/date';
import { describeSyncCounts, syncButtonLabel } from '@/utils/syncMessage';
import { useKeyboardVisible, KEYBOARD_HIDDEN_CLASS } from '@/hooks/useKeyboardVisible';

/**
 * 每日任务页：**单一列表平铺**，支持一键继承昨日未完成，
 * 以及把四大板块的任务**同步到今日页**（R-043）。
 *
 * 🔴 分组**不是**分段容器，只是每条任务的一个属性（行首的色点）。
 * 试过按五大分组分段渲染，结果是：空组要处理、跨组换位语义崩坏（按「下移」
 * 这一行会跳到另一个分组里，看起来像消失又出现在别处），而用户真正想要的
 * 只是「写这条任务时能顺手标一下它属于哪块」。所以列表退回平铺，
 * 分组退化成一个随时可改的标记 —— 名次与分组互不干涉。
 */
export function TasksPage() {
  const date = useDayStore((s) => s.date);
  const setDate = useDayStore((s) => s.setDate);
  const shiftDate = useDayStore((s) => s.shiftDate);
  const goToday = useDayStore((s) => s.goToday);
  const tasks = useTaskStore((s) => s.tasks);
  const add = useTaskStore((s) => s.add);
  const setSection = useTaskStore((s) => s.setSection);
  const inherit = useTaskStore((s) => s.inheritFromYesterday);
  const reorderIds = useTaskStore((s) => s.reorderIds);
  const pin = useTaskStore((s) => s.pin);
  const unpin = useTaskStore((s) => s.unpin);
  const pushToast = useUiStore((s) => s.pushToast);

  const [focusId, setFocusId] = useState<string | null>(null);
  /** 正在改分组的任务 id（气泡由那一行自己挂，页面只记「哪一行开着」） */
  const [pickingId, setPickingId] = useState<string | null>(null);
  /** 点了「定住」按钮、正在等确认的任务 id（确认框只在有值时打开） */
  const [pinConfirmId, setPinConfirmId] = useState<string | null>(null);

  /*
    「同步到今日」的勾选模式（2026-10-20 改，与时间轴页同构）。

    原来是「一键同步四大板块全部任务」+ 确认弹框：用户想只放两件进去时，
    只能先全同步再手动删。现在改成**勾选制**：
    - 只有**已分组（非「其他」）且有内容**的任务能勾 —— 没分组的在今日页没有落点，
      空内容的只会建成一排「未命名条目」；
    - 已经同步过的**默认勾上**：再确认一次 = 更新今日页那条，而不是堆出第二条；
    - 可以取消勾选 —— 那只是「这一轮不碰它」，不删今日页的条目。
  */
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const items = useItemStore((s) => s.items);
  const syncFromTasks = useItemStore((s) => s.syncFromTasks);
  const syncedTaskIds = useMemo(() => collectSyncedTaskIds(items), [items]);

  /** 就地日期选择弹窗：点日期不再跳日历 Tab（见 DatePickerModal） */
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // 键盘弹起 → 底部「+ 添加任务」收下去（与 Tab 胶囊同一机制）
  const keyboardVisible = useKeyboardVisible();

  /*
    展示顺序**由 `order` 派生**，不是数组位置 —— 与板块树（buildTree 按 order 排子节点）同一套约定。
    原来直接 `tasks.filter()` 就用数组顺序渲染，于是 `move()` 把 order 换好了、
    页面上却纹丝不动（要重新加载才「突然生效」）。现在换位与撤销都自动正确。

    这里只挑「每日任务」渲染（期限任务 / 长时目标是跨日期持久存在的，
    归到下方两张独立卡片，完成度与同步都只算每日任务）。
  */
  const dailyAlive = useMemo(
    () => tasks.filter((t) => isDailyTask(t) && t.deletedAt === null).sort(compareByOrder),
    [tasks],
  );
  const progress = useMemo(() => computeTaskProgress(dailyAlive), [dailyAlive]);
  /** 点了「定住」按钮、正在等确认的任务（确认框只在有值时打开） */
  const pinConfirmTask = pinConfirmId ? dailyAlive.find((t) => t.id === pinConfirmId) : undefined;

  // 日期下方的农历 / 节日行（与今日页一致）
  const { festivalLine, lunarLine } = useDayFestivals(date);
  const subtitleText = [lunarLine, festivalLine].filter(Boolean).join(' · ');

  /*
    拖拽排序。
    气泡归一地落在 `order` 字段上 —— 与「继承」「同步」共用同一套坐标系，
    所以拖完 hydrate 一次再由 order 派生渲染顺序，不用手工搬运数组。
  */
  const dailyIds = useMemo(() => dailyAlive.map((t) => t.id), [dailyAlive]);
  const handleReorder = useCallback(
    (from: number, to: number) => {
      const next = [...dailyIds];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return;
      next.splice(to, 0, moved);
      reorderIds(next);
    },
    [dailyIds, reorderIds],
  );
  const drag = useDragSort({ ids: dailyIds, onReorder: handleReorder });

  const handleInherit = async () => {
    const { created, skipped } = await inherit(date);
    if (created === 0) {
      pushToast(skipped > 0 ? '昨日未完成的任务都已经在这里了' : '昨天没有未完成的任务');
      return;
    }
    pushToast(`已继承 ${created} 项未完成任务`);
  };

  /**
   * 这条任务能不能同步：必须**已分组（非「其他」）且写了内容**，
   * 且不是「定住投影」（定住任务每天自动重复，其 date 是定住当天而非今天，
   * 无法同步到今日页，故显式排除，避免计数与实际同步不符）。
   */
  const isSyncable = (task: Task) =>
    isSyncableSection(task.sectionId) &&
    task.content.trim().length > 0 &&
    !isPinProjection(task, date);

  const syncableCount = useMemo(() => dailyAlive.filter(isSyncable).length, [dailyAlive]);

  /** 进入勾选模式（已同步过的默认勾上：再确认一次 = 更新今日页那条） */
  const startSelecting = () => {
    if (syncableCount === 0) {
      pushToast(
        dailyAlive.length === 0
          ? '还没有任务可以同步'
          : '还没有已分组、且写了内容的任务可以同步',
      );
      return;
    }
    setChecked(
      new Set(
        dailyAlive.filter((task) => syncedTaskIds.has(task.id) && isSyncable(task)).map((t) => t.id),
      ),
    );
    setSelecting(true);
  };

  const toggleChecked = (taskId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  /** 本次勾选到的任务（每次都现算，不用 state 缓存，避免拿到过期数据） */
  const selectedTasks = useMemo(
    () => (selecting ? dailyAlive.filter((task) => checked.has(task.id)) : []),
    [selecting, checked, dailyAlive],
  );

  /** 底部按钮的计数：新建 / 更新分别多少（确认前就能看见这次会动什么） */
  const planCounts = useMemo(() => {
    if (!selecting) return null;
    const plan = planTaskSync(selectedTasks, items, date);
    return { create: plan.create.length, update: plan.update.length };
  }, [selecting, selectedTasks, items, date]);

  const confirmSync = () => {
    const plan = planTaskSync(selectedTasks, items, date);
    const { created, updated } = syncFromTasks(plan);
    pushToast(describeSyncCounts(created, updated));
    setSelecting(false);
    setChecked(new Set());
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* 表头改用与今日 / 时间轴一致的日期导航（2026-10-26 改）：
          左右箭头切日子、点中间日期弹出选日期卡片、看非今天时右上角给「回到今天」。 */}
      <DateNavigator
        date={date}
        subtitleText={subtitleText || null}
        onPrev={() => shiftDate(-1)}
        onNext={() => shiftDate(1)}
        onToday={goToday}
        onDateClick={() => setDatePickerOpen(true)}
      />

      <div className="m-rise px-5 mt-1">
        {/* 进度条：粗实心条（概念稿 C2），不要描边。宽度用动效而非瞬变 —— 勾一条就能看见它前进 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-[6px] rounded-pill bg-surface-sunken overflow-hidden">
            <div
              className="h-full bg-accent rounded-pill transition-[width] duration-[var(--m-dur-3)] ease-[var(--m-ease-out)]"
              style={{ width: `${toPercent(progress.ratio)}%` }}
            />
          </div>
          <span className="shrink-0 text-caption text-ink-faint tabular-nums">
            完成 {progress.done}/{progress.total}
          </span>
        </div>

        {/* 两个批量操作并排：继承昨日（拉进来）与同步到今日（推过去）。
            勾选模式下这一行让位给说明 —— 「继承昨日」此刻不该被点到。 */}
        {selecting ? (
          <p className="mt-3 text-caption leading-5 text-ink-faint">
            勾选要同步到今日的任务。
            <span className="text-ink-muted">只有已分组（非「其他」）且写了内容的能勾</span>
            ；已经同步过的默认勾上，确认后会把今日页那条更新成现在的样子。
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleInherit}
              className="press flex-1 min-h-[40px] rounded-card border border-surface-line bg-surface text-body text-accent inline-flex items-center justify-center gap-1.5"
            >
              <Icon name="undo" size={16} />
              继承昨日未完成
            </button>
            <button
              type="button"
              onClick={startSelecting}
              data-testid="task-sync-button"
              className="press flex-1 min-h-[40px] rounded-card border border-surface-line bg-surface text-body text-accent inline-flex items-center justify-center gap-1.5"
            >
              <Icon name="sync" size={16} />
              同步到今日
            </button>
          </div>
        )}
      </div>

      <div className="m-rise flex-1 px-5 pt-3 pb-24" style={{ animationDelay: '60ms' }}>
        {dailyAlive.length === 0 ? (
          <EmptyState
            icon={<Icon name="task" size={40} className="text-ink-faint" />}
            title={isToday(date) ? '今天还没有任务' : `${formatShortDate(date)} 还没有任务`}
            description={
              isToday(date)
                ? '先写下今天要做的几件事，睡前回来勾选会很有成就感。'
                : '这一天还没有安排。可以现在补记，也可以提前排进去。'
            }
          />
        ) : (
          /* 概念稿 C4：所有任务装在同一张纸卡里，行与行之间不画线。
             每行外面这层 div 是拖拽的承载体：transform 由 useDragSort 下发，
             被拖起的 card 抬 z-index，其余行同步让位。 */
          <div className="bg-surface rounded-card shadow-card p-1.5" data-no-swipe>
            {dailyAlive.map((task, index) => (
              <div
                key={task.id}
                ref={drag.registerItem(task.id)}
                style={drag.itemStyle(task.id, index)}
              >
                <TaskRow
                  task={task}
                  focused={focusId === task.id}
                  picking={pickingId === task.id}
                  dragging={drag.activeId === task.id}
                  synced={syncedTaskIds.has(task.id)}
                  // 勾选模式下行首换成同步勾选框，同时收起拖拽手柄（此刻只做「挑」这一件事）
                  sync={
                    selecting
                      ? {
                          checked: checked.has(task.id),
                          disabled: !isSyncable(task),
                          onToggle: () => toggleChecked(task.id),
                        }
                      : undefined
                  }
                  handleProps={selecting ? undefined : drag.handleProps(task.id, index)}
                  onFocus={() => setFocusId(task.id)}
                  onTogglePin={() => setPinConfirmId(task.id)}
                  onEnter={() => {
                    const id = add(date, '');
                    if (id) setFocusId(id);
                  }}
                  onOpenPicker={() => setPickingId(task.id)}
                  onPickSection={(key) => {
                    setSection(task.id, key);
                    setPickingId(null);
                  }}
                  onClosePicker={() => setPickingId(null)}
                />
              </div>
            ))}
          </div>
        )}

        {/* 任务的两个纵向卡片：期限任务、长时目标（跨日期持久存在，可折叠） */}
        <div className="mt-3 space-y-3">
          <DeadlineCard />
          <GoalCard />
        </div>
      </div>

      <div
        className={clsx(
          'fixed inset-x-0 bottom-[100px] flex justify-center px-4 pointer-events-none',
          // 键盘弹起时跟着底栏一起收下去：fixed 在 adjustResize 下会被键盘顶上来
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
                data-testid="task-sync-confirm"
                className="press flex-[2] min-h-[46px] rounded-pill bg-accent text-lead text-accent-fg disabled:opacity-50"
              >
                {syncButtonLabel(planCounts, checked.size > 0)}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                const id = add(date, '');
                if (id) setFocusId(id);
              }}
              className="press w-full min-h-[46px] rounded-pill bg-accent text-lead text-accent-fg shadow-lg"
            >
              + 添加任务
            </button>
          )}
        </div>
      </div>

      <DatePickerModal
        open={datePickerOpen}
        value={date}
        onSelect={(d) => setDate(d)}
        onClose={() => setDatePickerOpen(false)}
      />

      {/*
        「定住 / 取消定住」确认框（2026-10-26 加）。
        点图钉按钮不再直接生效 —— 定住会让任务从当天起每天重复出现、
        取消会让它从次日起不再出现，属于影响未来多天的动作，值得多问一句。
        🔴 判断「是否定住」用 `isActivelyPinned`（已定住且未取消），
        而非 `pinFrom !== null`：取消后 pinFrom 仍在、只多设了 pinUntil，
        若只看 pinFrom 会把「已取消」误判成「仍定住」，取消后图钉纹丝不动。
      */}
      <ConfirmSheet
        open={pinConfirmId !== null}
        title={pinConfirmTask && isActivelyPinned(pinConfirmTask) ? '取消长期任务？' : '设为长期任务？'}
        message={
          pinConfirmTask && isActivelyPinned(pinConfirmTask)
            ? '取消后，这条任务从明天起不再每天重复出现（今天已经有的会保留）。'
            : '设为长期任务后，这条任务会从今天起每天重复出现；每天的完成状态相互独立。'
        }
        confirmText={
          pinConfirmTask && isActivelyPinned(pinConfirmTask) ? '取消长期任务' : '设为长期任务'
        }
        onConfirm={() => {
          if (!pinConfirmTask) return;
          if (isActivelyPinned(pinConfirmTask)) {
            unpin(pinConfirmTask.id);
            pushToast('已取消长期任务，次日起不再重复');
          } else {
            pin(pinConfirmTask.id);
            pushToast('已设为长期任务，从今天起每天重复');
          }
        }}
        onClose={() => setPinConfirmId(null)}
      />
    </div>
  );
}
