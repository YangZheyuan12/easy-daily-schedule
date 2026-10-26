import { nanoid } from 'nanoid';

/**
 * 全局唯一的 id 生成入口。
 *
 * 约定：**组件禁止直接 import nanoid**，一律走这里。
 * 这样将来换 id 策略（比如服务端下发、需要带前缀便于同步）只改一个文件。
 *
 * 为什么不用 crypto.randomUUID：它要求 secure context（https 或 localhost），
 * 且微信小程序环境没有这个 API。nanoid 无此限制。
 */
export function newId(prefix = ''): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}

export const newItemId = (): string => newId('it');
export const newTaskId = (): string => newId('tk');
export const newPinCompletionId = (taskId: string, date: string): string => `${taskId}@${date}`;
