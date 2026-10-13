import { useEffect, useState } from 'react';
import { UNDO_WINDOW_MS } from '@/domain/constants';
import { useItemStore } from '@/store/useItemStore';
import { useTaskStore } from '@/store/useTaskStore';

/**
 * 删除撤销条。
 *
 * 5 秒窗口结束后自动消失。之所以用「软删 + 快照」而不是直接物理删除，
 * 就是为了换来这个不打断录入节奏的纠错能力 —— 在手机上误删比在电脑上常见得多。
 */
export function UndoBar() {
  const itemUndo = useItemStore((s) => s.pendingUndo);
  const undoItem = useItemStore((s) => s.undo);
  const dismissItemUndo = useItemStore((s) => s.dismissUndo);

  const taskUndo = useTaskStore((s) => s.pendingUndo);
  const undoTask = useTaskStore((s) => s.undo);
  const dismissTaskUndo = useTaskStore((s) => s.dismissUndo);

  // 只展示最近一次操作对应的撤销条
  const active = itemUndo && taskUndo
    ? (itemUndo.deletedAt >= taskUndo.deletedAt ? { kind: 'item' as const, entry: itemUndo } : { kind: 'task' as const, entry: taskUndo })
    : itemUndo
      ? { kind: 'item' as const, entry: itemUndo }
      : taskUndo
        ? { kind: 'task' as const, entry: taskUndo }
        : null;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      if (active.kind === 'item') dismissItemUndo();
      else dismissTaskUndo();
    }, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [active, dismissItemUndo, dismissTaskUndo]);

  if (!active || !visible) return null;

  return (
    /*
      位置：正落在各页「主操作」的槽位上（bottom 100 = 悬浮 Tab 胶囊之上）。
      撤销条不是「额外再飘一层」，而是**临时顶替**主操作按钮 —— 与 Snackbar 顶替 FAB 同理：
      两件悬浮物同时挤在底部时，撤销条正好压在「+ 添加」上，按钮会变成点不动的幽灵
      （字号放大后撤销条更高，压得更实）。Tab 胶囊自底向上占 86px，100 也一并让开了它。
    */
    <div className="fixed inset-x-0 bottom-[100px] z-40 flex justify-center px-4 pointer-events-none">
      <div className="w-full max-w-[430px] pointer-events-auto m-rise">
        <div className="relative overflow-hidden flex items-center gap-3 bg-accent text-accent-fg rounded-full pl-4 pr-2 py-2 shadow-lg">
          <span className="flex-1 text-body truncate">{active.entry.label}</span>
          <button
            type="button"
            onClick={() => {
              if (active.kind === 'item') undoItem();
              else undoTask();
              setVisible(false);
            }}
            className="press text-body font-medium text-accent-fg px-3 min-h-[36px]"
          >
            撤销
          </button>

          {/*
            剩余时间条：把「还有 5 秒」画出来，而不是让用户猜。
            key 绑 deletedAt —— 连续删两条时动画要从头重放，
            否则第二条的倒计时会从第一条剩下的位置开始（看起来像快没时间了）。
          */}
          <span
            key={active.entry.deletedAt}
            aria-hidden
            className="absolute bottom-[3px] left-4 right-4 h-[2px] rounded-pill bg-accent-fg/40 origin-left"
            style={{ animation: `m-countdown ${UNDO_WINDOW_MS}ms linear forwards` }}
          />
        </div>
      </div>
    </div>
  );
}
