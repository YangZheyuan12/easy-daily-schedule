import type {
  DailySelfStatus,
  Inspiration,
  Item,
  Routine,
  RoutineCompletion,
  Task,
  TimeSlot,
} from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
import { OTHER_KEY } from '@/domain/enums';
import { ORDER_STEP } from '@/domain/constants';

/** 测试用条目工厂 */
export function makeItem(partial: Partial<Item> & { id: string }): Item {
  return {
    date: '2026-10-10',
    sectionId: 'work' as SectionKey,
    parentId: null,
    title: partial.id,
    level: 0,
    order: ORDER_STEP,
    done: false,
    collapsed: false,
    description: '',
    rating: 0,
    review: '',
    createdAt: 1000,
    updatedAt: 1000,
    sourceTaskId: null,
    sourceSlotId: null,
    deletedAt: null,
    ...partial,
  };
}

export function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    date: '2026-10-10',
    content: partial.id,
    // 默认「其他」—— 与仓储归一化、新建任务的默认值一致
    sectionId: OTHER_KEY,
    done: false,
    order: ORDER_STEP,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    inheritedFrom: null,
    ...partial,
  };
}

/** 测试用时间段工厂 */
export function makeSlot(partial: Partial<TimeSlot> & { id: string }): TimeSlot {
  return {
    date: '2026-10-10',
    startMin: 9 * 60,
    endMin: 10 * 60,
    actualStartMin: null,
    actualEndMin: null,
    content: partial.id,
    sectionId: null,
    done: false,
    order: ORDER_STEP,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    ...partial,
  };
}

/** 测试用自我状态（心情 + 身体）工厂 */
export function makeSelfStatus(
  partial: Partial<DailySelfStatus> & { date: string },
): DailySelfStatus {
  return {
    mood: 0,
    moodText: '',
    body: 0,
    bodyText: '',
    updatedAt: 1000,
    ...partial,
  };
}

/** 测试用灵感工厂 */
export function makeInspiration(partial: Partial<Inspiration> & { id: string }): Inspiration {
  return {
    date: '2026-10-10',
    content: partial.id,
    order: ORDER_STEP,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    ...partial,
  };
}

/** 测试用每日固定任务（例行模板）工厂 */
export function makeRoutine(partial: Partial<Routine> & { id: string }): Routine {
  return {
    title: partial.id,
    sectionId: OTHER_KEY,
    order: ORDER_STEP,
    description: '',
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    ...partial,
  };
}

/** 测试用每日固定任务完成记录工厂 */
export function makeRoutineCompletion(
  partial: Partial<RoutineCompletion> & { id: string },
): RoutineCompletion {
  return {
    routineId: 'rt1',
    date: '2026-10-10',
    done: false,
    updatedAt: 1000,
    ...partial,
  };
}
