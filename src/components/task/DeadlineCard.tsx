import { Icon } from '@/components/ui/Icon';
import { useTaskStore } from '@/store/useTaskStore';
import { formatShortDate } from '@/utils/date';
import { compareByOrder } from '@/domain/constants';
import { RELATIVE_DEADLINE_LABEL } from '@/domain/enums';
import type { Task } from '@/domain/types';
import { TaskPreviewCard } from '@/components/task/TaskPreviewCard';

/** 期限任务的期限文案：具体日期优先，其次抽象期限，都没有则提示未设 */
function deadlineText(task: Task): string {
  if (task.dueDate) return `期限 ${formatShortDate(task.dueDate)}`;
  if (task.dueRelative) return `期限 ${RELATIVE_DEADLINE_LABEL[task.dueRelative]}`;
  return '未设期限';
}

/**
 * 任务页底部「期限任务」卡 = **只读预览**（默认收起，见 TaskPreviewCard）。
 *
 * 列表里不能编辑（符合用户要求）：增删改全部在专属的「期限任务」页（/tasks/deadline）里进行。
 */
export function DeadlineCard() {
  const tasks = useTaskStore((s) => s.tasks);

  const list = tasks
    .filter((t) => t.kind === 'deadline' && t.deletedAt === null)
    .sort(compareByOrder);

  return (
    <TaskPreviewCard
      testId="deadline-card"
      expandKey="tasks:deadline"
      icon={<Icon name="calendar" size={18} className="text-accent" />}
      title="期限任务"
      emptyHint="还没有期限任务，点进去添加一个。"
      to="/tasks/deadline"
      tasks={list}
      renderMeta={deadlineText}
    />
  );
}
