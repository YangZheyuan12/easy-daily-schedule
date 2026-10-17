import { Icon } from '@/components/ui/Icon';
import { Tick } from '@/components/ui/Tick';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { Task } from '@/domain/types';
import type { TaskSectionKey } from '@/domain/enums';
import { OTHER_KEY } from '@/domain/enums';
import { useTaskSectionConfig } from '@/hooks/useSectionConfigs';
import { useTaskStore } from '@/store/useTaskStore';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { SectionPickerPopover } from '@/components/task/SectionPickerPopover';

interface TaskRowProps {
  task: Task;
  focused: boolean;
  /** 本行的分组气泡是否展开（同一时刻只可能有一行是 true，由页面持状态） */
  picking: boolean;
  onFocus: () => void;
  onEnter: () => void;
  /** 点分组标记 → 展开本行下方的分组气泡 */
  onOpenPicker: () => void;
  onPickSection: (key: TaskSectionKey) => void;
  onClosePicker: () => void;
  /**
   * 拖拽手柄（不传则整行不可拖）。
   * 由页面级的 `useDragSort` 统一下发：同屏只能有一个拖拽会话，
   * 各行自己拖自己的话，「哪张卡抬起来了」就会彻底失控。
   */
  handleProps?: { onPointerDown: (event: ReactPointerEvent) => void; style: CSSProperties };
  /** 本行此刻正被手指拖着（= 抬起的那一层） */
  dragging?: boolean;
}

/** 退场动效时长：与 `.m-row-exit` 的 `--m-dur-3` 对齐（JS 读不到 CSS 变量） */
const ROW_EXIT_MS = 280;

/**
 * 每日任务行：勾选 + 标题 + 一行「分组 / 描述」。
 *
 * 布局约定（用户定的）：
 * - **分组与描述同一行**，分组在前且只占一小块，描述框吃掉剩下的宽度；
 * - 上移 / 下移按钮已删除 —— 名次在这页里是弱需求，两个箭头平铺在每行右侧
 *   只会把静态排版打散，真正要换顺序时拖拽更直觉（二期再说）。
 */
