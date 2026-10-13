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
import { LocalSettingsRepository } from './LocalSettingsRepository';

export { db };
export { IndexedDbItemRepository } from './IndexedDbItemRepository';
export { IndexedDbTaskRepository } from './IndexedDbTaskRepository';
export {
  IndexedDbDayRepository,
  IndexedDbSelfStatusRepository,
} from './IndexedDbDayRepository';
export { IndexedDbTimeSlotRepository } from './IndexedDbTimeSlotRepository';
export { IndexedDbInspirationRepository } from './IndexedDbInspirationRepository';
export { LocalSettingsRepository, MemorySettingsRepository } from './LocalSettingsRepository';

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
    settings: new LocalSettingsRepository(),
  };
}
