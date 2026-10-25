import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { TaskSectionKey } from '@/domain/enums';
import { useRoutineStore, computeRoutineProgress } from '@/store/useRoutineStore';
import { useDragSort } from '@/hooks/useDragSort';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { toPercent } from '@/services/progressService';
import { RoutineRow } from './RoutineRow';

interface RoutineSectionProps {
  /** 当前日期键（完成态按天独立） */
  date: string;
  /** 外层样式钩子：TasksPage 传 `px-5 mt-4`，TodayPage 不传（由父容器控间距） */
  className?: string;
}

/**
 * 每日固定任务区块（例行模板）。
 *
 * 放在「任务」列表上方 / 今日页当日视图顶部：模板跨日期复用，每天的勾选独立，
 * 所以同一份「晨跑 / 背单词 / 吃药」每天都会原样出现，勾掉当天即完成。
 * 这里只负责展示与编辑模板 + 当天的勾选态，完成度由 `routineService` 现算。
 */
export function RoutineSection({ date, className }: RoutineSectionProps) {
  const routines = useRoutineStore((s) => s.routines);
  const completions = useRoutineStore((s) => s.completions);
  const add = useRoutineStore((s) => s.add);
  const reorderIds = useRoutineStore((s) => s.reorderIds);
  const setSection = useRoutineStore((s) => s.setSection);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);

  const progress = useMemo(
    () => computeRoutineProgress(routines, completions, date),
    [routines, completions, date],
  );

  const ids = useMemo(() => routines.map((r) => r.id), [routines]);
  const handleReorder = useCallback(
    (from: number, to: number) => {
      const next = [...ids];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return;
      next.splice(to, 0, moved);
      reorderIds(next);
    },
    [ids, reorderIds],
  );
  const drag = useDragSort({ ids, onReorder: handleReorder });

  const handleAdd = () => {
    const id = add('');
    if (id) setFocusId(id);
  };

  return (
    <section className={clsx('m-rise', className)}>
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h2 className="text-lead font-semibold text-ink">每日固定任务</h2>
        <span className="text-caption text-ink-faint">
          完成 {progress.done}/{progress.total}（{toPercent(progress.ratio)}%）
        </span>
      </div>

      <div className="h-[6px] rounded-pill bg-surface-sunken overflow-hidden">
        <div
          className="h-full bg-accent rounded-pill transition-[width] duration-[var(--m-dur-3)] ease-[var(--m-ease-out)]"
          style={{ width: `${toPercent(progress.ratio)}%` }}
        />
      </div>

      {routines.length === 0 ? (
        <EmptyState
          icon={<Icon name="task" size={40} className="text-ink-faint" />}
          title="还没有固定任务"
          description="把每天都会做的事（晨跑、背单词、吃药）记成固定任务，每天自动出现、独立勾选。"
        />
      ) : (
        <div className="bg-surface rounded-card shadow-card p-1.5 mt-3" data-no-swipe>
          {routines.map((routine, index) => (
            <div
              key={routine.id}
              ref={drag.registerItem(routine.id)}
              style={drag.itemStyle(routine.id, index)}
            >
              <RoutineRow
                routine={routine}
                date={date}
                focused={focusId === routine.id}
                picking={pickingId === routine.id}
                dragging={drag.activeId === routine.id}
                handleProps={drag.handleProps(routine.id, index)}
                onFocus={() => setFocusId(routine.id)}
                onEnter={handleAdd}
                onOpenPicker={() => setPickingId(routine.id)}
                onPickSection={(key: TaskSectionKey) => {
                  setSection(routine.id, key);
                  setPickingId(null);
                }}
                onClosePicker={() => setPickingId(null)}
              />
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="press mt-3 w-full min-h-[46px] rounded-pill bg-accent text-lead text-accent-fg shadow-lg"
      >
        + 添加固定任务
      </button>
    </section>
  );
}
