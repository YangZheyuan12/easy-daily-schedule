/** 数组与集合辅助（纯函数，无副作用） */

/** 稳定排序，返回新数组 */
export function sortBy<T>(list: readonly T[], key: (item: T) => number): T[] {
  return [...list].sort((a, b) => key(a) - key(b));
}

/** 按 key 分组成 Map */
export function groupBy<T, K>(list: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** 去重（保持首次出现顺序） */
export function unique<T>(list: readonly T[]): T[] {
  return [...new Set(list)];
}

/** 移除数组中第一个满足条件的元素，返回新数组 */
export function removeFirst<T>(list: readonly T[], predicate: (item: T) => boolean): T[] {
  const index = list.findIndex(predicate);
  if (index === -1) return [...list];
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

/** 把数组按相邻元素插入分隔表达式（渲染列表时用） */
export function interleave<T, S>(list: readonly T[], separator: (index: number) => S): (T | S)[] {
  const result: (T | S)[] = [];
  list.forEach((item, i) => {
    if (i > 0) result.push(separator(i));
    result.push(item);
  });
  return result;
}

/** 数值裁剪 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
