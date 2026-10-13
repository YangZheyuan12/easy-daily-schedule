/**
 * 分层错误类型。
 *
 * 约定：
 * - domain / services 层只抛 DomainError 及其子类，不感知存储细节；
 * - repositories 层把底层异常（IndexedDB 报错等）翻译成 StorageError 再上抛；
 * - UI 层统一捕获 AppError 并渲染对应的错误态，禁止把原始错误对象直接展示给用户。
 */

export type AppErrorKind = 'domain' | 'storage' | 'unknown';

export abstract class AppError extends Error {
  abstract readonly kind: AppErrorKind;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // 保持原型链，避免 TS 编译到 ES5 时 instanceof 失效
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 业务规则被违反（例如：对顶层条目执行 Shift+Tab） */
export class DomainError extends AppError {
  readonly kind = 'domain' as const;
}

/** 存储层失败（建库失败、事务失败、配额超限等） */
export class StorageError extends AppError {
  readonly kind = 'storage' as const;
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** 把任意异常归一化成 AppError，便于 UI 统一处理 */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  if (value instanceof Error) return new StorageError(value.message, value);
  return new StorageError(String(value), value);
}
