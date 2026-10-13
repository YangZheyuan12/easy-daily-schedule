import { Icon } from '@/components/ui/Icon';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '@/store/useTaskStore';
import { useDayStore } from '@/store/useDayStore';
import { useUiStore } from '@/store/useUiStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { TaskRow } from '@/components/task/TaskRow';
import { EmptyState } from '@/components/feedback/EmptyState';
import { computeTaskProgress, toPercent } from '@/services/progressService';
import { compareByOrder } from '@/domain/constants';
import { formatShortDate, isToday } from '@/utils/date';

/** 每日任务页：独立于四大板块的待办清单，支持一键继承昨日未完成。 */
export function TasksPage() {
  const navigate = useNavigate();
  const date = useDayStore((s) => s.date);
  const tasks = useTaskStore((s) => s.tasks);
  const add = useTaskStore((s) => s.add);
  const inherit = useTaskStore((s) => s.inheritFromYesterday);
  const pushToast = useUiStore((s) => s.pushToast);

  const [focusId, setFocusId] = useState<string | null>(null);

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

  const handleInherit = async () => {
    const { created, skipped } = await inherit(date);
    if (created === 0) {
      pushToast(skipped > 0 ? '昨日未完成的任务都已经在这里了' : '昨天没有未完成的任务');
      return;
    }
    pushToast(`已继承 ${created} 项未完成任务`);
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

        {/* 继承按钮：居中半宽白卡（概念稿 C2 里不是通栏虚线框） */}
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={handleInherit}
            className="press w-[64%] min-h-[40px] rounded-card border border-surface-line bg-surface text-body text-accent inline-flex items-center justify-center gap-1.5"
          >
            <Icon name="undo" size={16} />
            继承昨日未完成
          </button>
        </div>
      </div>

      <div className="m-rise flex-1 px-5 pt-2 pb-24" style={{ animationDelay: '60ms' }}>
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
                   而不是点下去什么都不发生（原来的样子，用户会以为按钮坏了） */
                canMoveUp={index > 0}
                canMoveDown={index < alive.length - 1}
                focused={focusId === task.id}
                onFocus={() => setFocusId(task.id)}
                onEnter={() => {
                  const id = add(date, '');
                  if (id) setFocusId(id);
                }}
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
    </div>
  );
}
