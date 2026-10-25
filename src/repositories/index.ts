import type { Repositories } from '@/domain/ports';
import { db } from './db/DexieDatabase';
import { IndexedDbItemRepository } from './IndexedDbItemRepository';
import { IndexedDbTaskRepository } from './IndexedDbTaskRepository';
import {
  IndexedDbDayRepository,
  IndexedDbSelfStatusRepository,
} from './IndexedDbDayRepository';
import { IndexedDbTimeSlotRepository } from './IndexedDbTimeSlotRepository';
import { IndexedDbInspirationRepository } from './IndexedDbInspirationRepository';
import { IndexedDbItemImageRepository } from './IndexedDbItemImageRepository';
import { IndexedDbTaskImageRepository } from './IndexedDbTaskImageRepository';
import { IndexedDbRoutineRepository } from './IndexedDbRoutineRepository';
import { IndexedDbRoutineCompletionRepository } from './IndexedDbRoutineCompletionRepository';
import { IndexedDbAccountRepository } from './IndexedDbAccountRepository';
import { IndexedDbEntitlementRepository } from './IndexedDbEntitlementRepository';
import { LocalSettingsRepository } from './LocalSettingsRepository';
import { IndexedDbSyncStateRepository } from './IndexedDbSyncStateRepository';

export { db };
export { IndexedDbItemRepository } from './IndexedDbItemRepository';
export { IndexedDbTaskRepository } from './IndexedDbTaskRepository';
export {
  IndexedDbDayRepository,
  IndexedDbSelfStatusRepository,
} from './IndexedDbDayRepository';
export { IndexedDbTimeSlotRepository } from './IndexedDbTimeSlotRepository';
export { IndexedDbInspirationRepository } from './IndexedDbInspirationRepository';
export { IndexedDbItemImageRepository } from './IndexedDbItemImageRepository';
export { IndexedDbTaskImageRepository } from './IndexedDbTaskImageRepository';
export { IndexedDbRoutineRepository } from './IndexedDbRoutineRepository';
export { IndexedDbRoutineCompletionRepository } from './IndexedDbRoutineCompletionRepository';
export { IndexedDbAccountRepository } from './IndexedDbAccountRepository';
export { IndexedDbEntitlementRepository } from './IndexedDbEntitlementRepository';
export { LocalSettingsRepository, MemorySettingsRepository } from './LocalSettingsRepository';
export {
  IndexedDbSyncStateRepository,
  MemorySyncStateRepository,
} from './IndexedDbSyncStateRepository';
export { MemorySyncGateway } from './MemorySyncGateway';

/**
 * 全项目**唯一**的仓储装配点。
 *
 * 切换存储实现（本地 → 云端 / 小程序）只需要改这一个函数，
 * 上层通过 `@/store/bootstrap` 注入拿到的始终是 `Repositories` 接口。
 */
export function createRepositories(): Repositories {
  return {
    items: new IndexedDbItemRepository(db),
    tasks: new IndexedDbTaskRepository(db),
    days: new IndexedDbDayRepository(db),
    selfStatus: new IndexedDbSelfStatusRepository(db),
    timeSlots: new IndexedDbTimeSlotRepository(db),
    inspirations: new IndexedDbInspirationRepository(db),
    itemImages: new IndexedDbItemImageRepository(db),
    taskImages: new IndexedDbTaskImageRepository(db),
    routines: new IndexedDbRoutineRepository(db),
    routineCompletions: new IndexedDbRoutineCompletionRepository(db),
    account: new IndexedDbAccountRepository(db),
    entitlements: new IndexedDbEntitlementRepository(db),
    settings: new LocalSettingsRepository(),
    syncState: new IndexedDbSyncStateRepository(db),
  };
}
