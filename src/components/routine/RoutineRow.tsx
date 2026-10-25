import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Routine } from '@/domain/types';
import type { TaskSectionKey } from '@/domain/enums';
import { OTHER_KEY } from '@/domain/enums';
import { Tick } from '@/components/ui/Tick';
import { Icon } from '@/components/ui/Icon';
import { useRoutineStore } from '@/store/useRoutineStore';
import { useTaskSectionConfig } from '@/hooks/useSectionConfigs';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { SectionPickerPopover } from '@/components/task/SectionPickerPopover';

interface RoutineRowProps {
  routine: Routine;
  /** 当前日期键（用于「每天独立」的勾选态） */
  date: string;
  focused: boolean;
  /** 本行的分组气泡是否展开（同一时刻只可能有一行是 true，由页面持状态） */
  picking: boolean;
  onFocus: () => void;
  onEnter: () => void;
  /** 点分组标记 → 展开本行下方的分组气泡 */
  onOpenPicker: () => void;
  onPickSection: (key: TaskSectionKey) => void;
  onClosePicker: () => void;
  /** 拖拽手柄（不传则整行不可拖）。由页面级 useDragSort 统一下发 */
  handleProps?: { onPointerDown: (event: ReactPointerEvent) => void; style: CSSProperties };
  /** 本行此刻正被手指拖着（= 抬起的那一层） */
  dragging?: boolean;
}

/** 退场动效时长：与 `.m-row-exit` 的 `--m-dur-3` 对齐 */
const ROW_EXIT_MS = 280;

/**
 * 每日固定任务行：当日勾选 + 标题 + 一行「分组 / 描述」。
 *
 * 与 `TaskRow` 同构（复用 Tick / SectionPickerPopover / useAutoResizeTextarea），
 * 唯一区别是左侧勾选框代表的是**这一天的完成态**——同一个模板在 10 号勾了、
 * 11 号还是没勾，互不干扰。这里不持有日期状态，date 由父级传入。
 */
export function RoutineRow({
  routine,
  date,
  focused,
  picking,
  onFocus,
  onEnter,
  onOpenPicker,
  onPickSection,
  onClosePicker,
  handleProps,
  dragging = false,
}: RoutineRowProps) {
  const setTitle = useRoutineStore((s) => s.setTitle);
  const setDescription = useRoutineStore((s) => s.setDescription);
  const remove = useRoutineStore((s) => s.remove);
  const toggleDone = useRoutineStore((s) => s.toggleDone);

  const titleRef = useAutoResizeTextarea(routine.title);
  const descriptionRef = useAutoResizeTextarea(routine.description ?? '');

  const [leaving, setLeaving] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const groupButtonRef = useRef<HTMLButtonElement>(null);

  const done = routine.deletedAt === null && useRoutineStore.getState().isDone(routine.id, date);

  const requestDelete = () => {
    if (leaving) return;
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => remove(routine.id), ROW_EXIT_MS);
  };

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (focused) titleRef.current?.focus();
  }, [focused, titleRef]);

  const section = useTaskSectionConfig(routine.sectionId);
  const ungrouped = routine.sectionId === OTHER_KEY;
  const label = ungrouped ? '未分组' : section.name;

  const showMeta = focused || (routine.description?.length ?? 0) > 0 || !ungrouped;

  return (
    <div
      className={clsx(
        'm-row-exit rounded-card',
        leaving && 'is-leaving',
        dragging && 'bg-surface shadow-card ring-1 ring-accent/30',
      )}
    >
      <div className="flex flex-col">
        <div className="flex items-center min-h-tap">
          <Tick
            done={done}
            size={20}
            shape="square"
            className="min-w-[38px] min-h-tap"
            onToggle={() => toggleDone(routine.id, date)}
          />

          <textarea
            ref={titleRef}
            value={routine.title}
            onChange={(event) => setTitle(routine.id, event.target.value)}
            onFocus={onFocus}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onEnter();
              }
              if (event.key === 'Backspace' && routine.title === '') {
                event.preventDefault();
                requestDelete();
              }
            }}
            placeholder="固定要做的事…"
            rows={1}
            className={clsx(
              'm-strike-ink flex-1 min-w-0 min-h-tap py-2.5 px-1 text-lead leading-6 outline-none bg-transparent resize-none',
              done ? 'text-ink-faint' : 'text-ink',
            )}
            data-done={done}
            enterKeyHint="enter"
          />

          {handleProps && (
            <button
              type="button"
              onPointerDown={handleProps.onPointerDown}
              style={handleProps.style}
              aria-label={`拖动排序：${routine.title || '这条固定任务'}`}
              className="press shrink-0 w-[35px] min-h-tap flex items-center justify-center text-ink-faint"
            >
              <Icon name="grip" size={16} />
            </button>
          )}

          <button
            type="button"
            onClick={requestDelete}
            title="删除"
            className={clsx(
              'press shrink-0 min-w-[38px] min-h-tap flex items-center justify-center text-ink-faint',
              focused ? 'flex' : 'hidden',
            )}
            aria-label="删除"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {showMeta && (
          <div className="flex items-center gap-1.5 ml-[38px] -mt-0.5 mb-1.5">
            <div className="relative shrink-0">
              <button
                ref={groupButtonRef}
                type="button"
                onClick={onOpenPicker}
                title={`分组：${label}（点击修改）`}
                aria-label={`分组：${label}，点击修改`}
                aria-expanded={picking}
                className="press min-h-[34px] max-w-[76px] px-1.5 flex items-center gap-1 rounded-pill bg-surface-sunken"
              >
                <span
                  className={clsx(
                    'w-2.5 h-2.5 rounded-pill shrink-0',
                    ungrouped && 'border border-edge-strong',
                  )}
                  style={ungrouped ? undefined : { backgroundColor: section.cssColor }}
                />
                <span className="text-caption text-ink-muted truncate">{label}</span>
              </button>

              <SectionPickerPopover
                open={picking}
                current={routine.sectionId}
                onPick={onPickSection}
                onClose={onClosePicker}
                anchorRef={groupButtonRef}
              />
            </div>

            <textarea
              ref={descriptionRef}
              value={routine.description ?? ''}
              onChange={(event) => setDescription(routine.id, event.target.value)}
              onFocus={onFocus}
              placeholder="描述（可选）"
              rows={1}
              className="m-strike-ink flex-1 min-w-0 min-h-[34px] py-1.5 px-1 text-caption leading-5 outline-none bg-transparent text-ink-faint resize-none"
              data-done={done}
            />
          </div>
        )}
      </div>
    </div>
  );
}
