import { Icon } from '@/components/ui/Icon';
import { useTaskStore } from '@/store/useTaskStore';
import { compareByOrder } from '@/domain/constants';
import { TaskPreviewCard } from '@/components/task/TaskPreviewCard';

/**
 * 任务页底部「长时目标」卡 = **只读预览**（默认收起，见 TaskPreviewCard）。
 *
 * 列表里不能编辑（符合用户要求）：增删改全部在专属的「长时目标」页（/tasks/goal）里进行。
 */
export function GoalCard() {
  const tasks = useTaskStore((s) => s.tasks);

  const list = tasks
    .filter((t) => t.kind === 'goal' && t.deletedAt === null)
    .sort(compareByOrder);

  return (
    <TaskPreviewCard
      testId="goal-card"
      expandKey="tasks:goal"
      icon={<Icon name="bulb" size={18} className="text-accent" />}
      title="长时目标"
      emptyHint="还没有长时目标，点进去记一个。"
      to="/tasks/goal"
      tasks={list}
      renderMeta={(task) => task.description ?? null}
    />
  );
}
