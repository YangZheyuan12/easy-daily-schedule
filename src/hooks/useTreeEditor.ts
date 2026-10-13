import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SectionKey } from '@/domain/enums';
import type { VisibleRow } from '@/domain/types';
import { useItemStore } from '@/store/useItemStore';
import { selectVisibleRows } from '@/store/selectors';

/**
 * 树形编辑的键盘交互。
 *
 * 键位（对齐主流大纲编辑器的肌肉记忆）：
 * - `Enter`    在当前条目后新增同级，并自动聚焦新行 —— 连续录入的关键
 * - `Tab`      降级，挂到上一个同级兄弟之下
 * - `Shift+Tab` 升级
 * - `Backspace` 标题为空时删除当前条目，焦点回到上一行
 * - `↑ / ↓`    在可见行之间移动焦点
 */
export function useTreeEditor(date: string, sectionId: SectionKey) {
  const items = useItemStore((s) => s.items);
  const [focusId, setFocusId] = useState<string | null>(null);
  const composingRef = useRef(false);

  const rows = useMemo(
    () => selectVisibleRows(items, sectionId),
    [items, sectionId],
  );

  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.item.id, index));
    return map;
  }, [rows]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, row: VisibleRow) => {
      const store = useItemStore.getState();
      const id = row.item.id;

      if (event.key === 'Enter') {
        event.preventDefault();
        const newId = store.addSibling(id, date, sectionId);
        if (newId) setFocusId(newId);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        if (event.shiftKey) store.outdent(id);
        else store.indent(id);
        setFocusId(id);
        return;
      }

      if (event.key === 'Backspace' && row.item.title === '') {
        event.preventDefault();
        const index = rowIndexById.get(id) ?? -1;
        const prev = rows[index - 1];
        store.remove(id);
        setFocusId(prev?.item.id ?? null);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const index = rowIndexById.get(id) ?? -1;
        const target = rows[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (target) {
          event.preventDefault();
          setFocusId(target.item.id);
        }
      }
    },
    [date, rowIndexById, rows, sectionId],
  );

  return { rows, focusId, setFocusId, handleKeyDown, composingRef };
}
