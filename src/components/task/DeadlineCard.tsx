import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import clsx from 'clsx';
import { useTaskStore } from '@/store/useTaskStore';
import { formatShortDate } from '@/utils/date';
import { compareByOrder } from '@/domain/constants';
import { RELATIVE_DEADLINE_LABEL } from '@/domain/enums';
import type { Task } from '@/domain/types';

/** 期限任务的期限文案：具体日期优先，其次抽象期限，都没有则提示未设 */
function deadlineText(task: Task): string {
  if (task.dueDate) return `期限 ${formatShortDate(task.dueDate)}`;
  if (task.dueRelative) return `期限 ${RELATIVE_DEADLINE_LABEL[task.dueRelative]}`;
  return '未设期限';
}

/**
 * 首页「期限任务」卡片 = **只读预览**。
 *
 * 列表里不能编辑（符合用户要求）：增删改全部在专属的「期限任务」页（/tasks/deadline）里进行。
 * 整张卡片可点，点进去就是那一个编辑页。
 */
export function DeadlineCard() {
  const navigate = useNavigate();
  const tasks = useTaskStore((s) => s.tasks);

  const list = tasks
    .filter((t) => t.kind === 'deadline' && t.deletedAt === null)
    .sort(compareByOrder);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/tasks/deadline')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate('/tasks/deadline');
        }
      }}
      className="bg-surface rounded-card shadow-card overflow-hidden cursor-pointer"
    >
      <div className="flex w-full items-center justify-between px-3.5 min-h-[52px]">
        <span className="flex items-center gap-2 text-lead text-ink">
          <Icon name="calendar" size={18} className="text-accent" />
          期限任务
          <span className="text-caption text-ink-faint">{list.length}</span>
        </span>
        <span className="flex items-center gap-1 text-caption text-ink-faint">
          管理
          <Icon name="chevron-right" size={15} />
        </span>
      </div>

      <div className="px-3.5 pb-3">
        {list.length === 0 ? (
          <p className="text-caption text-ink-faint">还没有期限任务，点进去添加一个。</p>
        ) : (
          <ul className="space-y-1.5">
            {list.slice(0, 5).map((task) => (
              <li key={task.id} className="flex items-baseline justify-between gap-2">
                <span
                  className={clsx(
                    'text-body truncate',
                    task.done ? 'text-ink-faint line-through' : 'text-ink',
                  )}
                >
                  {task.content}
                </span>
                <span className="shrink-0 text-caption text-ink-faint">
                  {deadlineText(task)}
                </span>
              </li>
            ))}
            {list.length > 5 && (
              <li className="text-caption text-ink-faint">还有 {list.length - 5} 条…</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
