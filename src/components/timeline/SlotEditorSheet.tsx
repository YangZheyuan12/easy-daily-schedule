import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { SectionKey } from '@/domain/enums';
import { SECTION_CONFIGS, sectionColor } from '@/domain/constants';
import { Sheet, SheetActionButton } from '@/components/ui/Sheet';
import { TimeRuler } from '@/components/ui/TimeRuler';
import { minToHHMM } from '@/utils/date';

/**
 * 时间段编辑抽屉。
 *
 * 从 TimelinePage 抽出来是为了让**周视图也能复用同一套编辑交互** ——
 * 课程表里点一个块，弹出的必须是同一个抽屉，否则用户在两个视图里
 * 会遇到两套时间选择方式（一套刻度尺、一套别的），那是最难用的那种不一致。
 *
 * 时间选择从原生 `<input type="time">` 换成了**可滑动的时间刻度尺**（`TimeRuler`）：
 * 原生控件在桌面端弹出的系统面板是全应用唯一不跟主题的地方，手机端又会盖住半个屏幕，
 * 而排时间段最需要的恰恰是「看到前后几小时的上下文」。
 */

export interface SlotForm {
  id: string | null;
  startMin: number;
  endMin: number;
  /** 实际开始（记录用）；null = 未记录 */
  actualStartMin: number | null;
  /** 实际结束（记录用）；null = 未记录 */
  actualEndMin: number | null;
  content: string;
  sectionId: SectionKey | null;
}

export const EMPTY_FORM: SlotForm = {
  id: null,
  startMin: 9 * 60,
  endMin: 0,
  actualStartMin: null,
  actualEndMin: null,
  content: '',
  sectionId: null,
};

/** 时间段里的四个时间字段。刻度尺一次只编辑一个，靠 chip 指定「现在在改谁」 */
type TimeFieldKey = 'start' | 'end' | 'actualStart' | 'actualEnd';

const TIME_FIELDS: readonly { key: TimeFieldKey; label: string }[] = [
  { key: 'start', label: '开始' },
  { key: 'end', label: '结束' },
  { key: 'actualStart', label: '实际开始' },
  { key: 'actualEnd', label: '实际结束' },
];

/** 字段当前值。`endMin = 0` / `null` 都是「未设置」，统一收敛成 null */
function readField(form: SlotForm, key: TimeFieldKey): number | null {
  switch (key) {
    case 'start':
      return form.startMin;
    case 'end':
      return form.endMin === 0 ? null : form.endMin;
    case 'actualStart':
      return form.actualStartMin;
    case 'actualEnd':
      return form.actualEndMin;
  }
}

/** 字段未设置时，刻度尺该停在哪儿（只是预览，用户不动它就不会写库） */
function seedField(form: SlotForm, key: TimeFieldKey): number {
  const clamp = (min: number) => Math.min(23 * 60 + 55, Math.max(0, min));
  switch (key) {
    case 'start':
      return form.startMin;
    case 'end':
      return clamp(form.endMin === 0 ? form.startMin + 60 : form.endMin);
    case 'actualStart':
      return form.actualStartMin ?? form.startMin;
    case 'actualEnd':
      return form.actualEndMin ?? (form.endMin !== 0 ? form.endMin : clamp(form.startMin + 60));
  }
}

interface SlotEditorSheetProps {
  open: boolean;
  form: SlotForm;
  isEditing: boolean;
  onChange: (form: SlotForm) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** 所属日期（展示用，让用户在周视图里也能确认自己在改哪一天） */
  dateLabel?: string;
}

