import { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TaskKindComposer } from '@/components/task/TaskKindComposer';
import { TaskKindRow } from '@/components/task/TaskKindRow';
import { TaskImageSection } from '@/components/task/TaskImageSection';
import { useDragSort } from '@/hooks/useDragSort';
import { useTaskStore } from '@/store/useTaskStore';
import { useTaskImageStore } from '@/store/useTaskImageStore';
import { compareByOrder } from '@/domain/constants';
import { RELATIVE_DEADLINE_LABEL } from '@/domain/enums';
import { formatShortDate } from '@/utils/date';
import { useKeyboardVisible, KEYBOARD_HIDDEN_CLASS } from '@/hooks/useKeyboardVisible';
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
 * 现在是**直接在列表里改**：标题与描述点了就能输入（与任务页同一套行宽与对齐），
 * 期限日期、删除、图片这些低频动作收在右侧「⋯」打开的抽屉里。
 * 早先「点任意一行就弹抽屉」的做法被用户否掉了 —— 只想改两个字也要等一个底部面板升起来、
 * 改完再等它滑下去，来回比直接改多两步。
 *
 * 顺序支持拖拽，规则与任务页一致（写 `order` 字段，不做软件上的数组搬运）。
 */
export function TaskKindPage({ kind }: { kind: Exclude<TaskKind, 'daily'> }) {
  const navigate = useNavigate();
  const tasks = useTaskStore((s) => s.tasks);
  const reorderIds = useTaskStore((s) => s.reorderIds);
  const loadTaskImages = useTaskImageStore((s) => s.loadForTasks);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  // 键盘弹起 → 底部添加按钮收下去（与 Tab 胶囊同一机制）
  const keyboardVisible = useKeyboardVisible();

  const meta = META[kind];
  const list = useMemo(
    () => tasks.filter((t) => t.kind === kind && t.deletedAt === null).sort(compareByOrder),
    [tasks, kind],
  );

  /*
    图片按整页批量预载：逐行去查会让 N 条任务产生 N 次索引查询，
    而这 N 条多半挂不到几张图。key 用「种类 + 全部 id」——切页或增删就能重新拉。
  */
  const imageKey = `${kind}:${list.map((t) => t.id).join(',')}`;
  useEffect(() => {
    void loadTaskImages(
      list.map((t) => t.id),
      imageKey,
    );
  }, [imageKey, list, loadTaskImages]);

  const openAdd = () => {
    setEditing(null);
    setComposerOpen(true);
  };
  const openEdit = useCallback((task: Task) => {
    setEditing(task);
    setComposerOpen(true);
  }, []);

  const listIds = useMemo(() => list.map((t) => t.id), [list]);
  const handleReorder = useCallback(
    (from: number, to: number) => {
      const next = [...listIds];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return;
      next.splice(to, 0, moved);
      reorderIds(next);
    },
    [listIds, reorderIds],
  );
  const drag = useDragSort({ ids: listIds, onReorder: handleReorder });

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
            {list.map((task, index) => (
              <div
                key={task.id}
                ref={drag.registerItem(task.id)}
                style={drag.itemStyle(task.id, index)}
              >
                <TaskKindRow
                  task={task}
                  kind={kind}
                  dueLabel={kind === 'deadline' ? deadlineText(task) : undefined}
                  dragging={drag.activeId === task.id}
                  handleProps={drag.handleProps(task.id, index)}
                  onOpenSheet={() => openEdit(task)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部添加按钮：点它才出现时间 / 描述之类选项 */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-[100px] flex justify-center px-4 pointer-events-none',
          // 键盘弹起时跟着底栏一起收下去：fixed 在 adjustResize 下会被键盘顶上来
          'transition-opacity duration-150 ease-[var(--m-ease-out)]',
          keyboardVisible && KEYBOARD_HIDDEN_CLASS,
        )}
        aria-hidden={keyboardVisible}
      >
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
      >
        {/* 图片只给**已存在**的任务配（新建时还没有 id，图没地方挂） */}
        {editing && <TaskImageSection taskId={editing.id} />}
      </TaskKindComposer>
    </div>
  );
}
