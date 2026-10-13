import { Icon } from '@/components/ui/Icon';
import { Tick } from '@/components/ui/Tick';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { Task } from '@/domain/types';
import { useTaskStore } from '@/store/useTaskStore';

interface TaskRowProps {
  task: Task;
  focused: boolean;
  /** 是否还能上移 / 下移。首行与末行为 false —— 按钮据此置灰 */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onFocus: () => void;
  onEnter: () => void;
}

/** 每日任务行：勾选 + 行内编辑 + 行内操作（上移 / 下移 / 删除）。 */
export function TaskRow({
  task,
  focused,
  canMoveUp,
  canMoveDown,
  onFocus,
  onEnter,
}: TaskRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setContent = useTaskStore((s) => s.setContent);
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const remove = useTaskStore((s) => s.remove);
  const move = useTaskStore((s) => s.move);

  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  return (
    <div className="flex items-center min-h-tap">
      <Tick
        done={task.done}
        size={20}
        shape="square"
        className="min-w-[38px] min-h-tap"
        onToggle={() => toggleDone(task.id)}
      />

      <input
        ref={inputRef}
        value={task.content}
        onChange={(event) => setContent(task.id, event.target.value)}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onEnter();
          }
          if (event.key === 'Backspace' && task.content === '') {
            event.preventDefault();
            remove(task.id);
          }
        }}
        placeholder="今天要做什么…"
        className={clsx(
          // 16px 与日记体顶层条目同档 —— 任务页和今日页的「一条事」必须是同一个分量
          'm-strike-ink flex-1 min-w-0 min-h-tap px-1 text-lead outline-none bg-transparent',
          task.done ? 'text-ink-faint' : 'text-ink',
        )}
        data-done={task.done}
        enterKeyHint="enter"
      />

      {/*
        行内操作：仅在聚焦该行时出现，避免静态排版被工具按钮打散（对齐概念稿）。
        上移 / 下移收在一个下沉底胶囊里 —— 它们是一件事（重排这一行），
        分开平铺时两个箭头看起来只是装饰，用户认不出是一对控件。
        删除另起一个，避免误触。
        三个按钮都「按下去要有反应」：原来既没有按压反馈，
        首行按上移 / 末行按下移又是静默的空操作，看起来就像坏了。
      */}
      <div className={clsx('items-center shrink-0 gap-1', focused ? 'flex' : 'hidden')}>
        <span className="flex items-center rounded-pill bg-surface-sunken p-[2px]">
          <button
            type="button"
            onClick={() => move(task.id, -1)}
            disabled={!canMoveUp}
            title="上移一位"
            className="press w-[34px] min-h-[38px] rounded-pill flex items-center justify-center text-ink-muted disabled:opacity-25"
            aria-label="上移"
          >
            <Icon name="chevron-up" size={17} />
          </button>
          <button
            type="button"
            onClick={() => move(task.id, 1)}
            disabled={!canMoveDown}
            title="下移一位"
            className="press w-[34px] min-h-[38px] rounded-pill flex items-center justify-center text-ink-muted disabled:opacity-25"
            aria-label="下移"
          >
            <Icon name="chevron-down" size={17} />
          </button>
        </span>
        <button
          type="button"
          onClick={() => remove(task.id)}
          title="删除这条任务"
          className="press min-w-[38px] min-h-tap flex items-center justify-center text-ink-faint"
          aria-label="删除"
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  );
}
