import { Popover } from '@/components/ui/Popover';
import type { RefObject } from 'react';
import type { TaskSectionKey } from '@/domain/enums';
import { useTaskSectionConfigs } from '@/hooks/useSectionConfigs';
import clsx from 'clsx';

interface SectionPickerPopoverProps {
  open: boolean;
  /** 当前分组；null 表示没有选中任何任务（浮层此时不会显示内容） */
  current: TaskSectionKey | null;
  onPick: (key: TaskSectionKey) => void;
  onClose: () => void;
  /** 分组胶囊按钮的 ref —— 气泡 portal 到 body 后仍贴着这颗按钮下方展开 */
  anchorRef: RefObject<HTMLElement | null>;
}

/**
 * 任务的分组选择（五大分组：四大板块 + 其他），**气泡浮层**形态。
 *
 * 「其他」存在的意义：不是每件事都属于四大板块（「取个快递」既不是工作也不是学习）。
 * 没有它，用户只有两个选择 —— 硬塞进一个不对的板块，或者干脆不记。
 *
 * 为什么从底部抽屉改成气泡：改分组是「点一下行内那颗色点、顺手选一个」的微操作，
 * 从屏幕底部升抽屉会把视线从手指所在的行拉到屏幕另一头。气泡长在分组按钮正下方
 * （`align="left"`，向左对齐展开），点完即散。
 *
 * 底部那句说明是必须的：**「其他」= 没分组、不参与同步到今日页**这件事如果不写在这里，
 * 用户会以为自己漏操作了（点了同步却发现有些任务没过去）。
 */
export function SectionPickerPopover({
  open,
  current,
  onPick,
  onClose,
  anchorRef,
}: SectionPickerPopoverProps) {
  // 分组名 / 色点取用户自定义后的板块配置（四大板块跟着改名改色，「其他」不变）
  const configs = useTaskSectionConfigs();

  return (
    <Popover
      open={open}
      onClose={onClose}
      width="236px"
      align="left"
      label="选择分组"
      anchorRef={anchorRef}
    >
      <div className="p-1.5">
        <div className="flex flex-wrap gap-1.5">
          {configs.map((config) => {
            const active = config.key === current;
            return (
              <button
                key={config.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onPick(config.key);
                  onClose();
                }}
                className={clsx(
                  'press min-h-[36px] px-2.5 rounded-pill text-meta border inline-flex items-center',
                  active
                    ? 'border-accent text-accent bg-accent-soft'
                    : 'border-surface-line text-ink-muted',
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-pill shrink-0"
                    style={{ backgroundColor: config.cssColor }}
                  />
                  {config.name}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2 px-0.5 text-caption leading-5 text-ink-faint">
          选四大板块的任务可以「同步到今日」；选「其他」= 不分组，不参与同步。
        </p>
      </div>
    </Popover>
  );
}