export function SlotEditorSheet({
  open,
  form,
  isEditing,
  onChange,
  onSave,
  onDelete,
  onClose,
  dateLabel,
}: SlotEditorSheetProps) {
  const [activeField, setActiveField] = useState<TimeFieldKey>('start');

  /*
    每次抽屉打开都把「正在编辑的字段」复位到「开始」。
    这个组件在关闭时并不卸载（要靠 Sheet 播完退场动画），所以不复位的话，
    上次在改「实际结束」的用户下次点「添加时间段」会发现刻度尺还在改实际结束 —— 没有道理。
  */
  useEffect(() => {
    if (open) setActiveField('start');
  }, [open]);
  const patch = (p: Partial<SlotForm>) => onChange({ ...form, ...p });

  const contentEmpty = form.content.trim().length === 0;
  const activeValue = readField(form, activeField);
  const activeLabel = TIME_FIELDS.find((f) => f.key === activeField)?.label ?? '';

  /*
    写入时间。两条不变量，都是「拖一端会把另一端顶走」而不是留下非法区间：
    · 结束不能早于开始 —— 否则会存出一个「09:00–08:00」的负区间（旧的原生输入框就是这样静默产生的）；
    · 实际结束同理。
    「顶走」比「静默允许」好：用户看到的是两端一起让位，而不是一个看起来像 bug 的区间。
  */
  const writeField = (min: number) => {
    switch (activeField) {
      case 'start':
        patch({
          startMin: min,
          endMin: form.endMin !== 0 && form.endMin <= min ? min : form.endMin,
        });
        return;
      case 'end':
        patch({
          startMin: min <= form.startMin ? min : form.startMin,
          endMin: min,
        });
        return;
      case 'actualStart':
        patch({
          actualStartMin: min,
          actualEndMin:
            form.actualEndMin !== null && form.actualEndMin <= min ? min : form.actualEndMin,
        });
        return;
      case 'actualEnd':
        patch({
          actualStartMin:
            form.actualStartMin !== null && min <= form.actualStartMin
              ? min
              : form.actualStartMin,
          actualEndMin: min,
        });
        return;
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? '编辑时间段' : '添加时间段'}
      action={
        <SheetActionButton onClick={onSave} disabled={contentEmpty}>
          保存
        </SheetActionButton>
      }
    >
      <div className="pt-3 space-y-4">
        {/* 周视图里点某个块进来时，必须能确认自己改的是哪一天（课程表一周七列很容易点错列） */}
        {dateLabel && <p className="text-caption text-ink-faint">所属日期：{dateLabel}</p>}
        {/* —— 时间：2×2 chip + 可滑动刻度尺 —— */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-meta font-medium text-ink-muted">时间</span>
            <button
              type="button"
              onClick={() =>
                patch({ actualStartMin: form.startMin, actualEndMin: form.endMin })
              }
              className="press text-body text-accent px-2 min-h-[34px] rounded-pill"
            >
              实际时间 = 计划时间
            </button>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {TIME_FIELDS.map((field) => {
              const value = readField(form, field.key);
              const active = field.key === activeField;
              return (
                <button
                  key={field.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveField(field.key)}
                  className={clsx(
                    'text-left rounded-sm border px-3 py-2',
                    'transition-[transform,border-color,background-color] duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
                    'active:scale-[0.98]',
                    active ? 'border-accent bg-accent-soft' : 'border-surface-line bg-surface-sunken',
                  )}
                >
                  <span className="block text-caption text-ink-muted">{field.label}</span>
                  <span
                    className={clsx(
                      'block text-lead tabular-nums leading-6',
                      value === null ? 'text-ink-faint' : 'text-ink',
                    )}
                  >
                    {value === null ? '--:--' : minToHHMM(value)}
                  </span>
                </button>
              );
            })}
          </div>

          <TimeRuler
            fieldKey={activeField}
            fieldLabel={`${activeLabel}时间`}
            value={activeValue ?? seedField(form, activeField)}
            pending={activeValue === null}
            onChange={writeField}
          />
          <p className="mt-1 px-0.5 text-caption text-ink-faint">
            拖动或点击刻度选时间，也可以 Shift + 滚轮横向浏览
          </p>
        </div>

        {/* —— 内容 —— */}
        <label className="block">
          <span className="flex items-center justify-between">
            <span className="text-meta font-medium text-ink-muted">内容</span>
            {contentEmpty && <span className="text-caption text-ink-faint">必填</span>}
          </span>
          <textarea
            value={form.content}
            onChange={(e) => patch({ content: e.target.value })}
            rows={3}
            placeholder="这段时间做什么？"
            className="mt-1 w-full min-h-[76px] text-body leading-6 text-ink placeholder:text-ink-faint outline-none bg-surface-sunken rounded-sm px-3 py-2"
          />
        </label>

        {/* —— 可选板块 —— */}
        <div>
          <span className="text-meta font-medium text-ink-muted">可选板块</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => patch({ sectionId: null })}
              className={clsx(
                'press min-h-[38px] px-3 rounded-pill text-body border',
                form.sectionId === null
                  ? 'border-accent text-accent bg-accent-soft'
                  : 'border-surface-line text-ink-muted',
              )}
            >
              无
            </button>
            {SECTION_CONFIGS.map((config) => (
              <button
                key={config.key}
                type="button"
                onClick={() => patch({ sectionId: config.key as SectionKey })}
                className={clsx(
                  'press min-h-[38px] px-3 rounded-pill text-body border',
                  form.sectionId === config.key
                    ? 'border-accent text-accent bg-accent-soft'
                    : 'border-surface-line text-ink-muted',
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: sectionColor(config) }}
                  />
                  {config.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isEditing && (
          <button
            type="button"
            onClick={onDelete}
            className="press w-full min-h-tap rounded-card border border-heart/30 text-lead text-heart"
          >
            删除这个时间段
          </button>
        )}
      </div>
    </Sheet>
  );
}
