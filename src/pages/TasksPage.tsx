import { Icon } from '@/components/ui/Icon';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TaskSectionKey } from '@/domain/enums';
import { compareByOrder } from '@/domain/constants';
import { useTaskStore } from '@/store/useTaskStore';
import { useItemStore } from '@/store/useItemStore';
import { useDayStore } from '@/store/useDayStore';
import { useUiStore } from '@/store/useUiStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { TaskRow } from '@/components/task/TaskRow';
import { SectionPickerSheet } from '@/components/task/SectionPickerSheet';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/feedback/EmptyState';
import { computeTaskProgress, toPercent } from '@/services/progressService';
import { planTaskSync } from '@/services/taskSyncService';
import { formatShortDate, isToday } from '@/utils/date';

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
  const navigate = useNavigate();
  const date = useDayStore((s) => s.date);
  const tasks = useTaskStore((s) => s.tasks);
  const add = useTaskStore((s) => s.add);
  const setSection = useTaskStore((s) => s.setSection);
  const inherit = useTaskStore((s) => s.inheritFromYesterday);
  const pushToast = useUiStore((s) => s.pushToast);

  const [focusId, setFocusId] = useState<string | null>(null);
  /** 正在改分组的任务 id（抽屉由页面持有一个，而不是每行各挂一个） */
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncCount, setSyncCount] = useState(0);

  /*
    展示顺序**由 `order` 派生**，不是数组位置 —— 与板块树（buildTree 按 order 排子节点）同一套约定。
    原来直接 `tasks.filter()` 就用数组顺序渲染，于是 `move()` 把 order 换好了、
    页面上却纹丝不动（要重新加载才「突然生效」）。现在换位与撤销都自动正确。
  */
  const alive = useMemo(
    () => tasks.filter((t) => t.deletedAt === null).sort(compareByOrder),
    [tasks],
  );
  const progress = useMemo(() => computeTaskProgress(alive), [alive]);

  const pickingTask = pickingId === null ? null : alive.find((t) => t.id === pickingId) ?? null;

  const handleInherit = async () => {
    const { created, skipped } = await inherit(date);
    if (created === 0) {
      pushToast(skipped > 0 ? '昨日未完成的任务都已经在这里了' : '昨天没有未完成的任务');
      return;
    }
    pushToast(`已继承 ${created} 项未完成任务`);
  };

  /** 本次同步会新增的条目草稿（每次都现算，不用 state 缓存，避免拿到过期数据） */
  const currentDrafts = () =>
    planTaskSync(useTaskStore.getState().tasks, useItemStore.getState().items, date);

  const openSync = () => {
    const count = currentDrafts().length;
    // 没有可同步的就不弹框 —— 弹一个「确认同步 0 项」的框只会让人以为坏了
    if (count === 0) {
      pushToast(alive.length === 0 ? '还没有任务可以同步' : '四大板块的任务都已经同步到今日了');
      return;
    }
    setSyncCount(count);
    setSyncOpen(true);
  };

  const confirmSync = () => {
    const created = useItemStore.getState().syncFromTasks(currentDrafts());
    pushToast(created > 0 ? `已同步 ${created} 项到今日` : '没有需要同步的任务');
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="每日任务"
        subtitle={
          <>
            {/* 日期可点 → 去日历选日子（选完自动回到本页）；「完成度」保持纯文本 */}
            <button
              type="button"
              onClick={() => navigate('/calendar', { state: { pickDateFrom: '/tasks' } })}
              className="press -my-2 py-2 pr-0.5 inline-flex items-center gap-0.5 active:opacity-60"
              aria-label="选择日期"
            >
              {formatShortDate(date)}
              <Icon name="chevron-right" size={13} />
            </button>
            <span> · 完成 {progress.done}/{progress.total}（{toPercent(progress.ratio)}%）</span>
          </>
        }
      />

      <div className="m-rise px-5 mt-1">
        {/* 进度条：粗实心条（概念稿 C2），不要描边。宽度用动效而非瞬变 —— 勾一条就能看见它前进 */}
        <div className="h-[6px] rounded-pill bg-surface-sunken overflow-hidden">
          <div
            className="h-full bg-accent rounded-pill transition-[width] duration-[var(--m-dur-3)] ease-[var(--m-ease-out)]"
            style={{ width: `${toPercent(progress.ratio)}%` }}
          />
        </div>

        {/* 两个批量操作并排：继承昨日（拉进来）与同步到今日（推过去） */}
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
            onClick={openSync}
            data-testid="task-sync-button"
            className="press flex-1 min-h-[40px] rounded-card border border-surface-line bg-surface text-body text-accent inline-flex items-center justify-center gap-1.5"
          >
            <Icon name="sync" size={16} />
            同步到今日
          </button>
        </div>
      </div>

      <div className="m-rise flex-1 px-5 pt-3 pb-24" style={{ animationDelay: '60ms' }}>
        {alive.length === 0 ? (
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
          /* 概念稿 C4：所有任务装在同一张纸卡里，行与行之间不画线 */
          <div className="bg-surface rounded-card shadow-card p-1.5">
            {alive.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                /* 首行不能上移、末行不能下移 —— 按钮自己把这个事实显示出来（置灰），
                   而不是点下去什么都不发生（原来的样子，用户会以为按钮坏了）。
                   边界是**整条列表**的首尾：分组不参与名次判断 */
                canMoveUp={index > 0}
                canMoveDown={index < alive.length - 1}
                focused={focusId === task.id}
                onFocus={() => setFocusId(task.id)}
                onEnter={() => {
                  const id = add(date, '');
                  if (id) setFocusId(id);
                }}
                onPickSection={() => setPickingId(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[100px] flex justify-center px-4 pointer-events-none">
        <div className="w-full max-w-[430px] pointer-events-auto">
          <button
            type="button"
            onClick={() => {
              const id = add(date, '');
              if (id) setFocusId(id);
            }}
            className="press w-full min-h-[46px] rounded-full bg-accent text-lead text-accent-fg shadow-lg"
          >
            + 添加任务
          </button>
        </div>
      </div>

      {/* 改某条任务的分组 */}
      <SectionPickerSheet
        open={pickingTask !== null}
        current={pickingTask?.sectionId ?? null}
        onPick={(key: TaskSectionKey) => {
          if (pickingTask) setSection(pickingTask.id, key);
          setPickingId(null);
        }}
        onClose={() => setPickingId(null)}
      />

      {/* 同步确认：把「会影响什么、不会影响什么」写在弹框里，而不是等用户发现 */}
      <ConfirmSheet
        open={syncOpen}
        title="同步到今日"
        confirmText="确认同步"
        message={
          <>
            将把 {syncCount} 项任务复制到今日页对应的板块（追加在该板块现有条目之后）。
            没分组（「其他」）的任务不参与同步；已经同步过的任务不会重复添加。
          </>
        }
        onConfirm={confirmSync}
        onClose={() => setSyncOpen(false)}
      />
    </div>
  );
}
