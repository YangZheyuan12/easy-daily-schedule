import { useEffect, useState } from 'react';
import { Sheet, SheetActionButton } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import clsx from 'clsx';
import { useTaskStore } from '@/store/useTaskStore';
import { useDayStore } from '@/store/useDayStore';
import {
  RELATIVE_DEADLINES,
  RELATIVE_DEADLINE_LABEL,
  type RelativeDeadline,
} from '@/domain/enums';
import type { Task } from '@/domain/types';
import type { TaskKind } from '@/domain/enums';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';

type DueMode = 'date' | RelativeDeadline;

interface TaskKindComposerProps {
  /** 'deadline' 才显示期限选择；'goal' 只有标题 + 描述 */
  kind: Exclude<TaskKind, 'daily'>;
  /** 传入即「编辑」模式，null 即「新增」模式 */
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

/**
 * 期限任务 / 长时目标的「新增 / 编辑」抽屉。
 *
 * 设计要点（对应用户要求）：
 * - 选择时间之类的选项**只在打开这个抽屉时出现**；首页那两张卡片只是只读列表，列表里不能编辑。
 * - 新增与编辑共用同一套字段：标题、描述、（仅期限任务）期限（具体日期 / 三天内 / 一周内 / 两周内）。
 * - 编辑态底部多一个「删除」入口。
 */
export function TaskKindComposer({ kind, task, open, onClose }: TaskKindComposerProps) {
  const addDeadline = useTaskStore((s) => s.addDeadline);
  const addGoal = useTaskStore((s) => s.addGoal);
  const setContent = useTaskStore((s) => s.setContent);
  const setDescription = useTaskStore((s) => s.setDescription);
  const setDue = useTaskStore((s) => s.setDue);
  const remove = useTaskStore((s) => s.remove);

  const isDeadline = kind === 'deadline';
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const descRef = useAutoResizeTextarea(desc);
  const [mode, setMode] = useState<DueMode>('date');
  const [dateVal, setDateVal] = useState('');

  // 打开瞬间把表单同步到当前 task（新增则清空）。依赖 open 上升沿，避免编辑中回写表单
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.content);
      setDesc(task.description ?? '');
      if (task.dueDate) {
        setMode('date');
        setDateVal(task.dueDate);
      } else if (task.dueRelative) {
        setMode(task.dueRelative);
        setDateVal('');
      } else {
        setMode('date');
        setDateVal('');
      }
    } else {
      setTitle('');
      setDesc('');
      setMode('date');
      setDateVal('');
    }
    // 只在我们重新打开时跑：open 上升沿 + 切到不同的 task
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const canSave =
    title.trim().length > 0 && (!isDeadline || mode !== 'date' || dateVal.length > 0);

  const handleSave = () => {
    if (!canSave) return;
    const content = title.trim();
    const description = desc.trim();
    if (task) {
      // 编辑：原地改，不新建
      setContent(task.id, content);
      setDescription(task.id, description);
      if (isDeadline) {
        if (mode === 'date') setDue(task.id, { dueDate: dateVal });
        else setDue(task.id, { relative: mode });
      }
    } else {
      // 新增：以当前选中的日子作创建锚点（任务本身跨日期持久存在）
      const date = useDayStore.getState().date;
      if (isDeadline) {
        addDeadline(date, {
          content,
          description,
          dueDate: mode === 'date' ? dateVal : undefined,
          relative: mode === 'date' ? undefined : mode,
        });
      } else {
        addGoal(date, { content, description });
      }
    }
    onClose();
  };

  const handleDelete = () => {
    if (task) remove(task.id);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={task ? '编辑' : isDeadline ? '添加期限任务' : '添加长时目标'}
      action={
        <SheetActionButton onClick={handleSave} disabled={!canSave}>
          {task ? '保存' : '添加'}
        </SheetActionButton>
      }
    >
      <div className="pt-2 space-y-3.5">
        {/* 标题 */}
        <div>
          <div className="text-caption text-ink-muted mb-1.5">标题</div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSave();
              }
            }}
            placeholder={isDeadline ? '例如：交课程设计初稿' : '例如：读完《xxx》'}
            className="w-full min-h-tap px-1 text-lead outline-none bg-transparent text-ink"
            enterKeyHint="done"
            autoFocus
          />
        </div>

        {/* 期限（仅期限任务） */}
        {isDeadline && (
          <div>
            <div className="text-caption text-ink-muted mb-1.5">期限</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMode('date')}
                className={clsx(
                  'press px-2.5 min-h-[34px] rounded-pill text-caption border',
                  mode === 'date'
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-edge-strong text-ink-muted',
                )}
              >
                选择日期
              </button>
              {RELATIVE_DEADLINES.map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => setMode(rel)}
                  className={clsx(
                    'press px-2.5 min-h-[34px] rounded-pill text-caption border',
                    mode === rel
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-edge-strong text-ink-muted',
                  )}
                >
                  {RELATIVE_DEADLINE_LABEL[rel]}
                </button>
              ))}
            </div>
            {mode === 'date' && (
              <input
                type="date"
                value={dateVal}
                onChange={(event) => setDateVal(event.target.value)}
                className="mt-2 w-full min-h-[34px] px-1 text-caption outline-none bg-transparent text-ink rounded-pill border border-edge-strong"
              />
            )}
          </div>
        )}

        {/* 描述（可选）：textarea 而非 input —— 长描述要能换行、随内容增高 */}
        <div>
          <div className="text-caption text-ink-muted mb-1.5">描述（可选）</div>
          <textarea
            ref={descRef}
            value={desc}
            onChange={(event) => setDesc(event.target.value)}
            placeholder="补充细节、备注…"
            rows={1}
            className="w-full min-h-tap py-2 px-1 text-body leading-6 outline-none bg-transparent text-ink-faint resize-none"
          />
        </div>

        {/* 编辑态：删除入口 */}
        {task && (
          <button
            type="button"
            onClick={handleDelete}
            className="press mt-1 w-full min-h-[44px] rounded-card border border-edge-strong text-body text-heart inline-flex items-center justify-center gap-1.5"
          >
            <Icon name="trash" size={16} />
            删除这条
          </button>
        )}
      </div>
    </Sheet>
  );
}
