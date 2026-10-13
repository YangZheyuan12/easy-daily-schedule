import { useMemo, useRef, useState } from 'react';
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
 */
export function DiaryList({ date }: DiaryListProps) {
  const navigate = useNavigate();
  const items = useItemStore((s) => s.items);
  const inspirations = useInspirationStore((s) => s.inspirations);

  const groups = useMemo(() => buildDiaryList(items, inspirations), [items, inspirations]);

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
}

/**
 * 四板块组：色点 + 组名 + 条目数，组头点击跳板块详情（树形编辑入口保留）；
 * 内部是编号条目与子项，底部恒定一行内联快速添加（与灵感组同构）。
 */
function SectionGroup({ group, date, onNavigate }: SectionGroupProps) {
  const config = SECTION_CONFIG_MAP[group.key as keyof typeof SECTION_CONFIG_MAP];
  const addSibling = useItemStore((s) => s.addSibling);
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

  const topItems = group.entries.filter((e) => e.kind === 'item');
  const doneCount = topItems.filter((e) => e.item?.done).length;
  const totalCount = topItems.length;
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

      {group.entries.length > 0 && (
        <ul>
          {group.entries.map((entry, index) => (
            <DiaryRow
              key={entry.item?.id ?? entry.inspiration?.id}
              entry={entry}
              index={index}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}

      {/* 内联快速添加：下沉底胶囊行，输入 + 添加（Enter 或点按钮提交） */}
      <div
        className="m-rise mt-2 flex items-center gap-2 h-10 px-3.5 rounded-sm bg-surface-sunken"
        style={{ animationDelay: staggerDelay(group.entries.length) }}
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
function DiaryRow({ entry, index, onNavigate }: DiaryRowProps) {
  const toggleDone = useItemStore((s) => s.toggleDone);
  const item = entry.item;
  if (!item) return null;

  const done = item.done;

  if (entry.kind === 'child') {
    return (
      <li
        className="m-rise flex items-center gap-2.5 py-1.5"
        style={{ paddingLeft: 24 + entry.depth * 16, animationDelay: staggerDelay(index) }}
      >
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
      </li>
    );
  }

  // kind === 'item'：顶层条目，跨组连续编号（编号在前，勾选框随后）
  return (
    <li
      className="m-rise flex items-center gap-2.5 py-1.5"
      style={{ animationDelay: staggerDelay(index) }}
    >
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
    </li>
  );
}
