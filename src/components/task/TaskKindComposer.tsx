import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { todayKey } from '@/utils/date';

type DueMode = 'date' | RelativeDeadline;

/**
 * 新增态聚焦标题框的延迟：与 Sheet 入场动画时长（`--m-dur-3` = 280ms）对齐，
 * 动画基本播完再弹键盘，避开「动画中视口被压缩」的闪烁窗口。
 */
const FOCUS_DELAY_MS = 280;

interface TaskKindComposerProps {
  /** 'deadline' 才显示期限选择；'goal' 只有标题 + 描述 */
  kind: Exclude<TaskKind, 'daily'>;
  /** 传入即「编辑」模式，null 即「新增」模式 */
  task: Task | null;
  open: boolean;
  onClose: () => void;
  /**
   * 可选：追加段（如编辑态的图片附件区）。
   * 只在**编辑**时才有意义 —— 新任务此刻还没有 id，图片挂不上去。
   */
  children?: ReactNode;
}

/**
 * 期限任务 / 长时目标的「新增 / 编辑」抽屉。
 *
 * 设计要点（对应用户要求）：
 * - 选择时间之类的选项**只在打开这个抽屉时出现**；首页那两张卡片只是只读列表，列表里不能编辑。
 * - 新增与编辑共用同一套字段：标题、描述、（仅期限任务）期限（具体日期 / 三天内 / 一周内 / 两周内）。
 * - 编辑态底部多一个「删除」入口。
 */
export function TaskKindComposer({
  kind,
  task,
  open,
  onClose,
  children,
}: TaskKindComposerProps) {
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
  const titleRef = useRef<HTMLInputElement>(null);

  // 打开瞬间把表单同步到当前 task（新增则清空）。依赖 open 上升沿，避免编辑中回写表单
  useEffect(() => {
    if (!open) return;
    /*
      期限日期一律**先填上今天**再让用户改（而不是留空）。
      留空时控件显示成空白占位，加上曾经被全局 `appearance-none` 抹掉 UA 外观
      （见 styles/index.css 的 date input 例外），用户看到的就是「一条空白」；
      更糟的是空日期会让「添加」按钮一直禁用，看上去像坏了。
      给一个有值的起点，需要改时点一下就是今天所在的月份。
    */
    const today = todayKey();
    if (task) {
      setTitle(task.content);
      setDesc(task.description ?? '');
      if (task.dueDate) {
        setMode('date');
        setDateVal(task.dueDate);
      } else if (task.dueRelative) {
        setMode(task.dueRelative);
        setDateVal(today);
      } else {
        setMode('date');
        setDateVal(today);
      }
    } else {
      setTitle('');
      setDesc('');
      setMode('date');
      setDateVal(today);
    }
    // 只在我们重新打开时跑：open 上升沿 + 切到不同的 task
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  /*
    延迟聚焦标题框（新增态）。
    🔴 不用 `autoFocus` 属性：它会让键盘在抽屉入场动画（m-sheet-up 约 280ms）进行中
    就弹出，而 Capacitor 的 Keyboard.resize=native（adjustResize）会连布局视口一起
    压缩 —— fixed inset-0 的抽屉容器在半空中改变高度，配合 useKeyboardAvoid 在键盘
    弹起过渡帧里写入的瞬时 offset，面板位置就会跳一下，用户看到的就是「闪一下」
    （2026-10-16 用户报告，仅本抽屉有此问题，因为全项目只有这一处 autoFocus）。
    等动画基本播完再 focus：键盘弹起时面板已稳定，只剩一次正常的视口压缩。
  */
  useEffect(() => {
    if (!open || task) return;
    const timer = setTimeout(() => titleRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
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
            ref={titleRef}
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
              /*
                原生日期控件负责弹出系统日历（两条手指操作：点中间的字段区或右侧指示图标）。
                它必须看起来像一个**可以点的输入框**：有下沉底色、有明确边框、有足够高的点击区。
                样式上刻意保留 UA 外观（`styles/index.css` 里对 `[type=date]` 做了 appearance 例外）——
                一旦写成 appearance:none，这个控件在 Android / iOS WebView 上就是一条空白。
              */
              <input
                type="date"
                value={dateVal}
                onChange={(event) => setDateVal(event.target.value)}
                aria-label="截止日期"
                className="mt-2 w-full min-h-[38px] px-3 rounded-sm text-body tabular-nums outline-none text-ink bg-surface-sunken border border-edge-strong"
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

        {children}

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
