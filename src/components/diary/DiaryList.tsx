import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { DiaryEntry, DiaryGroup, Item } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { sectionColor, sectionTint } from '@/domain/constants';
import { useSectionConfig } from '@/hooks/useSectionConfigs';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { useExpanded } from '@/hooks/useExpanded';
import { Icon } from '@/components/ui/Icon';
import { buildDiaryList } from '@/services/diaryService';
import { useInspirationStore } from '@/store/useInspirationStore';
import { useItemStore } from '@/store/useItemStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useTodayHiddenStore } from '@/store/useTodayHiddenStore';
import { useUiStore } from '@/store/useUiStore';
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
 * 「色点 + 组名 + N项」小标签，条目直接排下来，每组底部一行下沉底的
 * 内联快速添加胶囊。分组之间靠留白呼吸，不靠边框。
 *
 * 取代原先的四张 SectionCard 网格 —— 把「今天做了什么 / 想到什么」按日记顺序
 * 串成一条，编号只是展示用的派生值，不写库。
 *
 * 四板块的每一行有两类来源：**本板块的条目**（可增删）与
 * **时间轴里归到本板块的时间段**（投影进来，只是读同一条记录）。
 * 投影进来的时间段，在今日视图内可「隐藏」（仅本日视图，不回写时间轴记录）。
 *
 * 🔴 本列表**没有行内勾选框**（用户要求去掉）：完成态靠删除线 + 淡化字重表达，
 * 切换完成 / 未完成请点行尾「⋯」进条目详情（与板块页同一张抽屉）。
 * 两类行都不放框是刻意的：它们上下相邻，一边有一边没有就会错开一整列。
 *
 * 🔴 **条目行（顶层 / 子项）在主页就能改**（用户要求）：点标题文字行内编辑，
 * 点行尾「⋯」打开条目详情抽屉（图片 / 描述 / 子分支 / 删除）——
 * 不必再跳板块页。投影的时间段行是例外：**只读**，去时间轴页编辑。
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

  /*
    已经「同步到今日」的时间段：它的投影行让位给同步成的**条目**（可勾选、可编辑）。
    否则今日页会出现两条一样的内容 —— 一条只读投影、一条可编辑副本，用户会以为同步坏了。
    删掉那条同步成的条目，投影自然回来（时间段本身没动）。
    🔴 只算**存活**条目：软删的条目在列表里已经不可见，若还按它隐藏投影，
    这个时间段就会在今日页彻底消失（撤得回，但看着像数据丢了）。
  */
  const syncedSlotIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.deletedAt === null && item.sourceSlotId !== null && item.sourceSlotId !== undefined) {
        ids.add(item.sourceSlotId);
      }
    }
    return ids;
  }, [items]);

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
            syncedSlotIds={syncedSlotIds}
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
  /** 已同步成条目的时间段 id（它们的投影行让位给条目，见 DiaryList 头部注释） */
  syncedSlotIds: ReadonlySet<string>;
  onNavigate: (sectionId: string) => void;
  /** 点「来自时间轴」的那一行 → 去时间轴页编辑（板块页只有条目树，改不到时间段） */
  onOpenTimeline: () => void;
}

/**
 * 四板块组：色点 + 组名，组头点击跳板块详情（树形编辑入口保留）；
 * 内部是编号条目与子项，底部恒定一行内联快速添加（与灵感组同构）。
 */
