import { useEffect, useRef } from 'react';

/**
 * textarea 随内容自动增高。
 *
 * 移动端写长文本时，固定高度的框会让人不敢往下写；
 * 自动增高能让「任务描述」这种字段真正被用起来。
 */
export function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return ref;
}
