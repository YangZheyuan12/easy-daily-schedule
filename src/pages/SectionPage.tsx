import { Icon } from '@/components/ui/Icon';
import clsx from 'clsx';
import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { sectionColor } from '@/domain/constants';
import { useSectionConfig } from '@/hooks/useSectionConfigs';
import { isSectionKey, type SectionKey } from '@/domain/enums';
import { useItemStore } from '@/store/useItemStore';
import { useUiStore } from '@/store/useUiStore';
import { useDayStore } from '@/store/useDayStore';
import { useTreeEditor } from '@/hooks/useTreeEditor';
import { useKeyboardVisible, KEYBOARD_HIDDEN_CLASS } from '@/hooks/useKeyboardVisible';
import { PageHeader } from '@/components/layout/PageHeader';
import { TreeRow } from '@/components/tree/TreeRow';
import { ItemSheet } from '@/components/item/ItemSheet';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatShortDate, isValidDateKey } from '@/utils/date';
import { staggerDelay } from '@/utils/motion';

/** 板块详情页：核心的树形编辑界面。 */
export function SectionPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const date = useDayStore((s) => s.date);
  const drawerItemId = useUiStore((s) => s.drawerItemId);
  const items = useItemStore((s) => s.items);
  const addSibling = useItemStore((s) => s.addSibling);

  const queryDate = searchParams.get('date');

  // URL → store 单向 bootstrap：store 始终是唯一日期真相源，URL 只负责首次进入 /
  // 刷新时把 store 对齐到它。HashRouter 刷新会重置 store（回到今天），若不回填，
  // 标题会显示今天、而用户以为在处理 URL 上的那天 —— 再点「+ 添加条目」就会写错日期。
  // 只读一次（依赖仅 queryDate），不反向从 URL 推导第二份日期状态。
  useEffect(() => {
    if (!queryDate || !isValidDateKey(queryDate)) return; // 非法值直接忽略
    if (queryDate === useDayStore.getState().date) return;
    useDayStore.getState().setDate(queryDate);
  }, [queryDate]);

  const key: SectionKey = isSectionKey(sectionId) ? sectionId : 'work';
  // 标题 / 强调色取用户自定义后的板块配置（板块改名后，这一页的标题跟着变）
  const config = useSectionConfig(key);

  const { rows, focusId, setFocusId, handleKeyDown } = useTreeEditor(date, key);

  // 副标题的「N项」= 该板块当天的**顶层**条目数（与今日页组头同一口径：
  // 子项是条目内部的分支，不单独计数；时间段只在今日页投影，本页不出现故不计）。
  const topCount = rows.filter((row) => row.item.parentId === null).length;

  // 键盘弹起 → 底部「+ 添加条目」收下去（与 Tab 胶囊同一机制）
  const keyboardVisible = useKeyboardVisible();

  const drawerItem = items.find((item) => item.id === drawerItemId) ?? null;

  const handleAdd = () => {
    const lastTopLevel = [...rows].reverse().find((row) => row.item.parentId === null);
    const newId = addSibling(lastTopLevel?.item.id ?? null, date, key);
    if (newId) setFocusId(newId);
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={config.name}
        subtitle={`${formatShortDate(date)} · ${topCount}项`}
        accent={sectionColor(config)}
        onBack={() => navigate('/today')}
      />

      <div className="flex-1 px-2 pt-1 pb-24">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="task" size={40} className="text-ink-faint" />}
            title={`还没有记录${config.name}`}
            description="点下面的按钮添加第一条，回车可以连续录入，Tab 缩进成分支。"
            action={
              <button
                type="button"
                onClick={handleAdd}
                className="press px-5 min-h-[40px] rounded-pill bg-accent text-body text-accent-fg"
              >
                + 添加第一条
              </button>
            }
          />
        ) : (
          /* 概念稿 C7：树装在一张纸卡里，行间不画分隔线，靠行高呼吸 */
          <div className="bg-surface rounded-card shadow-card p-1.5 overflow-hidden">
            {rows.map((row, index) => (
              // 外层只负责落定节拍（TreeRow 自己是 flex 行，不接动画类）
              <div
                key={row.item.id}
                className="m-rise"
                style={{ animationDelay: staggerDelay(index) }}
              >
                <TreeRow
                  row={row}
                  focused={focusId === row.item.id}
                  onFocus={() => setFocusId(row.item.id)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部常驻添加按钮 */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-[100px] flex justify-center px-4 pointer-events-none',
          // 键盘弹起时跟着底栏一起收下去：fixed 在 adjustResize 下会被键盘顶上来
          'transition-opacity duration-150 ease-[var(--m-ease-out)]',
          keyboardVisible && KEYBOARD_HIDDEN_CLASS,
        )}
        aria-hidden={keyboardVisible}
      >
        <div className="w-full max-w-[430px] pointer-events-auto">
          <button
            type="button"
            onClick={handleAdd}
            className="press w-full min-h-[46px] rounded-pill bg-accent text-lead text-accent-fg shadow-lg"
          >
            + 添加条目
          </button>
        </div>
      </div>

      <ItemSheet item={drawerItem} accent={sectionColor(config)} sectionName={config.name} />
    </div>
  );
}