function SectionGroup({ group, date, syncedSlotIds, onNavigate, onOpenTimeline }: SectionGroupProps) {
  // 组名与配色取**用户自定义后的**板块配置（改了名这里跟着变）
  const config = useSectionConfig(group.key as SectionKey);
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
    已经同步成条目的时间段同样过滤 —— 今日页只看得到那条同步成的条目（见头部注释）。
  */
  const visibleEntries = group.entries.filter((e) => {
    if (e.kind !== 'timeSlot' || !e.timeSlot) return true;
    if (isHidden(e.timeSlot.id)) return false;
    return !syncedSlotIds.has(e.timeSlot.id);
  });
  /** 本组本日被隐藏的时间段 id（用于「恢复隐藏」入口） */
  const hiddenIds = group.entries
    .filter((e) => e.kind === 'timeSlot' && e.timeSlot && isHidden(e.timeSlot.id))
    .map((e) => e.timeSlot!.id);

  /*
    组头计数 = 本板块顶层条目 + 归到本板块的时间段（两者都编号、都算一件「要做的事」）。
    口径与日历摘要卡 `DaySummary.sections` 一致，且只数**可见**的（隐藏 / 已同步的不计入）。
    形态是纯计数「N项」（2026-10-16 用户要求：去掉 0/3 进度显示后嫌光秃，要一行数量小字）。
    🔴 只放**数量**、不放完成率：完成率口径仍在 `progressService` 与日历摘要卡。
  */
  const topCount = visibleEntries.filter((e) => e.kind === 'item' || e.kind === 'timeSlot').length;

  const placeholder = config.placeholder;

  return (
    <section>
      {/*
        组头：色点 + 组名 + 「N项」数量小字。
        层级关系是刻意的 —— 组头 18px Semibold（重墨）必须**明显重于**它下面的
        条目（16px）与内联添加（15px 弱化色），这样扫一眼就知道「这一段属于谁」。
        色点也跟着放大到 8px，否则 18px 的标题旁边一颗 6px 的点会显得没长齐。
        计数用 caption 弱化色 + tabular-nums，跟在组名右侧，只回答「这一组有几件事」。
      */}
      <button
        type="button"
        onClick={() => onNavigate(String(group.key))}
        className="w-full h-8 flex items-center gap-2 text-left active:opacity-60"
      >
        <span
          className="w-2 h-2 rounded-pill shrink-0"
          style={{ backgroundColor: sectionColor(config) }}
        />
        <span className="text-heading font-semibold text-ink">{config.name}</span>
        <span className="ml-auto text-caption text-ink-faint tabular-nums">{topCount}项</span>
      </button>

      {visibleEntries.length > 0 && (
        <ul>
          {visibleEntries.map((entry, index) => (
            <DiaryRow
              key={entry.item?.id ?? entry.inspiration?.id ?? entry.timeSlot?.id}
              entry={entry}
              index={index}
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
            empty
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
          {group.entries.length}项
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
  /** 时间段行专用：去时间轴页编辑 */
  onOpenTimeline: () => void;
  /** 条目行专用：行内缩略图条点开全屏大图 */
  onViewImage: (blob: Blob) => void;
  /** 时间段行专用：在今日隐藏（不回写时间轴） */
  onHide?: () => void;
}

/**
 * 单条日记行（对齐概念稿 C1 的行形态）：
 * 顶层条目 = 编号 + 16px 标题；子项 = 缩进 + 14px 标题；
 * 投影的时间段 = 编号 + 开始时间 + 16px 标题。
 *
 * 🔴 **条目行（顶层 / 子项）在主页就能改**（用户要求，不必再去板块页）：
 * 点标题文字 → 行内编辑（自动增高的 textarea，Enter 或失焦提交，Esc 取消）；
 * 点行尾「⋯」→ 打开与板块页同一张条目详情抽屉（图片 / 描述 / 子分支 / 删除）。
 * 投影的时间段行**不做这些**（时间轴导入过来的不改）—— 它只读，去时间轴页编辑。
 *
 * 划掉线用 background-size 而不是 `line-through`：line-through 是瞬间整条出现的，
 * 和「我刚划掉它」这个动作对不上；而且它必须挂在行内 span 上，
 * 挂在撑满整行的按钮上会有一条横贯空白区的长线。
 * 现在是唯一的完成态标记 —— 行内勾选框已移除，见文件头注释。
 */
function DiaryRow({
  entry,
  index,
  onOpenTimeline,
  onViewImage,
  onHide,
}: DiaryRowProps) {
  const item = entry.item;
  const slot = entry.timeSlot;

  /*
    `kind === 'timeSlot'`：时间轴里归到本板块的时间段，投影出来的一行。
    与条目行同构（编号 + 16px 标题），只多一个开始时间 —— 它是
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
        {/*
          这里同样**没有**圆形勾选框：投影行与条目行在同一张列表里上下相邻，
          一边有圈一边没圈，两列标题就会错开 26px，整页立刻散掉。
          完成态一律靠删除线 + 淡化表达；要改完成/未完成就点进去（去时间轴）。
        */}
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
    const hasDesc = item.description.trim().length > 0;
    return (
      <li
        className="m-rise flex flex-col gap-1 py-1.5"
        style={{ paddingLeft: 24 + entry.depth * 16, animationDelay: staggerDelay(index) }}
      >
        <div className="flex items-center gap-2.5">
          {/* 子项前面**没有**圆圈（用户要求）：缩进本身就是层级，再画一圈等于每层多一个控件 */}
          <EditableTitle item={item} sizeClass="text-body leading-5" tone={done ? 'text-ink-faint' : 'text-ink-muted'} />
          <MoreButton item={item} />
        </div>
        {/*
          详细描述：只在填了的时候出现（与任务列表同口径，空描述不占视觉重量）。
          只读展示 —— 今日列表的标题可点改，描述 / 子分支 / 删除统一收在条目详情抽屉，
          避免同一份内容多个可写入口。
        */}
        {hasDesc && (
          <p className="text-caption leading-5 text-ink-faint break-words">{item.description}</p>
        )}
        <ImageStrip itemId={item.id} indent={0} onViewImage={onViewImage} />
      </li>
    );
  }

  // kind === 'item'：顶层条目，跨组连续编号（编号在前，其后直接是标题）
  return (
    <li
      className="m-rise flex flex-col gap-1 py-1.5"
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 w-5 text-right text-caption text-ink-faint tabular-nums">
          {entry.displayNo}
        </span>
        {/*
          这里**没有**圆形勾选按钮（用户要求去掉）：列表是「看今天有什么」的地方，
          一圈圈勾选框会把视线切碎。完成态改用删除线 + 淡化字重表达，
          要切换完成/未成就点行尾「⋯」进详情。
        */}
        <EditableTitle item={item} sizeClass="text-lead leading-6" tone={done ? 'text-ink-faint' : 'text-ink'} />
        <MoreButton item={item} />
      </div>
      {/*
        详细描述：只在填了的时候出现（与任务列表同口径，空描述不占视觉重量）。
        缩进对齐标题列（编号 20 + 间距 10 = 30px），只读展示，编辑走抽屉。
      */}
      {item.description.trim().length > 0 && (
        <p
          className="text-caption leading-5 text-ink-faint break-words"
          style={{ paddingLeft: 30 }}
        >
          {item.description}
        </p>
      )}
      {/*
        行内缩略图条：图片与任务条「同时出现」，可折叠。
        缩进对齐到标题那一列（编号 20 + 间距 10 = 30px）。
        折叠态在「N 张图片」标签正右方放一张预览图，展开态把全部缩略图排到标签右方。
      */}
      <ImageStrip itemId={item.id} indent={30} onViewImage={onViewImage} />
    </li>
  );
}

/**
 * 行尾「⋯」：打开与板块页**同一张**条目详情抽屉（图片 / 描述 / 子分支 / 删除）。
 *
 * 走全局 `useUiStore` 的 drawer 机制而不是本地 state —— 抽屉由 TodayPage 渲染，
 * 与板块页共用 `ItemSheet`，两个入口看到的是同一份内容、同一套删除确认。
 */
function MoreButton({ item }: { item: Item }) {
  const openDrawer = useUiStore((s) => s.openDrawer);
  return (
    <button
      type="button"
      onClick={() => openDrawer(item.id)}
      aria-label={`编辑「${item.title || '未命名条目'}」`}
      className="press shrink-0 w-7 h-7 flex items-center justify-center rounded-pill text-ink-faint active:opacity-60"
    >
      <Icon name="more" size={16} />
    </button>
  );
}

/**
 * 可点编辑的标题：默认是「一段文字」，点一下变成自动增高的输入框。
 *
 * 为什么不是常驻 input（板块页 TreeRow 那样）：今日页是**阅读**优先的列表，
 * 一排常驻输入框会让「看今天有什么」变成「满屏光标待命」；而编辑是低频动作，
 * 点一下多一步、换来的是一屏干净的日记体。
 *
 * 提交规则：Enter 或失焦 → 保存（trim 后为空则保留原标题，误触全选+删除不丢内容）；
 * Esc → 取消，丢弃本次修改。真删条目请走「⋯」里的删除（有过确认）。
 */
function EditableTitle({
  item,
  sizeClass,
  tone,
}: {
  item: Item;
  sizeClass: string;
  tone: string;
}) {
  const setTitle = useItemStore((s) => s.setTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const ref = useAutoResizeTextarea(draft);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // 光标落到末尾：点文字进来是「接着改」，不是全选重打
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [ref]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(item.title);
          setEditing(true);
        }}
        className={clsx('flex-1 min-w-0 text-left truncate', sizeClass, tone)}
      >
        <span className="m-strike" data-done={item.done}>
          {item.title || '未命名条目'}
        </span>
      </button>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (next.length > 0 && next !== item.title) setTitle(item.id, next);
    setEditing(false);
  };

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setEditing(false);
        }
      }}
      rows={1}
      placeholder="未命名条目"
      className={clsx(
        'm-strike-ink flex-1 min-w-0 bg-transparent outline-none resize-none',
        sizeClass,
        tone,
      )}
      enterKeyHint="done"
    />
  );
}

