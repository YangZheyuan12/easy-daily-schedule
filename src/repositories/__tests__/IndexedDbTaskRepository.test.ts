import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbTaskRepository } from '@/repositories/IndexedDbTaskRepository';
import type { Task } from '@/domain/types';

/**
 * 任务仓储的字段归一化（QA）。
 *
 * 🔴 关键回归：老数据（「定住」功能上线前创建的任务）缺 `pinFrom` / `pinUntil`，
 * Dexie 读出来是 `undefined`。业务层用 `pinFrom !== null` 判断「是否已定住」，
 * `undefined !== null` 恒为 true，会把所有老任务误判成「已定住」——
 * 表现就是图钉恒实心、点它只能「取消长期任务」、`pin()` 因 `pinFrom !== null`
 * 直接 return，导致「只能取消、不能添加」。
 * 仓储必须在读取出口把缺字段归一化为 `null`。
 */
describe('IndexedDbTaskRepository 归一化', () => {
  it('老数据缺 pinFrom / pinUntil 时，读出来归一化为 null（而非 undefined）', async () => {
    const db = new AppDatabase(`task-normalize-${Date.now()}`);
    await db.open();

    // 直接往底层 Dexie 表塞一条「老数据」—— 不带 pinFrom / pinUntil 字段。
    // 用 as 断言绕过类型约束：真实老数据在运行时确实缺这些字段
    // （Dexie 非索引字段无 schema 约束，旧版写入的对象就是没有这几个 key）。
    await db.tasks.put({
      id: 't-old',
      date: '2026-10-10',
      content: '老任务',
      done: false,
      order: 1000,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      inheritedFrom: null,
      // 故意不写 sectionId / kind / description / pinFrom / pinUntil
    } as unknown as Task);

    const repo = new IndexedDbTaskRepository(db);
    const all = await repo.listAll();
    const task = all.find((t) => t.id === 't-old');

    expect(task).toBeDefined();
    // 缺字段必须归一化，业务层拿到的永远是规范值而非 undefined
    expect(task?.sectionId).toBe('other');
    expect(task?.kind).toBe('daily');
    expect(task?.description).toBe('');
    expect(task?.pinFrom).toBeNull();
    expect(task?.pinUntil).toBeNull();

    db.close();
  });

  it('已有定住字段的任务，读取时原样保留', async () => {
    const db = new AppDatabase(`task-normalize-pin-${Date.now()}`);
    await db.open();

    await db.tasks.put({
      id: 't-pinned',
      date: '2026-10-10',
      content: '已定住任务',
      sectionId: 'work',
      kind: 'daily',
      description: '',
      done: false,
      order: 2000,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      inheritedFrom: null,
      pinFrom: '2026-10-10',
      pinUntil: null,
    });

    const repo = new IndexedDbTaskRepository(db);
    const all = await repo.listAll();
    const task = all.find((t) => t.id === 't-pinned');

    expect(task?.pinFrom).toBe('2026-10-10');
    expect(task?.pinUntil).toBeNull();

    db.close();
  });
});
