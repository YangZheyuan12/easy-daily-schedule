import { Icon } from '@/components/ui/Icon';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { VisibleRow } from '@/domain/types';
import { useItemStore } from '@/store/useItemStore';
import { useUiStore } from '@/store/useUiStore';
import { IndentGuides } from './IndentGuides';

interface TreeRowProps {
  row: VisibleRow;
  focused: boolean;
  onFocus: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>, row: VisibleRow) => void;
}

/**
 * 单条树形行。
 *
 * 移动端布局取舍：
 * - 折叠箭头、勾选框、标题输入都保证 ≥44px 的点击区，避免手指点不中；
 * - 「更多」按钮打开底部抽屉填写描述与评价，而不是行内展开 ——
 *   小屏塞不下那么多控件，塞进去反而每行都变得难以点击。
 */
export function TreeRow({ row, focused, onFocus, onKeyDown }: TreeRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { item, hasChildren, descendantCount } = row;

  const setTitle = useItemStore((s) => s.setTitle);
  const toggleCollapsed = useItemStore((s) => s.toggleCollapsed);
  const openDrawer = useUiStore((s) => s.openDrawer);

  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  return (
    <div className="flex items-stretch min-h-tap">
      <IndentGuides depth={row.depth} />

      <div className="flex-1 flex items-center min-w-0">
        {/* 折叠 / 展开 */}
        <button
          type="button"
          onClick={() => hasChildren && toggleCollapsed(item.id)}
          className={clsx(
            'min-w-[26px] min-h-tap flex items-center justify-center shrink-0',
            hasChildren ? 'text-ink-muted' : 'text-transparent',
          )}
          aria-label={item.collapsed ? '展开' : '折叠'}
        >
          {hasChildren && (
            <Icon
              name="chevron-right"
              size={14}
              className={clsx('m-flip', !item.collapsed && 'rotate-90')}
            />
          )}
        </button>

        {/*
          这里**没有**勾选方格（用户要求去掉）：完成态靠标题的删除线 + 淡化表达，
          要切换完成 / 未完成就点行尾「⋯」进详情。
          与今日列表同一套约定 —— 列表是「看有什么」的地方，一排勾选框会把视线切碎。
        */}

        {/* 标题输入 */}
        <input
          ref={inputRef}
          value={item.title}
          onChange={(event) => setTitle(item.id, event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => onKeyDown(event, row)}
          placeholder="写下完成情况…"
          className={clsx(
            'm-strike-ink flex-1 min-w-0 min-h-tap px-1 bg-transparent outline-none',
            // 概念稿 C7：顶层 14px、子项 13px，靠字号区分层级
            row.depth === 0 ? 'text-lead' : 'text-body',
            item.done ? 'text-ink-faint' : 'text-ink',
          )}
          data-done={item.done}
          enterKeyHint="enter"
        />

        {/* 右侧信息区：折叠徽标（收起时提示藏着几条）+ 更多 */}
        <div className="flex items-center shrink-0 pr-1">
          {item.collapsed && descendantCount > 0 && (
            <span className="text-micro text-ink-faint bg-surface-sunken rounded-full px-1.5 py-0.5 mr-1">
              {descendantCount}
            </span>
          )}
          <button
            type="button"
            onClick={() => openDrawer(item.id)}
            className="min-w-tap min-h-tap flex items-center justify-center text-ink-faint"
            aria-label="打开详情"
          >
            <Icon name="more" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
