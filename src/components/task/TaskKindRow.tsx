import { useState } from 'react';
import clsx from 'clsx';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Tick } from '@/components/ui/Tick';
import { useTaskStore } from '@/store/useTaskStore';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { TaskImageStrip } from './TaskImageStrip';
import type { Task } from '@/domain/types';
import type { TaskKind } from '@/domain/enums';

export interface TaskKindRowProps {
  task: Task;
  kind: Exclude<TaskKind, 'daily'>;
  /** 期限文案（如「期限 10月20日」）—— 期限任务才有 */
  dueLabel?: string;
  /** 点右侧「⋯」→ 打开编辑抽屉 */
  onOpenSheet: () => void;
  /** 拖拽手柄；不传则整行不可拖 */
  handleProps?: { onPointerDown: (event: ReactPointerEvent) => void; style: CSSProperties };
  dragging?: boolean;
}

/**
 * 期限任务 / 长时目标的行 —— **直接改**，不用先开弹窗。
 *
 * 三个字段按「是不是每次都要动它」分层：
 * - 标题：常驻输入框（`<textarea>` 自动增高），点进去就能改，写完即存；
 * - 描述：第二行的浅色输入框，写了就留着，没写不占视觉重量；
 * - 期限：第二行的一颗胶囊，点它进抽屉调日期（日期选择需要一个真正的日历弹层，
 *   塞在行里会把列表撑得忽高忽低）。
 * 右侧「⋯」统一走 `TaskKindComposer` —— 那里才有删除、图片这类**低频但要慎重**的操作。
 *
 * 🔴 对齐约定：整行一个 44px 行盒，全部 `items-center`。
 * 早先是 `items-start` 再靠 `pt-1.5` 手调、副标题还带 `-mt-0.5`，
 * 结果就是用户反馈的「文字和框框没对齐」—— 方框比文字首行低了约 4px。
 * 现在与任务页 / 今日页同一套写法，勾选框与标题天然共处同一垂直中心。
 */
export function TaskKindRow({
  task,
  kind,
  dueLabel,
  onOpenSheet,
  handleProps,
  dragging = false,
}: TaskKindRowProps) {
  const setContent = useTaskStore((s) => s.setContent);
  const setDescription = useTaskStore((s) => s.setDescription);
  const toggleDone = useTaskStore((s) => s.toggleDone);

  const [focused, setFocused] = useState(false);

  const titleRef = useAutoResizeTextarea(task.content);
  const descRef = useAutoResizeTextarea(task.description ?? '');

  /** 第二行的时机：聚焦 / 已有描述 / 期限任务（期限胶囊住在这一行） */
  const showMeta = focused || (task.description?.length ?? 0) > 0 || kind === 'deadline';

  return (
    <div
      className={clsx(
        'm-row-exit rounded-card',
        // 拖起来的那一层：脱离纸面 + 一点光
        dragging && 'bg-surface shadow-card ring-1 ring-accent/30',
      )}
    >
      <div className="flex items-center min-h-tap">
        <Tick
          done={task.done}
          size={20}
          shape="square"
          className="min-w-[38px] min-h-tap"
          onToggle={() => toggleDone(task.id)}
        />

        <textarea
          ref={titleRef}
          value={task.content}
          onChange={(event) => setContent(task.id, event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={kind === 'deadline' ? '要按期完成的事…' : '想长期做的事…'}
          rows={1}
          className={clsx(
            'm-strike-ink flex-1 min-w-0 min-h-tap py-2.5 px-1 text-lead leading-6 outline-none bg-transparent resize-none',
            task.done ? 'text-ink-faint' : 'text-ink',
          )}
          data-done={task.done}
          enterKeyHint="done"
          aria-label="任务标题"
        />

        {handleProps && (
          <button
            type="button"
            onPointerDown={handleProps.onPointerDown}
            style={handleProps.style}
            aria-label={`拖动排序：${task.content || '这条任务'}`}
            className="press shrink-0 w-[35px] min-h-tap flex items-center justify-center text-ink-faint"
          >
            <Icon name="grip" size={16} />
          </button>
        )}

        {/* 「⋯」：删除 / 图片 / 改日期这类低频但慎重的入口都在这张抽屉里 */}
        <button
          type="button"
          onClick={onOpenSheet}
          aria-label={`更多操作：${task.content || '这条任务'}`}
          data-testid="task-kind-more"
          className="press shrink-0 w-8 h-8 flex items-center justify-center rounded-pill text-ink-faint active:opacity-60"
        >
          <Icon name="more" size={17} />
        </button>
      </div>

      {showMeta && (
        /* 与标题列的横向起点对齐（勾选框那一列的宽度），副信息不能比标题更靠左 */
        <div className="ml-[38px] -mt-0.5 mb-1.5 flex items-center gap-1.5">
          {dueLabel && (
            <button
              type="button"
              onClick={onOpenSheet}
              className="press shrink-0 min-h-[30px] px-2 inline-flex items-center gap-1 rounded-pill bg-surface-sunken"
              aria-label={`修改期限：${dueLabel}`}
            >
              <Icon name="calendar" size={12} className="shrink-0 text-ink-faint" />
              <span className="text-caption text-ink-muted whitespace-nowrap">{dueLabel}</span>
            </button>
          )}
          <textarea
            ref={descRef}
            value={task.description ?? ''}
            onChange={(event) => setDescription(task.id, event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="描述（可选）"
            rows={1}
            className="m-strike-ink flex-1 min-w-0 min-h-[34px] py-1.5 px-1 text-caption leading-5 outline-none bg-transparent text-ink-faint resize-none"
            data-done={task.done}
            aria-label="任务描述"
          />
        </div>
      )}

      <TaskImageStrip taskId={task.id} indent={38} />
    </div>
  );
}
