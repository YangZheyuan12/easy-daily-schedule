import { Icon } from '@/components/ui/Icon';
import { useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { Item } from '@/domain/types';
import type { Rating, SectionKey } from '@/domain/enums';
import { useItemStore } from '@/store/useItemStore';
import { useUiStore } from '@/store/useUiStore';
import { Sheet, SheetActionButton, ConfirmDialog } from '@/components/ui/Sheet';
import { RatingStars } from '@/components/ui/RatingStars';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';

interface ItemSheetProps {
  item: Item | null;
  accent: string;
  sectionName: string;
}

/**
 * 条目详情抽屉：任务描述 + 个人评价 + 子分支管理 + 删除。
 *
 * 高度不超过 85vh 且内部滚动；键盘弹起时由 `useKeyboardAvoid`
 * 把输入区顶上来，避免输入框被软键盘挡住。
 */
export function ItemSheet({ item, accent, sectionName }: ItemSheetProps) {
  const closeDrawer = useUiStore((s) => s.closeDrawer);
  const pushToast = useUiStore((s) => s.pushToast);
  const setDescription = useItemStore((s) => s.setDescription);
  const setRating = useItemStore((s) => s.setRating);
  const setReview = useItemStore((s) => s.setReview);
  const addChild = useItemStore((s) => s.addChild);
  const move = useItemStore((s) => s.move);
  const remove = useItemStore((s) => s.remove);
  const toggleDone = useItemStore((s) => s.toggleDone);

  const [confirmOpen, setConfirmOpen] = useState(false);

  // 抽屉退场动画要求「点关闭之后再多活 200ms」：item 一变 null 组件就整棵卸载的话，
  // 下滑动画没有任何机会播出来。这里保留最后一次的条目，只把 open 置 false，
  // 由 Sheet 内部负责播完再卸载。
  const lastItem = useRef(item);
  if (item) lastItem.current = item;
  const shown = item ?? lastItem.current;

  const textareaRef = useAutoResizeTextarea(shown?.description ?? '');

  if (!shown) return null;

  const handleDelete = () => {
    remove(shown.id);
    setConfirmOpen(false);
    closeDrawer();
    pushToast('已删除，可撤销');
  };

  return (
    <>
      <Sheet
        open={Boolean(item)}
        onClose={closeDrawer}
        title={
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
            <span className="truncate">{shown.title || '未命名条目'}</span>
          </span>
        }
        action={<SheetActionButton onClick={closeDrawer}>完成</SheetActionButton>}
      >
        {/* 所属板块与完成态 */}
        <div className="flex items-center justify-between py-3">
          <span className="text-meta text-ink-faint">{sectionName}</span>
          <button
            type="button"
            onClick={() => toggleDone(shown.id)}
            className={clsx(
              'text-body px-3.5 py-1.5 rounded-full border min-h-[38px]',
              shown.done ? 'border-transparent text-accent-fg' : 'border-surface-line text-ink-muted',
            )}
            style={shown.done ? { backgroundColor: accent } : undefined}
          >
            {shown.done ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="check" size={14} strokeWidth={2.4} />
                已完成
              </span>
            ) : (
              '标记完成'
            )}
          </button>
        </div>

        {/* 任务描述 */}
        <Section title="任务描述">
          <textarea
            ref={textareaRef}
            value={shown.description}
            onChange={(event) => setDescription(shown.id, event.target.value)}
            placeholder="补充细节、过程、遇到的问题…"
            rows={2}
            className="w-full min-h-[64px] text-body leading-6 text-ink placeholder:text-ink-faint outline-none bg-transparent"
          />
        </Section>

        {/* 个人评价 */}
        <Section title="个人评价">
          <div className="py-1">
            <RatingStars
              value={shown.rating}
              onChange={(value: Rating) => setRating(shown.id, value)}
              size="lg"
            />
          </div>
          <textarea
            value={shown.review}
            onChange={(event) => setReview(shown.id, event.target.value)}
            placeholder="给自己写一句评价…"
            rows={2}
            className="mt-2 w-full min-h-[56px] text-body leading-6 text-ink placeholder:text-ink-faint outline-none bg-transparent"
          />
        </Section>

        {/* 子分支 */}
        <Section title="子分支">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addChild(shown.id, shown.date, shown.sectionId as SectionKey)}
              className="press flex-1 min-h-[42px] rounded-card border border-dashed border-edge-strong text-body text-ink-muted"
            >
              + 添加子分支
            </button>
            <button
              type="button"
              onClick={() => move(shown.id, -1)}
              className="press min-w-[46px] min-h-[42px] rounded-card border border-surface-line text-ink-muted flex items-center justify-center"
              aria-label="上移"
            >
              <Icon name="chevron-up" size={17} />
            </button>
            <button
              type="button"
              onClick={() => move(shown.id, 1)}
              className="press min-w-[46px] min-h-[42px] rounded-card border border-surface-line text-ink-muted flex items-center justify-center"
              aria-label="下移"
            >
              <Icon name="chevron-down" size={17} />
            </button>
          </div>
          <p className="mt-2 text-caption leading-5 text-ink-faint">
            在列表里按 Tab 可以缩进成子分支，Shift+Tab 升回来。
          </p>
        </Section>

        {/* 危险操作 */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="w-full min-h-tap rounded-card border border-heart/30 text-lead text-heart"
          >
            删除这个条目
          </button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        title="确定删除？"
        description="该条目及其下所有子分支会一并删除，删除后 5 秒内可以撤销。"
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-3 border-t border-surface-line">
      <div className="text-meta font-medium text-ink-muted mb-1.5">{title}</div>
      {children}
    </div>
  );
}
