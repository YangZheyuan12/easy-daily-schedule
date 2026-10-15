import { Icon } from '@/components/ui/Icon';
import { useRef, useState, type ReactNode } from 'react';
import type { Item } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { useItemStore } from '@/store/useItemStore';
import { useUiStore } from '@/store/useUiStore';
import { Sheet, SheetActionButton, ConfirmDialog } from '@/components/ui/Sheet';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { ItemImageSection } from '@/components/item/ItemImageSection';

interface ItemSheetProps {
  item: Item | null;
  accent: string;
  sectionName: string;
}

/**
 * 条目详情抽屉：图片附件 + 任务描述 + 子分支管理 + 删除。
 *
 * 「个人评价」（星级 + 评价文字）已移除 —— 它和「任务描述」是同一个抽屉里
 * 两个都叫「写点什么」的框，用户填完描述就走了，评价长期空着反而显得页面没做完。
 * 数据字段（`Item.rating` / `Item.review`）保留，将来要放回来自有位置。
 *
 * 高度不超过 85vh 且内部滚动；键盘弹起时由 `useKeyboardAvoid`
 * 把输入区顶上来，避免输入框被软键盘挡住。
 *
 * 图片附件收在这里（而不是今日列表的「⋯」）—— 它是「改这一条记录」的
 * 一部分，和描述、评价同级，入口唯一。
 */
export function ItemSheet({ item, accent, sectionName }: ItemSheetProps) {
  const closeDrawer = useUiStore((s) => s.closeDrawer);
  const pushToast = useUiStore((s) => s.pushToast);
  const setDescription = useItemStore((s) => s.setDescription);
  const addChild = useItemStore((s) => s.addChild);
  const move = useItemStore((s) => s.move);
  const remove = useItemStore((s) => s.remove);

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
        /*
          右上角原本是「完成」，现在换成**删除**（用户要求）。
          理由：这个抽屉没有需要「提交」的东西 —— 描述、图片都是改完即存，
          「完成」只是一个多余的关闭键；而删除是这里唯一不可逆的动作，
          放在视线终点（右上角主操作位）比埋在底部更容易被**看清**（不是更容易被点到：
          它仍然要先过一道确认弹窗）。
        */
        action={
          <SheetActionButton onClick={() => setConfirmOpen(true)} danger>
            删除
          </SheetActionButton>
        }
      >
        {/* 所属板块（完成态的切换入口已移除，完成态只在列表里以删除线表达） */}
        <div className="flex items-center justify-between py-3">
          <span className="text-meta text-ink-faint">{sectionName}</span>
          {shown.done && (
            <span
              className="inline-flex items-center gap-1 text-meta px-2.5 py-1 rounded-pill text-app"
              style={{ backgroundColor: accent }}
            >
              <Icon name="check" size={13} strokeWidth={2.4} />
              已完成
            </span>
          )}
        </div>

        {/* 图片附件：放在第一位 —— 上传 / 看大图 / 删除都在这里（今日列表只做只读预览） */}
        <ItemImageSection itemId={shown.id} />

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
