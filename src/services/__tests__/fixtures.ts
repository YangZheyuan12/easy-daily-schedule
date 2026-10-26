import type {
  Account,
  AuthToken,
  DailySelfStatus,
  Entitlement,
  Inspiration,
  Item,
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
    pinFrom: null,
    pinUntil: null,
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

/** 测试用账号画像工厂（主键固定 'current'，token 不入库） */
export function makeAccount(partial: Partial<Account> & { userId: string }): Account {
  return {
    id: 'current',
    phone: null,
    email: null,
    displayName: null,
    avatarUrl: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...partial,
  };
}

/** 测试用鉴权令牌工厂（默认 1 小时后过期） */
export function makeAuthToken(partial: Partial<AuthToken> = {}): AuthToken {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: 1000 + 60 * 60 * 1000,
    ...partial,
  };
}

/** 测试用权益快照工厂（默认免费 / 未生效） */
export function makeEntitlement(partial: Partial<Entitlement> = {}): Entitlement {
  return {
    id: 'current',
    plan: 'free',
    state: 'none',
    expireAt: null,
    graceUntil: null,
    provider: null,
    receiptRef: null,
    updatedAt: 1000,
    ...partial,
  };
}
