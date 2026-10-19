import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';

/**
 * 「同步到今日」的勾选框（时间轴页与任务页共用）。
 *
 * 不复用 `Tick`：那个组件的语义是「标记完成」，aria-label 与动效都围绕它；
 * 这里的语义是「选中以同步」。禁用态用**虚线框**而不是灰掉 ——
 * 灰勾选框像「坏了」，虚线框读作「这里不能选」。
 *
 * 🔴 宽度默认 24px（时间轴行首的紧凑位置）；任务页要对齐完成勾选的 38px 命中区，
 * 通过 `className` 传 `min-w-[38px] min-h-tap`，不要在这里写死。
 */
export function SyncCheck({
  checked,
  disabled,
  title,
  className,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  title?: string;
  className?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={title}
      aria-label={checked ? '取消同步这一项' : '同步这一项'}
      aria-pressed={checked}
      className={clsx(
        'press w-6 shrink-0 self-center flex items-center justify-center',
        className,
      )}
    >
      <span
        className={clsx(
          'flex items-center justify-center w-[18px] h-[18px] rounded-xs border-[1.5px] transition-colors',
          checked
            ? 'border-transparent bg-accent text-accent-fg'
            : disabled
              ? 'border-dashed border-edge-strong'
              : 'border-edge-strong',
        )}
      >
        {checked && <Icon name="check" size={11} strokeWidth={2.8} />}
      </span>
    </button>
  );
}
