import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { SectionKey } from '@/domain/enums';
import { SECTION_CONFIGS, SECTION_CONFIG_MAP, sectionColor, sectionTint } from '@/domain/constants';
import type { TimeSlot } from '@/domain/types';
import { useDayStore } from '@/store/useDayStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useUiStore } from '@/store/useUiStore';
import { DateNavigator } from '@/components/date/DateNavigator';
import { Sheet, SheetActionButton } from '@/components/ui/Sheet';
import { TimeRuler } from '@/components/ui/TimeRuler';
import { ReminderBanner } from '@/components/reminder/ReminderBanner';
import { listDueSlots } from '@/services/reminderService';
import { useNowMin } from '@/hooks/useNowMin';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';
import { staggerDelay } from '@/utils/motion';
import { formatTimeRange, minToHHMM } from '@/utils/date';

interface SlotForm {
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

const EMPTY_FORM: SlotForm = {
  id: null,
  startMin: 9 * 60,
  endMin: 0,
  actualStartMin: null,
  actualEndMin: null,
  content: '',
  sectionId: null,
};

/** 时间轴页面：按天编排时间段，tap 勾选完成、点行编辑 / 删除。 */
export function TimelinePage() {
  const navigate = useNavigate();
  const date = useDayStore((s) => s.date);
  const shiftDate = useDayStore((s) => s.shiftDate);
  const goToday = useDayStore((s) => s.goToday);
  const slots = useTimeSlotStore((s) => s.slots);
  const addSlot = useTimeSlotStore((s) => s.addSlot);
  const updateSlot = useTimeSlotStore((s) => s.updateSlot);
  const toggleDone = useTimeSlotStore((s) => s.toggleDone);
  const removeSlot = useTimeSlotStore((s) => s.removeSlot);
  const pushToast = useUiStore((s) => s.pushToast);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM);
  const nowMin = useNowMin();

