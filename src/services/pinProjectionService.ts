import type { PinCompletion, Task } from '@/domain/types';
import { isDailyTask } from '@/domain/enums';

/**
 * 「定住」投影的纯逻辑（零浏览器 API，可单测）。
 *
 * 「定住」= 给一条每日任务打上 `pinFrom`（起始日），它就从那天起、之后每一天
 * 都自动出现，像一个跨日期复用的模板。加载日期 D 时，凡 `pinFrom <= D` 且未取消
 * （`pinUntil === null || D < pinUntil`）的定住模板都会被投影成 D 当天的任务。
 *
 * 完成态按 `taskId + date` 维度独立存在（`PinCompletion`）——「今天勾没勾」是
 * 每天一份的。定住任务（`pinFrom !== null`）的 done **一律**从 pinCompletions 读，
 * 不再用 tasks 表里的 done 字段，保证「定住当天」与「之后投影的日子」口径一致。
 *
 * 日期键是定长 'YYYY-MM-DD'，字典序即时间序，直接字符串比较即可。
 */

/** 判断一条任务在日期 D 是否应被投影出来 */
export function isPinnedOn(task: Pick<Task, 'pinFrom' | 'pinUntil'>, date: string): boolean {
  const from = task.pinFrom;
  if (from === null) return false;
  if (from > date) return false;
  const until = task.pinUntil;
  if (until !== null && date >= until) return false;
  return true;
}

/**
 * 判断一条任务当前是否「活跃定住中」（已定住、且尚未取消）。
 *
 * 🔴 与「投影是否生效」(`isPinnedOn`) 是**两个不同概念**，不能混用：
 * - `isPinnedOn(task, D)` 问的是「这条任务在日期 D 该不该出现」——取消是**延迟**的
 *   （`pinUntil = 取消日 + 1`），所以取消当天它**仍投影**（D < pinUntil），返回 true；
 * - 本函数问的是「用户有没有把它设为长期任务、且还没点取消」——只要设过 `pinUntil`
 *   就视为已取消，返回 false，与具体日期无关。
 *
 * UI 的图钉图标 / 点击文案该用**本函数**：用户点「取消」后，图钉应立即从实心竖直
 * 变回空心斜向，而不是等第二天投影真正停掉才变 —— 否则「取消」看起来像没生效。
 */
export function isActivelyPinned(task: Pick<Task, 'pinFrom' | 'pinUntil'>): boolean {
  return task.pinFrom !== null && task.pinUntil === null;
}

/**
 * 判断一条「定住」任务在当前日期 D 是否为**投影**（来自更早的定住），
 * 而非「定住当天」的本体。
 *
 * 投影任务不参与「同步到今日页」（它的 `date` 仍是定住当天，不是 D，
 * 会被 planTaskSync 的日期过滤排除）—— 定住任务每天自动重复，本就无需
 * 再手动同步，这里显式判投影是为了让同步计数不把它算进去。
 */
export function isPinProjection(task: Pick<Task, 'pinFrom' | 'date'>, date: string): boolean {
  return task.pinFrom !== null && task.pinFrom < date;
}

/**
 * 合成日期 D 的完整每日任务列表（真实任务 + 定住投影）。
 *
 * 输入 `allTasks` 是全量任务（含定住模板、软删记录），`completions` 是 D 当天的
 * 定住完成态。返回按 order 稳定排序的、**done 已按上面规则统一** 的列表。
 *
 * 🔴 投影任务**不覆盖 `date` 字段**：投影对象就是模板本体的浅拷贝（仅额外覆盖
 * `done`），date 仍是模板的「定住当天」。这样对它做编辑（改标题/分组）落库时
 * upsert 回 tasks 表不会污染模板的 date；「投影到哪天」由调用方（store）持有。
 *
 * 去重：D === 定住当天时，模板本体就是 D 的真实任务（已含在 daily 里），
 * 不再额外投影一份。
 */
export function composeDailyTasks(
  allTasks: readonly Task[],
  date: string,
  completions: readonly PinCompletion[],
): Task[] {
  const doneByTask = new Map(completions.map((c) => [c.taskId, c.done]));

  const daily = allTasks.filter(
    (task) => task.date === date && task.deletedAt === null && isDailyTask(task),
  );

  const dailyIds = new Set(daily.map((task) => task.id));
  const projected = allTasks.filter(
    (task) =>
      task.deletedAt === null &&
      isDailyTask(task) &&
      task.pinFrom !== null &&
      isPinnedOn(task, date) &&
      !dailyIds.has(task.id),
  );

  // 真实任务里，定住模板本体的 done 也要统一从 pinCompletions 读
  const resolvedDaily = daily.map((task) =>
    task.pinFrom !== null && doneByTask.has(task.id)
      ? { ...task, done: doneByTask.get(task.id) ?? false }
      : task,
  );

  const projectedResolved = projected.map((task) => ({
    ...task,
    done: doneByTask.get(task.id) ?? false,
  }));

  return [...resolvedDaily, ...projectedResolved].sort(
    (a, b) => a.order - b.order || a.createdAt - b.createdAt,
  );
}
