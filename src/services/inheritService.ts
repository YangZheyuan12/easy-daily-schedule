import type { Task } from '@/domain/types';
import { newTaskId } from './idService';
import type { Clock } from './clock';

export interface InheritResult {
  /** 新建的任务（调用方负责落库） */
  created: Task[];
  /** 本次被跳过的数量：已存在同来源或同内容的任务 */
  skipped: number;
}

/**
 * 「继承昨日未完成」。
 *
 * 幂等是这里的硬要求 —— 用户连点 3 次不能产生 3 份重复任务。
 * 双重去重：
 * 1. `inheritedFrom` 命中：今天已有一条继承自该昨日任务的任务；
 * 2. 内容 hash 命中：今天已有一条内容相同的未完成任务（防止跨天多次继承或手写重名）。
 */
function contentHash(content: string): string {
  return content.trim().replace(/\s+/g, '');
}

export function inheritUnfinishedTasks(
  todayTasks: readonly Task[],
  yesterdayTasks: readonly Task[],
  today: string,
  clock: Clock,
): InheritResult {
  const alive = (list: readonly Task[]) => list.filter((t) => t.deletedAt === null);

  const todayAlive = alive(todayTasks);
  const inheritedSourceIds = new Set(
    todayAlive.map((t) => t.inheritedFrom).filter((id): id is string => id !== null),
  );
  const todayContentKeys = new Set(
    todayAlive.filter((t) => !t.done).map((t) => contentHash(t.content)),
  );

  const pending = alive(yesterdayTasks)
    .filter((t) => !t.done)
    .sort((a, b) => a.order - b.order);

  const now = clock.now();
  const created: Task[] = [];
  let skipped = 0;
  let orderCursor =
    todayAlive.reduce((max, t) => Math.max(max, t.order), 0) + 1000;

  for (const source of pending) {
    const key = contentHash(source.content);
    if (inheritedSourceIds.has(source.id) || todayContentKeys.has(key)) {
      skipped += 1;
      continue;
    }
    // 同一次调用内也要去重，防止昨日自身存在重复内容
    if (created.some((t) => contentHash(t.content) === key)) {
      skipped += 1;
      continue;
    }

    created.push({
      id: newTaskId(),
      date: today,
      content: source.content,
      // 继承时**带上原分组**：昨天把「开组会」归在工作，今天继承过来还是工作，
      // 否则它会掉进「其他」，用户还得重新分一遍
      sectionId: source.sectionId,
      // 继承出来的一定是「每日任务」，且不带描述（描述跟来源任务走会显得突兀）
      kind: 'daily',
      description: '',
      done: false,
      order: orderCursor,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      inheritedFrom: source.id,
      pinFrom: null,
      pinUntil: null,
    });
    orderCursor += 1000;
    todayContentKeys.add(key);
  }

  return { created, skipped };
}
