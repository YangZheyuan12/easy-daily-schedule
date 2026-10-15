import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { DiaryEntry, DiaryGroup } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { SECTION_CONFIG_MAP, sectionColor, sectionTint } from '@/domain/constants';
import { Icon } from '@/components/ui/Icon';
import { Tick } from '@/components/ui/Tick';
import { buildDiaryList } from '@/services/diaryService';
import { useInspirationStore } from '@/store/useInspirationStore';
import { useItemStore } from '@/store/useItemStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useTodayHiddenStore } from '@/store/useTodayHiddenStore';
import { useItemImageStore, EMPTY_IMAGES } from '@/store/useItemImageStore';
import { ImageThumb } from '@/components/item/ImageThumb';
import { ImageLightbox } from '@/components/item/ImageLightbox';
import { minToHHMM } from '@/utils/date';
import { staggerDelay } from '@/utils/motion';

interface DiaryListProps {
  date: string;
}

/**
 * 主页日记体统一列表：四板块（树形 + 跨组连续编号）+ 灵感（纯文字）一组。
 *
 * 形态对齐概念稿 C1：**平铺在页面底色上，不再套卡片** —— 组头是一行
 * 「色点 + 组名 + 计数」小标签，条目直接排下来，每组底部一行下沉底的
 * 内联快速添加胶囊。分组之间靠留白呼吸，不靠边框。
 *
 * 取代原先的四张 SectionCard 网格 —— 把「今天做了什么 / 想到什么」按日记顺序
 * 串成一条，编号只是展示用的派生值，不写库。
 *
 * 四板块的每一行有两类来源：**本板块的条目**（可勾选、可增删）与
 * **时间轴里归到本板块的时间段**（投影进来，勾选直接写回时间轴那条记录）。
 * 投影进来的时间段，在今日视图内可「隐藏」（仅本日视图，不回写时间轴记录）。
 */
export function DiaryList({ date }: DiaryListProps) {
  const navigate = useNavigate();
  const items = useItemStore((s) => s.items);
  const inspirations = useInspirationStore((s) => s.inspirations);
  const slots = useTimeSlotStore((s) => s.slots);

  const groups = useMemo(
    () => buildDiaryList(items, inspirations, slots),
    [items, inspirations, slots],
  );

  // 加载当天所有条目的图片附件；key 用「条目 id 串」去重，
  // 切到别的日期 / 增删条目会触发重新拉取，单纯勾选不会（id 串不变）。
  const loadImages = useItemImageStore((s) => s.loadForItems);
  const itemIdsKey = useMemo(() => items.map((item) => item.id).join(','), [items]);
  useEffect(() => {
    void loadImages(
      items.map((item) => item.id),
      itemIdsKey,
    );
  }, [date, itemIdsKey, loadImages, items]);

  return (
    <div className="space-y-4">
      {groups.map((group) =>
        group.key === 'inspiration' ? (
          <InspirationGroup key={group.key} group={group} date={date} />
        ) : (
          <SectionGroup
            key={group.key}
            group={group}
            date={date}
            onNavigate={(sectionId) => navigate(`/section/${sectionId}?date=${date}`)}
            onOpenTimeline={() => navigate('/timeline')}
          />
        ),
      )}
    </div>
  );
}

interface SectionGroupProps {
  group: DiaryGroup;
  date: string;
  onNavigate: (sectionId: string) => void;
  /** 点「来自时间轴」的那一行 → 去时间轴页编辑（板块页只有条目树，改不到时间段） */
  onOpenTimeline: () => void;
}

/**
 * 四板块组：色点 + 组名 + 条目数，组头点击跳板块详情（树形编辑入口保留）；
 * 内部是编号条目与子项，底部恒定一行内联快速添加（与灵感组同构）。
 */
