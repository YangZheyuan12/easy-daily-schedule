import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Tick } from '@/components/ui/Tick';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TaskKindComposer } from '@/components/task/TaskKindComposer';
import { useTaskStore } from '@/store/useTaskStore';
import { compareByOrder } from '@/domain/constants';
import { RELATIVE_DEADLINE_LABEL } from '@/domain/enums';
import { formatShortDate } from '@/utils/date';
import type { Task } from '@/domain/types';
import type { TaskKind } from '@/domain/enums';

/** 两种持久任务页的元信息 */
const META: Record<Exclude<TaskKind, 'daily'>, {
  title: string;
  icon: IconName;
  addLabel: string;
  emptyTitle: string;
  emptyDesc: string;
}> = {
  deadline: {
    title: '期限任务',
    icon: 'calendar',
    addLabel: '+ 添加期限任务',
    emptyTitle: '还没有期限任务',
    emptyDesc: '点下面的按钮，给某件事定一个期限吧。',
  },
  goal: {
    title: '长时目标',
    icon: 'bulb',
    addLabel: '+ 添加长时目标',
    emptyTitle: '还没有长时目标',
    emptyDesc: '点下面的按钮，记下一个想长期做的事。',
  },
};

/** 期限任务的期限文案：具体日期优先，其次抽象期限，都没有则提示未设 */
function deadlineText(task: Task): string {
  if (task.dueDate) return `期限 ${formatShortDate(task.dueDate)}`;
  if (task.dueRelative) return `期限 ${RELATIVE_DEADLINE_LABEL[task.dueRelative]}`;
  return '未设期限';
}

/**
 * 期限任务 / 长时目标的**专属列表页**（对应首页那两张只读卡片的「进入编辑」入口）。
 *
 * 布局与任务首页同构：可滚动列表 + 底部「添加」按钮；点添加才出现选择项（时间 / 描述等），
 * 点任意一行进入该条的编辑抽屉。首页卡片只是它的只读预览，真正的增删改都在这里。
 */
export function TaskKindPage({ kind }: { kind: Exclude<TaskKind, 'daily'> }) {
  const navigate = useNavigate();
  const tasks = useTaskStore((s) => s.tasks);
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const meta = META[kind];
  const list = tasks
    .filter((t) => t.kind === kind && t.deletedAt === null)
    .sort(compareByOrder);

  const openAdd = () => {
    setEditing(null);
    setComposerOpen(true);
  };
  const openEdit = (task: Task) => {
    setEditing(task);
    setComposerOpen(true);
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title={meta.title} onBack={() => navigate(-1)} />

      <div className="m-rise flex-1 px-5 pt-3 pb-24" style={{ animationDelay: '60ms' }}>
        {list.length === 0 ? (
          <EmptyState
            icon={<Icon name={meta.icon} size={40} className="text-ink-faint" />}
            title={meta.emptyTitle}
            description={meta.emptyDesc}
          />
        ) : (
          /* 概念稿 C4：同一张纸卡，行与行之间不画线 */
          <div className="bg-surface rounded-card shadow-card p-1.5">
            {list.map((task) => (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => openEdit(task)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openEdit(task);
                  }
                }}
                className="flex items-start min-h-tap py-0.5 cursor-pointer"
              >
                <span
                  className="min-w-[38px] min-h-tap flex items-center shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Tick
                    done={task.done}
                    size={20}
                    shape="square"
                    onToggle={() => toggleDone(task.id)}
                  />
                </span>
                <div className="flex-1 min-w-0 pt-1.5">
                  <div
                    className={
                      task.done ? 'text-lead text-ink-faint' : 'text-lead text-ink'
                    }
                  >
                    {task.content}
                  </div>
                  {kind === 'deadline' && (
                    <div className="-mt-0.5 mb-0.5 text-caption text-ink-faint">
                      {deadlineText(task)}
                    </div>
                  )}
                  {task.description && (
                    <div className="text-caption text-ink-faint">{task.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部添加按钮：点它才出现时间 / 描述之类选项 */}
      <div className="fixed inset-x-0 bottom-[100px] flex justify-center px-4 pointer-events-none">
        <div className="w-full max-w-[430px] pointer-events-auto">
          <button
            type="button"
            onClick={openAdd}
            className="press w-full min-h-[46px] rounded-full bg-accent text-lead text-accent-fg shadow-lg"
          >
            {meta.addLabel}
          </button>
        </div>
      </div>

      <TaskKindComposer
        kind={kind}
        task={editing}
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
      />
    </div>
  );
}
