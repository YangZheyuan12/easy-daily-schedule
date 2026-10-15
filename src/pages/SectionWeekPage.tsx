import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { SECTION_CONFIG_MAP, sectionColor } from '@/domain/constants';
import { isSectionKey, type SectionKey } from '@/domain/enums';
import { useDayStore } from '@/store/useDayStore';
import { useRangeStore } from '@/store/useRangeStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useItemStore } from '@/store/useItemStore';
import { persistence } from '@/store/bootstrap';
import { buildWeekSectionTimeline } from '@/services/weekViewService';
import { weekKeys, formatShortDate } from '@/utils/date';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Icon } from '@/components/ui/Icon';
import {
  EMPTY_FORM,
  SlotEditorSheet,
  type SlotForm,
} from '@/components/timeline/SlotEditorSheet';

/**
 * 板块周详情页（今日页田字格点某个板块进来）。
 *
 * 与田字格**唯一的区别是排序**：田字格按「先条目、后时间段」，
 * 这一页按**时间顺序** —— 它要回答的是「这周几点做了什么」，进来时用户脑子里问的是时间。
 *
 * 数据来自 `useRangeStore`（周区间只读快照，与周视图同一份），
 * 周范围由全局 `date` 派生（进入前在今日页看到的哪一周，这里就显示哪一周）。
 *
 * 🔴 内联增删：
 * - **增加**：与今日页「当日」视图**同一套界面** —— 每天底部一条内联快速添加
 *   （输入框 + 添加按钮，一次性带标题建成该板块顶层条目，见 `WeekDayAdd`）。
 *   加出来的条目是真实 `Item`，自然会出现在那天的「当日列表」（与 R-042 投影互不冲突）。
 * - **编辑 / 删除**：点一条带时间的记录 → 复用时间轴那套 `SlotEditorSheet` 改内容或删；
 *   点一条条目 → 跳板块树编辑页。两者都直接写库，写完强刷本周快照（`refreshRange`）。
 */
