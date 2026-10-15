import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/repositories';
import { useItemImageStore } from '@/store/useItemImageStore';

function makeImageFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
}

describe('useItemImageStore', () => {
  beforeEach(async () => {
    useItemImageStore.setState({ byItem: {}, loadedKey: '' });
    await db.itemImages.clear();
  });

  it('add 乐观更新本地并落库', async () => {
    await useItemImageStore.getState().add('it1', [makeImageFile(), makeImageFile()]);
    const local = useItemImageStore.getState().byItem['it1'];
    expect(local).toHaveLength(2);

    // 重新从库里读，确认持久化成功
    await useItemImageStore.getState().loadForItems(['it1'], 'k1');
    expect(useItemImageStore.getState().byItem['it1']).toHaveLength(2);
  });

  it('add 过滤非图片文件', async () => {
    const text = new File([new Uint8Array([1])], 'note.txt', { type: 'text/plain' });
    await useItemImageStore.getState().add('it1', [makeImageFile(), text]);
    expect(useItemImageStore.getState().byItem['it1']).toHaveLength(1);
  });

  it('remove 删除本地与落库', async () => {
    await useItemImageStore.getState().add('it1', [makeImageFile()]);
    const id = useItemImageStore.getState().byItem['it1'][0].id;
    await useItemImageStore.getState().remove(id, 'it1');
    expect(useItemImageStore.getState().byItem['it1']).toHaveLength(0);
    await useItemImageStore.getState().loadForItems(['it1'], 'k2');
    // 重新加载后无图片的条目不会出现在 byItem 里（组件以空数组兜底）
    expect(useItemImageStore.getState().byItem['it1'] ?? []).toHaveLength(0);
  });

  it('loadForItems 按 key 去重，同 key 不重复查询', async () => {
    await useItemImageStore.getState().loadForItems(['it1'], 'dateA');
    await useItemImageStore.getState().loadForItems(['it1'], 'dateA');
    expect(useItemImageStore.getState().loadedKey).toBe('dateA');
  });
});