interface ImageStripProps {
  itemId: string;
  /** 左侧缩进 px（对齐标题列） */
  indent: number;
  onViewImage: (blob: Blob) => void;
}

/**
 * 行内图片缩略图条：条目有图片时显示在标题下方，可整条折叠。
 * 点缩略图 → 全屏大图；点「N 张图片」标签 → 折叠 / 展开。
 *
 * 缩略图**排在「N 张图片」标签的正右方**（不是另起一行堆在下面）：
 * - 折叠态：标签 + 一张预览缩略图（在标签右边，给个图的线索又不占一整行）；
 * - 展开态：标签 + 全部缩略图（同样排在标签右边）。
 * 只有一张图时两种状态视觉一致，属正常。
 *
 * 这里是**只读预览**：上传 / 删除统一收在条目详情抽屉（板块页点行尾「⋯」），
 * 今日列表不再放图片入口，避免同一份图片有两个可写入口。
 *
 * 折叠态按条目 id 跨页保持（2026-10-16 用户要求）：嫌某条的图挡路收起来，
 * 切走再回来不用再收一遍。
 */
function ImageStrip({ itemId, indent, onViewImage }: ImageStripProps) {
  const images = useItemImageStore((s) => s.byItem[itemId] ?? EMPTY_IMAGES);
  const { open: expanded, toggle } = useExpanded(`images:${itemId}`, true);

  if (images.length === 0) return null;

  // 折叠态只露一张预览，展开态露全部；标签始终在最左，缩略图排在它右方
  const visible = expanded ? images : images.slice(0, 1);

  return (
    <div
      className="flex items-center gap-2 flex-wrap pt-0.5"
      style={{ paddingLeft: indent }}
    >
      <button
        type="button"
        onClick={toggle}
        className="press inline-flex items-center gap-1 text-caption text-ink-faint shrink-0"
        aria-expanded={expanded}
      >
        <Icon name="image" size={13} className="shrink-0" />
        {images.length} 张图片
      </button>
      {visible.map((image) => (
        <ImageThumb
          key={image.id}
          blob={image.blob}
          size={52}
          onClick={() => onViewImage(image.blob)}
        />
      ))}
      {expanded && (
        <button
          type="button"
          onClick={toggle}
          aria-label="收起图片"
          className="w-7 h-7 flex items-center justify-center rounded-pill text-ink-faint shrink-0"
        >
          <Icon name="chevron-up" size={15} />
        </button>
      )}
    </div>
  );
}