  // 软删的时间段不渲染（删除即隐藏，与 AppShell 的 loadDate 过滤口径一致）
  const visibleSlots = slots.filter((slot) => slot.deletedAt === null);
  // 已到计划时间且未完成的（用于行高亮；看非今天时 nowMin 无意义，高亮自然不触发）
  const dueIds = new Set(listDueSlots(visibleSlots, nowMin).map((slot) => slot.id));

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setFormOpen(true);
  };

  const openEdit = (slot: TimeSlot) => {
    setForm({
      id: slot.id,
      startMin: slot.startMin,
      endMin: slot.endMin,
      actualStartMin: slot.actualStartMin,
      actualEndMin: slot.actualEndMin,
      content: slot.content,
      sectionId: slot.sectionId,
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    // 保存按钮在内容为空时是禁用的，这里是第二道闸（快捷键 / 程序化调用也拦得住）
    if (form.content.trim().length === 0) return;
    if (form.id) {
      updateSlot(form.id, {
        startMin: form.startMin,
        endMin: form.endMin,
        actualStartMin: form.actualStartMin,
        actualEndMin: form.actualEndMin,
        content: form.content.trim(),
        sectionId: form.sectionId,
      });
      pushToast('已保存');
    } else {
      addSlot({
        date,
        startMin: form.startMin,
        endMin: form.endMin,
        content: form.content.trim(),
        sectionId: form.sectionId,
      });
    }
    setFormOpen(false);
  };

  const handleDelete = () => {
    if (form.id) removeSlot(form.id);
    setFormOpen(false);
  };

  return (
    <div className="flex flex-col min-h-full pb-28">
      {/* 概念稿 C3：这一屏直接以日期导航开场，不放页面大标题 */}
      <DateNavigator
        date={date}
        onPrev={() => shiftDate(-1)}
        onNext={() => shiftDate(1)}
        onToday={goToday}
        onDateClick={() => navigate('/calendar', { state: { pickDateFrom: '/timeline' } })}
      />

      <ReminderBanner />

      <div className="px-5 mt-3">
        {visibleSlots.length === 0 ? (
          <div className="rounded-card bg-surface border border-surface-line p-6 text-center text-body text-ink-faint">
            还没有排时间段，点下面「添加时间段」开始规划。
          </div>
        ) : (
          /* 概念稿 C2：轴式布局 —— 左侧计划时间列 + 中轴节点/连线 + 右侧时间块卡片 */
          <ul>
            {visibleSlots.map((slot, index) => {
              const config = slot.sectionId ? SECTION_CONFIG_MAP[slot.sectionId] : null;
              return (
                <li
                  key={slot.id}
                  className="m-rise flex gap-2.5"
                  style={{ animationDelay: staggerDelay(index) }}
                >
                  {/* 计划时间列。宽度 100px 是为了 14px 下的「09:00–10:00」不会折行 */}
                  <span
                    className={clsx(
                      'w-[100px] shrink-0 pt-4 text-meta leading-5 text-right tabular-nums',
                      slot.done ? 'text-ink-faint' : 'text-ink-soft',
                    )}
                  >
                    {formatTimeRange(slot.startMin, slot.endMin)}
                  </span>

                  {/* 中轴：节点（完成=实心）+ 贯穿连线 */}
                  <AxisNode done={slot.done} onToggle={() => toggleDone(slot.id)} />

                  {/* 时间块卡片 */}
                  <button
                    type="button"
                    onClick={() => openEdit(slot)}
                    className={clsx(
                      'press flex-1 min-w-0 text-left my-2 rounded-sm px-3.5 py-3',
                      dueIds.has(slot.id)
                        ? 'bg-orange-50'
                        : slot.done
                          ? 'bg-surface-sunken'
                          : 'bg-surface border border-surface-line shadow-card',
                    )}
                  >
                    <div
                      className={clsx(
                        'text-lead leading-6 truncate',
                        slot.done ? 'text-ink-faint' : 'text-ink',
                      )}
                    >
                      <span className="m-strike" data-done={slot.done}>
                        {slot.content || '未命名时间段'}
                      </span>
                    </div>
                    {(config || slot.actualStartMin !== null) && (
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        {config && (
                          <span
                            className="text-caption px-1.5 py-0.5 rounded-pill inline-flex items-center gap-1.5"
                            style={{
                              backgroundColor: sectionTint(config),
                              color: sectionColor(config),
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: sectionColor(config) }}
                            />
                            {config.name}
                          </span>
                        )}
                        {slot.actualStartMin !== null && (
                          <span className="text-caption text-ink-faint tabular-nums">
                            实际 {formatTimeRange(slot.actualStartMin, slot.actualEndMin ?? 0)}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 主操作固定在 Tab Bar 之上，滚动时始终可达 */}
      <div className="fixed inset-x-0 bottom-[100px] flex justify-center px-5 pointer-events-none">
        <div className="w-full max-w-[430px] pointer-events-auto">
          <button
            type="button"
            onClick={openAdd}
            className="press w-full min-h-[46px] rounded-pill bg-accent text-accent-fg text-lead"
          >
            + 添加时间段
          </button>
        </div>
      </div>

      <SlotEditorSheet
        open={formOpen}
        form={form}
        isEditing={Boolean(form.id)}
        onChange={setForm}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}

interface SlotEditorSheetProps {
  open: boolean;
  form: SlotForm;
  isEditing: boolean;
  onChange: (form: SlotForm) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

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

/**
 * 时间段编辑抽屉。
 *
 * 时间选择从原生 `<input type="time">` 换成了**可滑动的时间刻度尺**（`TimeRuler`）：
 * 原生控件在桌面端弹出的系统面板是全应用唯一不跟主题的地方，手机端又会盖住半个屏幕，
 * 而排时间段最需要的恰恰是「看到前后几小时的上下文」。
 * 现在四个时间字段用 chip 排成 2×2，刻度尺编辑当前选中的那个，
 * 悬停任一时刻会放大加深、点击即选中 —— 见 `TimeRuler` 的注释。
 */
function SlotEditorSheet({
  open,
  form,
  isEditing,
  onChange,
  onSave,
  onDelete,
  onClose,
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

/**
 * 轴上的节点：完成 = 实心重音，未完成 = 空心。
 * 切换时弹一下（和其他勾选框同一套微反馈），否则这颗 8px 的点是「变」还是「没变」很难察觉。
 */
function AxisNode({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  const popped = useRecentlyChanged(done);

  return (
    <div className="relative w-5 shrink-0 flex flex-col items-center">
      <span className="absolute top-0 bottom-0 w-0.5 bg-surface-line" aria-hidden />
      <button
        type="button"
        onClick={onToggle}
        className="relative min-h-[40px] w-full flex items-start justify-center pt-[18px]"
        aria-label={done ? '标记为未完成' : '标记为已完成'}
      >
        <span
          className={clsx(
            'w-2 h-2 rounded-pill transition-colors',
            done ? 'bg-accent' : 'border-[1.5px] border-edge-strong bg-app',
            popped && 'm-pop-soft',
          )}
        />
      </button>
    </div>
  );
}
