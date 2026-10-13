import { DomainError } from '@/domain/errors';

/** 断言值非空，否则抛 DomainError。用于收窄类型。 */
export function assertDefined<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) {
    throw new DomainError(message);
  }
  return value;
}

/** 断言条件成立 */
export function assertTrue(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new DomainError(message);
  }
}
