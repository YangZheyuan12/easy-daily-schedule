import { Sheet } from '@/components/ui/Sheet';
import { TASK_SECTION_KEYS, type TaskSectionKey } from '@/domain/enums';
import { taskSectionConfig } from '@/domain/constants';
import clsx from 'clsx';

interface SectionPickerSheetProps {
  open: boolean;
  /** 当前分组；null 表示没有选中任何任务（抽屉此时不会显示内容） */
  current: TaskSectionKey | null;
  onPick: (key: TaskSectionKey) => void;
  onClose: () => void;
}

/**
 * 任务的分组选择（五大分组：四大板块 + 其他）。
 *
 * 「其他」存在的意义：不是每件事都属于四大板块（「取个快递」既不是工作也不是学习）。
 * 没有它，用户只有两个选择 —— 硬塞进一个不对的板块，或者干脆不记。
 *
 * 底部那句说明是必须的：**「其他」不参与同步到今日页**这件事如果不写在这里，
 * 用户会以为自己漏操作了（点了同步却发现有些任务没过去）。
 */
export function SectionPickerSheet({ open, current, onPick, onClose }: SectionPickerSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="选择分组">
      <div className="pt-3">
        <div className="flex flex-wrap gap-2">
          {TASK_SECTION_KEYS.map((key) => {
            const config = taskSectionConfig(key);
            const active = key === current;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onPick(key);
                  onClose();
                }}
                className={clsx(
                  'press min-h-[38px] px-3 rounded-pill text-body border inline-flex items-center',
                  active
                    ? 'border-accent text-accent bg-accent-soft'
                    : 'border-surface-line text-ink-muted',
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: `rgb(var(${config.cssVar}))` }}
                  />
                  {config.name}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 px-0.5 text-caption text-ink-faint">
          四大板块的任务可以「同步到今日」，归到「其他」的不参与同步。
        </p>
      </div>
    </Sheet>
  );
}