export function SectionWeekPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const date = useDayStore((s) => s.date);
  const setDate = useDayStore((s) => s.setDate);
  const rangeItems = useRangeStore((s) => s.items);
  const rangeSlots = useRangeStore((s) => s.slots);
  const loadRange = useRangeStore((s) => s.loadRange);
  const updateSlot = useTimeSlotStore((s) => s.updateSlot);
  const removeSlot = useTimeSlotStore((s) => s.removeSlot);
  const loadDate = useTimeSlotStore((s) => s.loadDate);

  const key: SectionKey = isSectionKey(sectionId) ? sectionId : 'work';
  const config = SECTION_CONFIG_MAP[key];

  const weekDays = useMemo(() => weekKeys(date), [date]);

  // 从今日页周视图进来时带 { mode: 'week' }；按左上角返回要回到**本周视图下的今日页**
  const backMode = (location.state as { mode?: string } | null)?.mode === 'week' ? 'week' : 'day';

  useEffect(() => {
    void loadRange(weekDays[0] ?? date, weekDays[6] ?? date);
  }, [weekDays, date, loadRange]);

  const timeline = useMemo(
    () => buildWeekSectionTimeline(rangeItems, rangeSlots, weekDays, key),
    [rangeItems, rangeSlots, weekDays, key],
  );

  /* —— 编辑既有时间段（点时间块进来）—— */
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM);

  const openEdit = (id: string) => {
    const slot = rangeSlots.find((s) => s.id === id);
    if (!slot) return;
    setDate(slot.date);
    void loadDate(slot.date);
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

  /** 写库后等落盘完成，再强制重读本周快照，本页即时反映新增 / 改动 / 删除 */
  const refreshRange = async () => {
    await persistence.scheduleImmediate();
    await loadRange(weekDays[0] ?? date, weekDays[6] ?? date, true);
  };

  const handleSave = () => {
    if (!form.id || form.content.trim().length === 0) return;
    updateSlot(form.id, {
      startMin: form.startMin,
      endMin: form.endMin,
      actualStartMin: form.actualStartMin,
      actualEndMin: form.actualEndMin,
      content: form.content.trim(),
      sectionId: form.sectionId,
    });
    setFormOpen(false);
    void refreshRange();
  };

  const handleDelete = () => {
    if (form.id) removeSlot(form.id);
    setFormOpen(false);
    void refreshRange();
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={`${config.name} · 本周`}
        subtitle={`${weekDays[0]} 起 · 完成 ${timeline.done}/${timeline.total}`}
        accent={sectionColor(config)}
        onBack={() => navigate('/today', { state: { mode: backMode } })}
      />

      <div className="flex-1 px-5 py-3 pb-24">
        {timeline.days.length === 0 ? (
          <EmptyState
            icon={<Icon name="task" size={40} className="text-ink-faint" />}
            title={`本周「${config.name}」还没有记录`}
            description="回到今日页的本周视图，点这个板块就能看到这一周的内容。"
          />
        ) : (
          <div className="space-y-3">
            {timeline.days.map((day) => (
              <section
                key={day.dateKey}
                className="rounded-card bg-surface border border-surface-line p-3"
              >
                <header className="flex items-center justify-between mb-1.5">
                  <span className="flex items-baseline gap-2">
                    <span className="text-body font-medium text-ink">{day.weekday}</span>
                    <span className="text-caption text-ink-faint tabular-nums">{day.dateLabel}</span>
                  </span>
                </header>
                <ul className="space-y-1">
                  {day.entries.map((entry) => (
                    <li key={entry.id}>
                      {entry.kind === 'timeSlot' ? (
                        <button
                          type="button"
                          onClick={() => openEdit(entry.id)}
                          className="press w-full flex items-start gap-2 text-left rounded-sm -mx-1 px-1 py-0.5"
                        >
                          <span
                            className={clsx(
                              'w-[88px] shrink-0 text-caption tabular-nums pt-0.5',
                              entry.done ? 'text-ink-faint' : 'text-ink-soft',
                            )}
                          >
                            {entry.timeLabel ?? '—'}
                          </span>
                          <span
                            className={clsx(
                              'text-body leading-5 break-all min-w-0',
                              entry.done ? 'text-ink-faint line-through' : 'text-ink',
                            )}
                          >
                            {entry.title}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/section/${key}?date=${day.dateKey}`)}
                          className="press w-full flex items-start gap-2 text-left rounded-sm -mx-1 px-1 py-0.5"
                        >
                          <span className="w-[88px] shrink-0 text-caption tabular-nums pt-0.5 text-ink-faint">
                            —
                          </span>
                          <span
                            className={clsx(
                              'text-body leading-5 break-all min-w-0',
                              entry.done ? 'text-ink-faint line-through' : 'text-ink',
                            )}
                          >
                            {entry.title}
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {/* 内联快速添加：与今日页「当日」视图同一套界面（一次性带标题建成顶层条目） */}
                <WeekDayAdd
                  dateKey={day.dateKey}
                  sectionKey={key}
                  placeholder={config?.placeholder ?? `记录一项${config.name}…`}
                  onAdded={refreshRange}
                />
              </section>
            ))}
          </div>
        )}
      </div>

      <SlotEditorSheet
        open={formOpen}
        form={form}
        isEditing={Boolean(form.id)}
        onChange={setForm}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setFormOpen(false)}
        dateLabel={
          form.id ? formatShortDate(rangeSlots.find((s) => s.id === form.id)?.date ?? date) : undefined
        }
      />
    </div>
  );
}

/**
 * 某一天的内联快速添加（与 `DiaryList` 的 `SectionGroup` 同构）：
 * 输入框 + 添加按钮，Enter 或点按钮提交 → `addSibling(null, date, section, content)`
 * 一次性建成该板块顶层条目。写完回传 `onAdded` 让父页强刷本周快照。
 */
function WeekDayAdd({
  dateKey,
  sectionKey,
  placeholder,
  onAdded,
}: {
  dateKey: string;
  sectionKey: SectionKey;
  placeholder: string;
  onAdded: () => void | Promise<void>;
}) {
  const addSibling = useItemStore((s) => s.addSibling);
  const [draft, setDraft] = useState('');
  const empty = draft.trim().length === 0;

  const submit = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    // 一次性带标题建成（非「先建空再改名」），与当日视图的快速添加完全一致
    addSibling(null, dateKey, sectionKey, content);
    setDraft('');
    void onAdded();
  };

  return (
    <div className="m-rise mt-2 flex items-center gap-2 h-10 px-3.5 rounded-sm bg-surface-sunken">
      <input
        data-testid={`week-add-${dateKey}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={placeholder}
        className="flex-1 min-w-0 text-body text-ink placeholder:text-ink-faint outline-none bg-transparent"
      />
      <button
        type="button"
        onClick={submit}
        disabled={empty}
        className={clsx(
          'press shrink-0 min-h-[32px] px-3.5 rounded-pill text-meta border',
          empty ? 'border-transparent text-ink-faint' : 'border-accent text-accent bg-accent-soft',
        )}
      >
        添加
      </button>
    </div>
  );
}
