import { UNDO_WINDOW_MS } from '@/domain/constants';
import type { Item } from '@/domain/types';
import type { Clock } from './clock';

/**
 * 删除撤销。
 *
 * 机制：删除时把整棵子树的**完整副本**压栈，撤销时按副本恢复。
 * 之所以能完整恢复层级 / 顺序 / 折叠态，是因为软删只改了 `deletedAt`，
 * 副本里其余字段与删除前完全一致。
 *
 * 只有一个撤销槽位（移动端不需要多级撤销栈），
 * 超时或已消费后即失效，由 UI 决定是否还展示撤销条。
 */
export interface UndoEntry {
  /** 被删条目的完整快照（含后代） */
  snapshot: Item[];
  /** 被删条目的 id（根 + 后代） */
  ids: string[];
  /** 删除发生的时间戳 */
  deletedAt: number;
  /** 用于撤销条上的文案，如「已删除「写周报」等 3 项」 */
  label: string;
}

export class UndoService {
  private entry: UndoEntry | null = null;

  constructor(private readonly clock: Clock) {}

  push(entry: Omit<UndoEntry, 'deletedAt'>): void {
    this.entry = { ...entry, deletedAt: this.clock.now() };
  }

  /** 当前是否有一个仍在窗口内的可撤销项 */
  canUndo(): boolean {
    if (!this.entry) return false;
    return this.clock.now() - this.entry.deletedAt < UNDO_WINDOW_MS;
  }

  /** 取出并清空撤销项；不在窗口内返回 null */
  consume(): UndoEntry | null {
    if (!this.canUndo()) {
      this.entry = null;
      return null;
    }
    const entry = this.entry;
    this.entry = null;
    return entry;
  }

  /** 用户手动关闭撤销条，或窗口到期 */
  clear(): void {
    this.entry = null;
  }

  peek(): UndoEntry | null {
    return this.canUndo() ? this.entry : null;
  }
}

/** 生成撤销条文案 */
export function undoLabel(rootTitle: string, totalCount: number): string {
  const title = rootTitle.trim() || '未命名条目';
  if (totalCount <= 1) return `已删除「${title}」`;
  return `已删除「${title}」等 ${totalCount} 项`;
}
