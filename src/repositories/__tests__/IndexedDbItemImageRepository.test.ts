import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { IndexedDbItemImageRepository } from '@/repositories/IndexedDbItemImageRepository';
import type { ItemImage } from '@/domain/types';

let counter = 0;

async function makeRepo(): Promise<{ db: AppDatabase; repo: IndexedDbItemImageRepository }> {
  const name = `img-repo-${counter++}`;
  const db = new AppDatabase(name);
  await db.open();
  return { db, repo: new IndexedDbItemImageRepository(db) };
}

function makeImage(id: string, itemId: string, createdAt: number): ItemImage {
  return {
    id,
    itemId,
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    createdAt,
  };
}

describe('IndexedDbItemImageRepository', () => {
  it('listByItemIds 按 itemId 过滤并按 createdAt 升序', async () => {
    const { db, repo } = await makeRepo();
    await repo.putMany([makeImage('a', 'it1', 30), makeImage('b', 'it2', 10), makeImage('c', 'it1', 10)]);
    const rows = await repo.listByItemIds(['it1']);
    expect(rows.map((row) => row.id)).toEqual(['c', 'a']);
    db.close();
  });

  it('listByItemIds 空数组返回 []（不查询）', async () => {
    const { db, repo } = await makeRepo();
    expect(await repo.listByItemIds([])).toEqual([]);
    db.close();
  });

  it('delete 删除单张图片', async () => {
    const { db, repo } = await makeRepo();
    await repo.putMany([makeImage('a', 'it1', 1)]);
    await repo.delete('a');
    expect(await repo.listByItemIds(['it1'])).toHaveLength(0);
    db.close();
  });

  it('purgeOrphans 只清掉 itemId 已不存在的附件', async () => {
    const { db, repo } = await makeRepo();
    await repo.putMany([makeImage('a', 'it1', 1), makeImage('b', 'it2', 2)]);
    const removed = await repo.purgeOrphans(new Set(['it1']));
    expect(removed).toBe(1);
    expect((await repo.listByItemIds(['it1', 'it2'])).map((row) => row.id)).toEqual(['a']);
    db.close();
  });
});
