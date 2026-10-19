import type { SyncGateway } from '@/domain/ports';
import type { SyncPullPage, SyncRow } from '@/domain/sync';
import { resolveSyncConflict, syncRowKey } from '@/domain/sync';

/**
 * 假云端（内存实现），用于**在接真后端之前**把同步内核跑通。
 *
 * 它不是玩具：所有裁决都走 `domain/sync.ts` 里那个 `resolveSyncConflict`，
 * 与真云端、与本地端**共用同一份规则** —— 规则只写一遍，才谈得上收敛。
 * 将来换成 HTTP 实现时，行为应与此完全一致（单测可直接平移当契约测试用）。
 *
 * 落点：`repositories/` —— 它回答的是「差异怎么搬」，和仓储同属适配器层。
 */
export class MemorySyncGateway implements SyncGateway {
  private readonly rows = new Map<string, SyncRow>();
  /** 模拟服务端时钟相对本进程的偏移，用来验证「设备时钟不准」场景 */
  private readonly skew: number;
  /** 时间源，测试里注入假时钟 */
  private readonly now: () => number;

  constructor(options: { skew?: number; now?: () => number } = {}) {
    this.skew = options.skew ?? 0;
    this.now = options.now ?? (() => Date.now());
  }

  async pull(since: number, limit: number): Promise<SyncPullPage> {
    const matched = [...this.rows.values()]
      .filter((row) => row.updatedAt > since)
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const page = matched.slice(0, Math.max(0, limit));
    return {
      rows: page.map((row) => cloneRow(row)),
      serverTime: this.serverNow(),
      done: page.length >= matched.length,
    };
  }

  async push(rows: SyncRow[]): Promise<{ serverTime: number; applied: number }> {
    let applied = 0;
    for (const incoming of rows) {
      const key = syncRowKey(incoming.entity, incoming.id);
      const existing = this.rows.get(key);
      if (!existing) {
        this.rows.set(key, cloneRow(incoming));
        applied += 1;
        continue;
      }
      // 云端视角：已存的行是「local」，推上来的行是「remote」
      const winner = resolveSyncConflict(
        existing,
        incoming,
        existing.deviceId,
        incoming.deviceId,
      );
      if (winner === 'local' || winner === 'same') continue;
      this.rows.set(key, cloneRow(incoming));
      applied += 1;
    }
    return { serverTime: this.serverNow(), applied };
  }

  /** 云端当前时间（服务端轴） */
  private serverNow(): number {
    return this.now() + this.skew;
  }

  /** 测试辅助：直接窥视云端内容 */
  peek(entity: SyncRow['entity'], id: string): SyncRow | undefined {
    return this.rows.get(syncRowKey(entity, id));
  }

  /** 测试辅助：云端总行数 */
  get size(): number {
    return this.rows.size;
  }
}

function cloneRow(row: SyncRow): SyncRow {
  return { ...row, record: { ...row.record } as SyncRow['record'] };
}