export function TaskRow({
  task,
  focused,
  picking,
  onFocus,
  onEnter,
  onOpenPicker,
  onPickSection,
  onClosePicker,
  handleProps,
  dragging = false,
}: TaskRowProps) {
  const setContent = useTaskStore((s) => s.setContent);
  const setDescription = useTaskStore((s) => s.setDescription);
  const toggleDone = useTaskStore((s) => s.toggleDone);
  const remove = useTaskStore((s) => s.remove);

  /*
    标题与描述**都是**自动增高的 textarea，不是单行 input。
    一条任务写长了（「去图书馆把上周借的三本书还了顺便再借两本」）时，
    单行 input 会把超出部分横向吞掉 —— 光标往右跑、开头看不见，
    用户只能盲打。textarea + 自动增高让长句折行显示，输入到哪都看得见。
  */
  const titleRef = useAutoResizeTextarea(task.content);
  const descriptionRef = useAutoResizeTextarea(task.description ?? '');

  /*
    删除退场动效：软删是**即时**的（改 deletedAt 后这一行立刻从列表里消失），
    不播动画的话用户只看到「点了一下、整行没了」，不知道刚才那条去了哪。
    所以先标记 leaving（高度收拢 + 淡出，下面的行平滑上移补位），
    播完再真调 remove。撤销条照常出现，动画不挡撤销。
  */
  const [leaving, setLeaving] = useState(false);
  const exitTimer = useRef<number | null>(null);
  /** 分组胶囊按钮：气泡（portal 到 body）贴着它下方展开，滚动时跟着它走 */
  const groupButtonRef = useRef<HTMLButtonElement>(null);

  const requestDelete = () => {
    if (leaving) return; // 动画途中重复点只算一次
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => remove(task.id), ROW_EXIT_MS);
  };

  // 卸载时清掉未播完的定时器：行已经被父组件移除时不能再回调（ React 会警告 setState on unmounted）
  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (focused) titleRef.current?.focus();
  }, [focused, titleRef]);

  // 分组名 / 色点取用户自定义后的板块配置（「其他」仍是空心圈，不受影响）
  const section = useTaskSectionConfig(task.sectionId);
  /** 「其他」= 没分组：画成空心圈，跟四个板块的实心色点在形态上就区分开 */
  const ungrouped = task.sectionId === OTHER_KEY;
  const label = ungrouped ? '未分组' : section.name;

  /*
    第二行的显示时机：聚焦 / 已有描述 / 已归到某个具体分组。
    最后一条是必须的 —— 分组标记现在住在第二行，若只在「有描述」时才显示，
    归了组但没写描述的任务就完全看不出自己属于哪一块。
  */
  const showMeta = focused || (task.description?.length ?? 0) > 0 || !ungrouped;

  return (
    <div
      className={clsx(
        'm-row-exit rounded-card',
        leaving && 'is-leaving',
        // 拖起来的那一层：脱离纸面 + 抱一点光 —— 「这张卡此刻不在列表里，在手上」
        dragging && 'bg-surface shadow-card ring-1 ring-accent/30',
      )}
    >
      <div className="flex flex-col">
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
            onFocus={onFocus}
            onKeyDown={(event) => {
              // Enter 仍然 = 新建下一条（不换行）：任务标题是「一件事」，没有多行语义
              if (event.key === 'Enter') {
                event.preventDefault();
                onEnter();
              }
              // 清空后按退格 = 删掉这一行（和各大待办应用一致），同样播退场动效
              if (event.key === 'Backspace' && task.content === '') {
                event.preventDefault();
                requestDelete();
              }
            }}
            placeholder="今天要做什么…"
            rows={1}
            className={clsx(
              // 16px 与日记体顶层条目同档 —— 任务页和今日页的「一条事」必须是同一个分量
              'm-strike-ink flex-1 min-w-0 min-h-tap py-2.5 px-1 text-lead leading-6 outline-none bg-transparent resize-none',
              task.done ? 'text-ink-faint' : 'text-ink',
            )}
            data-done={task.done}
            enterKeyHint="enter"
          />

          {/*
            拖拽手柄。放在删除按钮左边、始终可见（不像删除那样只在聚焦时出现）——
            顺序是列表的固有属性，「能不能拖」必须一眼看得见，而不是先聚焦才出现。
            35px 宽刚好是一根手指落下的最小横向余量，再窄就会误点到删除键。
          */}
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

          {/* 删除仅在聚焦该行时出现，避免静态排版被工具按钮打散 */}
          <button
            type="button"
            onClick={requestDelete}
            title="删除这条任务"
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
          /* 横向中心对齐：分组胶囊与描述框都是 34px 高的一条，顶部对齐会让
             描述的第一行比组名高出一截，看起来像没对齐的两排 */
          <div className="flex items-center gap-1.5 ml-[38px] -mt-0.5 mb-1.5">
            {/*
              分组：这一行属于哪一块，以及改它的入口。
              占较小位置（色点 + 组名，最宽 76px），剩下的宽度全给描述框。
              10px 的点是最小可辨识尺寸 —— 再小就像个污点，看不出是可以点的。

              外层 relative 是气泡的锚点：浮层贴着这颗胶囊的下缘、左缘展开
              （见 SectionPickerPopover 的 align="left"），手指点哪、菜单就长在哪。
            */}
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
                current={task.sectionId}
                onPick={onPickSection}
                onClose={onClosePicker}
                anchorRef={groupButtonRef}
              />
            </div>

            {/*
              描述：用 textarea 而不是 input —— 长描述要能换行、能自动增高，
              单行 input 会把超出部分横向吞掉（写一个长句就看不见开头了）。
            */}
            <textarea
              ref={descriptionRef}
              value={task.description ?? ''}
              onChange={(event) => setDescription(task.id, event.target.value)}
              onFocus={onFocus}
              placeholder="描述（可选）"
              rows={1}
              className="m-strike-ink flex-1 min-w-0 min-h-[34px] py-1.5 px-1 text-caption leading-5 outline-none bg-transparent text-ink-faint resize-none"
              data-done={task.done}
            />
          </div>
        )}
      </div>
    </div>
  );
}
