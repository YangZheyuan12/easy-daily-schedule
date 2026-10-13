/**
 * 领域枚举 / 字面量联合类型。
 *
 * 本文件属于 domain 层：零依赖、不引入任何浏览器 API，
 * 迁移到微信小程序时可 100% 复用。
 */

/** 四大板块的键。一期固定四个，不可增删。 */
export const SECTION_KEYS = ['work', 'study', 'fitness', 'life'] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === 'string' && (SECTION_KEYS as readonly string[]).includes(value);
}

/** 评分取值：0 表示未评分，1–5 为星级。 */
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

export function isRating(value: unknown): value is Rating {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;
}
