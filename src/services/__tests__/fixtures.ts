import type { DailySelfStatus, Inspiration, Item, Task, TimeSlot } from '@/domain/types';
import type { SectionKey } from '@/domain/enums';
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
    deletedAt: null,
    ...partial,
  };
}

export function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    date: '2026-10-10',
    content: partial.id,
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