function SectionGroup({ group, date, onNavigate, onOpenTimeline }: SectionGroupProps) {
  const config = SECTION_CONFIG_MAP[group.key as keyof typeof SECTION_CONFIG_MAP];
  const addSibling = useItemStore((s) => s.addSibling);
  const setHidden = useTodayHiddenStore((s) => s.setHidden);
  // 订阅 hidden 数组，隐藏状态变化时本组重渲染
  const hiddenList = useTodayHiddenStore((s) => s.hidden);
  const isHidden = (slotId: string) => hiddenList.includes(`${date}|${slotId}`);

  // 行内缩略图条点开的全屏大图
  const [lightboxBlob, setLightboxBlob] = useState<Blob | null>(null);

  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    // anchorId=null → 追加为该板块顶层末尾；一次性带标题建成（非「先建空再改名」）
    addSibling(null, date, group.key as SectionKey, content);
    setDraft('');
    inputRef.current?.focus();
  };

  const empty = draft.trim().length === 0;

  /*
    投影进来的时间段如果在本日视图被「隐藏」，就从可见列表里过滤掉。
    visibleEntries 同时用于渲染与计数，因此计数与展示严格一致。
  */
  const visibleEntries = group.entries.filter(
    (e) => !(e.kind === 'timeSlot' && e.timeSlot && isHidden(e.timeSlot.id)),
  );
  /** 本组本日被隐藏的时间段 id（用于「恢复隐藏」入口） */
  const hiddenIds = group.entries
    .filter((e) => e.kind === 'timeSlot' && e.timeSlot && isHidden(e.timeSlot.id))
    .map((e) => e.timeSlot!.id);

  /*
    组头计数 = 本板块顶层条目 + 归到本板块的时间段（两者都编号、都算一件「要做的事」）。
    口径与日历摘要卡 `DaySummary.sections` 一致。这里只数**可见**的（隐藏的不计入，也不显示）。
  */
  const topEntries = visibleEntries.filter((e) => e.kind === 'item' || e.kind === 'timeSlot');
  const doneCount = topEntries.filter((e) => e.item?.done ?? e.timeSlot?.done ?? false).length;
  const totalCount = topEntries.length;
  const placeholder = config?.placeholder ?? `记录一项${group.name}…`;

  return (
    <section>
      {/*
        组头：色点 + 组名 + 「完成数/总数」。
        层级关系是刻意的 —— 组头 18px Semibold（重墨）必须**明显重于**它下面的
        条目（16px）与内联添加（15px 弱化色），这样扫一眼就知道「这一段属于谁」。
        色点也跟着放大到 8px，否则 18px 的标题旁边一颗 6px 的点会显得没长齐。
      */}
      <button
        type="button"
        onClick={() => onNavigate(String(group.key))}
        className="w-full h-8 flex items-center gap-2 text-left active:opacity-60"
      >
        <span
          className="w-2 h-2 rounded-pill shrink-0"
          style={{ backgroundColor: config ? sectionColor(config) : 'rgb(var(--c-ink-faint))' }}
        />
        <span className="text-heading font-semibold text-ink">{group.name}</span>
        <span className="ml-auto text-caption text-ink-faint tabular-nums">
          {totalCount === 0 ? '—' : `${doneCount}/${totalCount}`}
        </span>
      </button>

      {visibleEntries.length > 0 && (
        <ul>
          {visibleEntries.map((entry, index) => (
            <DiaryRow
              key={entry.item?.id ?? entry.inspiration?.id ?? entry.timeSlot?.id}
              entry={entry}
              index={index}
              onNavigate={onNavigate}
              onOpenTimeline={onOpenTimeline}
              onViewImage={(blob) => setLightboxBlob(blob)}
              onHide={
                entry.kind === 'timeSlot' && entry.timeSlot
                  ? () => setHidden(date, entry.timeSlot!.id, true)
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      {/* 本组本日有被隐藏的时间段 → 给一个恢复入口（记录没真删，去时间轴也还在） */}
      {hiddenIds.length > 0 && (
        <button
          type="button"
          onClick={() => hiddenIds.forEach((id) => setHidden(date, id, false))}
          className="mt-1.5 press flex items-center gap-1.5 text-caption text-ink-faint"
        >
          <Icon name="trash" size={13} className="text-ink-faint" />
          已在本日隐藏 {hiddenIds.length} 条，点此恢复
        </button>
      )}

      {/* 内联快速添加：下沉底胶囊行，输入 + 添加（Enter 或点按钮提交） */}
      <div
        className="m-rise mt-2 flex items-center gap-2 h-10 px-3.5 rounded-sm bg-surface-sunken"
        style={{ animationDelay: staggerDelay(visibleEntries.length) }}
      >
        <input
          ref={inputRef}
          data-testid={`diary-inline-add-${group.key}`}
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
          style={
            empty || !config
              ? undefined
              : {
                  borderColor: sectionColor(config),
                  color: sectionColor(config),
                  backgroundColor: sectionTint(config),
                }
          }
          className={clsx(
            'press shrink-0 min-h-[32px] px-3.5 rounded-pill text-meta border',
            empty ? 'border-transparent text-ink-faint' : '',
          )}
        >
          添加
        </button>
      </div>

      <ImageLightbox blob={lightboxBlob} onClose={() => setLightboxBlob(null)} />
    </section>
  );
}

/** 灵感组：恒存在（即使为空），纯文字条目 + 底部快速添加。 */
function InspirationGroup({ group, date }: { group: DiaryGroup; date: string }) {
  const add = useInspirationStore((s) => s.add);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const content = draft.trim();
    if (content.length === 0) return;
    add(date, content);
    setDraft('');
    inputRef.current?.focus();
  };

  const empty = draft.trim().length === 0;

  return (
    <section>
      {/* 灵感组头与四板块同构：同字号、同字重，只有身份标记从色点换成灯泡 */}
      <div className="h-8 flex items-center gap-2">
        <Icon name="bulb" size={16} className="text-star shrink-0" />
        <span className="text-heading font-semibold text-ink">{group.name}</span>
        <span className="ml-auto text-caption text-ink-faint tabular-nums">
          {group.entries.length > 0 ? `${group.entries.length} 条` : '—'}
        </span>
      </div>

      <ul>
        {group.entries.map((entry, index) => (
          <li
            key={entry.inspiration?.id}
            className="m-rise flex items-center gap-2.5 py-1.5"
            style={{ animationDelay: staggerDelay(index) }}
          >
            <Icon name="bulb" size={14} className="text-star shrink-0" />
            <span className="flex-1 min-w-0 text-body leading-6 text-ink-muted break-words">
              {entry.inspiration?.content}
            </span>
          </li>
        ))}

        {/* 快速添加：加号 + 输入 + 添加（Enter 或点按钮提交） */}
        <li
          className="m-rise flex items-center gap-2 py-1.5"
          style={{ animationDelay: staggerDelay(group.entries.length) }}
        >
          <Icon name="plus" size={14} className="text-ink-faint shrink-0" />
          <input
            ref={inputRef}
            data-testid="diary-inline-add-inspiration"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="记录一条灵感…"
            className="flex-1 min-w-0 text-body text-ink placeholder:text-ink-faint outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={submit}
            disabled={empty}
            className={clsx(
              'press shrink-0 min-h-[32px] px-3.5 rounded-pill text-meta border',
              empty
                ? 'border-transparent text-ink-faint'
                : 'border-accent text-accent bg-accent-soft',
            )}
          >
            添加
          </button>
        </li>
      </ul>
    </section>
  );
}

interface DiaryRowProps {
  entry: DiaryEntry;
  /** 在本组中的序号，只用来算落定延迟 */
  index: number;
  onNavigate: (sectionId: string) => void;
  /** 时间段行专用：去时间轴页编辑 */
  onOpenTimeline: () => void;
  /** 条目行专用：行内缩略图条点开全屏大图 */
  onViewImage: (blob: Blob) => void;
  /** 时间段行专用：在今日隐藏（不回写时间轴） */
  onHide?: () => void;
}

/**
 * 单条日记行（对齐概念稿 C1 的行形态）：
 * 顶层条目 = 编号 + 圆形勾选框 + 15px 标题；子项 = 缩进 + 小圆圈 + 14px 标题。
 *
 * 勾选反馈：盒子弹一下 + 那一勾画出来（`Tick`），同时标题上一条线**从左画到右**。
 * 划掉线用 background-size 而不是 `line-through`：line-through 是瞬间整条出现的，
 * 和「我刚划掉它」这个动作对不上；而且它必须挂在行内 span 上，
 * 挂在撑满整行的按钮上会有一条横贯空白区的长线。
 */
function DiaryRow({
  entry,
  index,
  onNavigate,
  onOpenTimeline,
  onViewImage,
  onHide,
}: DiaryRowProps) {
  const toggleDone = useItemStore((s) => s.toggleDone);
  const toggleSlotDone = useTimeSlotStore((s) => s.toggleDone);
  const item = entry.item;
  const slot = entry.timeSlot;

  /*
    `kind === 'timeSlot'`：时间轴里归到本板块的时间段，投影出来的一行。
    与条目行同构（编号 + 圆形勾选框 + 16px 标题），只多一个开始时间 —— 它是
    「这条为什么会出现在这里」的唯一标记，去掉的话用户只会以为是自己记过又忘了。

    勾选直接写回 `TimeSlot.done`（不复制成条目），所以今日页与时间轴天然一致，
    点行则去时间轴改内容 —— 板块页只有条目树，编辑不到时间段。
    末尾的「隐藏」按钮：仅从**本日视图**移除这条投影，不碰时间轴原始记录
    （满足「今日修改不回写时间轴」；时间轴的改动仍会同步到今日）。
  */
  if (entry.kind === 'timeSlot' && slot) {
    return (
      <li
        className="m-rise flex items-center gap-2.5 py-1.5"
        style={{ animationDelay: staggerDelay(index) }}
      >
        <span className="shrink-0 w-5 text-right text-caption text-ink-faint tabular-nums">
          {entry.displayNo}
        </span>
        <Tick
          done={slot.done}
          size={16}
          shape="circle"
          className="w-4 h-4 tap-expand"
          onToggle={() => toggleSlotDone(slot.id)}
        />
        <span className="shrink-0 text-meta tabular-nums text-ink-faint">
          {minToHHMM(slot.startMin)}
        </span>
        <button
          type="button"
          onClick={onOpenTimeline}
          className={clsx(
            'flex-1 min-w-0 text-left text-lead leading-6 truncate',
            slot.done ? 'text-ink-faint' : 'text-ink',
          )}
        >
          <span className="m-strike" data-done={slot.done}>
            {slot.content || '未命名时间段'}
          </span>
        </button>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            aria-label="在今日隐藏"
            className="press shrink-0 w-7 h-7 flex items-center justify-center rounded-pill text-ink-faint active:opacity-60"
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </li>
    );
  }

  if (!item) return null;

  const done = item.done;

  if (entry.kind === 'child') {
    return (
      <li
        className="m-rise flex flex-col gap-1 py-1.5"
        style={{ paddingLeft: 24 + entry.depth * 16, animationDelay: staggerDelay(index) }}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-[14px] h-[14px] rounded-pill border border-edge-strong shrink-0" />
          <button
            type="button"
            onClick={() => onNavigate(item.sectionId)}
            className={clsx(
              'flex-1 min-w-0 text-left text-body leading-5 truncate',
              done ? 'text-ink-faint' : 'text-ink-muted',
            )}
          >
            <span className="m-strike" data-done={done}>
              {item.title || '未命名条目'}
            </span>
          </button>
        </div>
        <ImageStrip itemId={item.id} indent={0} onViewImage={onViewImage} />
      </li>
    );
  }

  // kind === 'item'：顶层条目，跨组连续编号（编号在前，勾选框随后）
  return (
    <li
      className="m-rise flex flex-col gap-1 py-1.5"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 w-5 text-right text-caption text-ink-faint tabular-nums">
          {entry.displayNo}
        </span>
        <Tick
          done={done}
          size={16}
          shape="circle"
          className="w-4 h-4 tap-expand"
          onToggle={() => toggleDone(item.id)}
        />
        <button
          type="button"
          onClick={() => onNavigate(item.sectionId)}
          className={clsx(
            'flex-1 min-w-0 text-left text-lead leading-6 truncate',
            done ? 'text-ink-faint' : 'text-ink',
          )}
        >
          <span className="m-strike" data-done={done}>
            {item.title || '未命名条目'}
          </span>
        </button>
      </div>
      {/*
        行内缩略图条：图片与任务条「同时出现」，可折叠。
        缩进对齐到勾选框那一列（编号 20 + 间距 10 = 30px）。
      */}
      <ImageStrip itemId={item.id} indent={30} onViewImage={onViewImage} />
    </li>
  );
}

interface ImageStripProps {
  itemId: string;
  /** 左侧缩进 px（对齐勾选框列） */
  indent: number;
  onViewImage: (blob: Blob) => void;
}

/**
 * 行内图片缩略图条：条目有图片时显示在任务条下方，可整条折叠。
 * 点缩略图 → 全屏大图；点「收起」→ 折叠成一行「N 张图片」提示，可再展开。
 *
 * 这里是**只读预览**：上传 / 删除统一收在条目详情抽屉（板块页点行尾「⋯」），
 * 今日列表不再放图片入口，避免同一份图片有两个可写入口。
 */
function ImageStrip({ itemId, indent, onViewImage }: ImageStripProps) {
  const images = useItemImageStore((s) => s.byItem[itemId] ?? EMPTY_IMAGES);
  const [collapsed, setCollapsed] = useState(false);

  if (images.length === 0) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="press inline-flex items-center gap-1 text-caption text-ink-faint"
        style={{ paddingLeft: indent }}
      >
        <Icon name="image" size={13} className="shrink-0" />
        {images.length} 张图片
      </button>
    );
  }

  return (
    <div
      className="flex items-start gap-2 flex-wrap"
      style={{ paddingLeft: indent }}
    >
      {images.map((image) => (
        <ImageThumb
          key={image.id}
          blob={image.blob}
          size={52}
          onClick={() => onViewImage(image.blob)}
        />
      ))}
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="收起图片"
        className="w-7 h-7 flex items-center justify-center rounded-pill text-ink-faint"
      >
        <Icon name="chevron-up" size={15} />
      </button>
    </div>
  );
}
