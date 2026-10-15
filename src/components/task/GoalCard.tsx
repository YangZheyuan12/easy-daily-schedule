import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useTaskStore } from '@/store/useTaskStore';
import { compareByOrder } from '@/domain/constants';

/**
 * 首页「长时目标」卡片 = **只读预览**。
 *
 * 列表里不能编辑（符合用户要求）：增删改全部在专属的「长时目标」页（/tasks/goal）里进行。
 * 整张卡片可点，点进去就是那一个编辑页。
 */
export function GoalCard() {
  const navigate = useNavigate();
  const tasks = useTaskStore((s) => s.tasks);

  const list = tasks
    .filter((t) => t.kind === 'goal' && t.deletedAt === null)
    .sort(compareByOrder);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/tasks/goal')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate('/tasks/goal');
        }
      }}
      className="bg-surface rounded-card shadow-card overflow-hidden cursor-pointer"
    >
      <div className="flex w-full items-center justify-between px-3.5 min-h-[52px]">
        <span className="flex items-center gap-2 text-lead text-ink">
          <Icon name="bulb" size={18} className="text-accent" />
          长时目标
          <span className="text-caption text-ink-faint">{list.length}</span>
        </span>
        <span className="flex items-center gap-1 text-caption text-ink-faint">
          管理
          <Icon name="chevron-right" size={15} />
        </span>
      </div>

      <div className="px-3.5 pb-3">
        {list.length === 0 ? (
          <p className="text-caption text-ink-faint">还没有长时目标，点进去记一个。</p>
        ) : (
          <ul className="space-y-1.5">
            {list.slice(0, 5).map((task) => (
              <li key={task.id} className="flex items-baseline justify-between gap-2">
                <span
                  className={
                    task.done
                      ? 'text-body truncate text-ink-faint line-through'
                      : 'text-body truncate text-ink'
                  }
                >
                  {task.content}
                </span>
                {task.description && (
                  <span className="shrink-0 text-caption text-ink-faint">{task.description}</span>
                )}
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
