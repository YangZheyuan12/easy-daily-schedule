import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { formatDateLabel, monthGrid, monthLabel, shiftMonthKey, todayKey } from '@/utils/date';
import clsx from 'clsx';

/** 月历首列是周一，表头与之一致 */
const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'] as const;

interface DatePickerModalProps {
  open: boolean;
  /** 当前选中的日期键（高亮用） */
  value: string;
  /** 选中某天 → 切换全局日期并关闭 */
  onSelect: (dateKey: string) => void;
  onClose: () => void;
}

/**
 * 居中日期选择弹窗。
 *
 * 点任意页面里的「日期」不再跳到日历 Tab（那种「滑到另一个 Tab」会让用户觉得
 * 换了导航、丢了当前页面上下文）。这里用**就地弹出的居中卡片**：选完只改全局日期，
 * 当前页面原地刷新到那一天，导航栏纹丝不动 —— 体感是「切了日期」，不是「换了页」。
 *
 * 网格复用 `monthGrid`（周一为首列、固定 42 格），与日历页完全一致，避免出现
 * 两套排布规则导致「弹窗里和日历里差一天」的错位。
 */
export function DatePickerModal({ open, value, onSelect, onClose }: DatePickerModalProps) {
  const [viewMonth, setViewMonth] = useState(() => value.slice(0, 7));

  // 每次打开都对齐到当前选中月，避免上一次翻到的月份残留
  const [synced, setSynced] = useState(false);
  if (open && !synced) {
    setViewMonth(value.slice(0, 7));
    setSynced(true);
  }
  if (!open && synced) setSynced(false);

  const cells = monthGrid(viewMonth);
  const today = todayKey();

  return (
    <Modal open={open} onClose={onClose} label="选择日期">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewMonth(shiftMonthKey(viewMonth, -1))}
            className="press min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
            aria-label="上个月"
          >
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="text-title font-semibold text-ink tabular-nums">{monthLabel(viewMonth)}</div>
          <button
            type="button"
            onClick={() => setViewMonth(shiftMonthKey(viewMonth, 1))}
            className="press min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
            aria-label="下个月"
          >
            <Icon name="chevron-right" size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_HEADERS.map((w) => (
            <div key={w} className="text-center text-caption text-ink-faint">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            const isSelected = cell.dateKey === value;
            const isTodayCell = cell.dateKey === today;
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => {
                  onSelect(cell.dateKey);
                  onClose();
                }}
                className={clsx(
                  'aspect-square rounded-sm flex items-center justify-center text-body tabular-nums transition-colors',
                  !cell.inMonth && 'text-ink-faint/50',
                  isSelected
                    ? 'bg-accent text-accent-fg font-medium'
                    : isTodayCell
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink hover:bg-surface-sunken',
                )}
                aria-label={formatDateLabel(cell.dateKey)}
                aria-pressed={isSelected}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              onSelect(today);
              onClose();
            }}
            className="press min-h-[34px] px-3 rounded-pill bg-surface-sunken text-meta text-ink-muted"
          >
            回到今天
          </button>
        </div>
      </div>
    </Modal>
  );
}
