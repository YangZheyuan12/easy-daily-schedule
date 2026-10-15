import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTION_PROFILES,
  SECTION_COLOR_CHOICES,
  SECTION_ICON_CHOICES,
  SECTION_CONFIGS,
  normalizeSectionProfiles,
  resolveSectionConfigs,
  resolveTaskSectionConfigs,
  sectionColor,
  sectionTint,
  type SectionProfileMap,
} from '@/domain/constants';
import { SECTION_KEYS, OTHER_KEY, isSectionKey } from '@/domain/enums';

/**
 * 板块自定义（名称 / 颜色 / 图标）的 domain 契约。
 *
 * 为什么必须在这里锁住：改名改色**影响全站** —— 今日页组头与周视图田字格标题、
 * 板块详情页、任务分组、时间轴分组、日历时长与完成情况统计，全都读这一份合成结果。
 * 两条最容易漂的边界：
 * 1. **默认档案合成出来的结果必须与 `SECTION_CONFIGS` 逐字段相等**。
 *    这条不成立 = 没自定义过的设备上渲染变了（比如主色从 CSS 变量变成 hex，
 *    换主题时板块色不再跟随），而这种回归在 UI 测试里很难看出来。
 * 2. **颜色必须能表达「没改过」**（null），不能退化成「改成了内置 hex」——
 *    后者会让三套主题各自的板块色板被同一个 hex 顶掉。
 */

/** 空档案 = 没有任何自定义 */
function emptyProfiles(): SectionProfileMap {
  return SECTION_KEYS.reduce((acc, key) => {
    acc[key] = { ...DEFAULT_SECTION_PROFILES[key] };
    return acc;
  }, {} as SectionProfileMap);
}

describe('resolveSectionConfigs — 默认档案（没自定义过）', () => {
  it('合成结果与 SECTION_CONFIGS 逐字段相等', () => {
    const resolved = resolveSectionConfigs(emptyProfiles());
    expect(resolved).toEqual(SECTION_CONFIGS);
  });

  it('null / undefined 档案也回落成内置配置', () => {
    expect(resolveSectionConfigs(null)).toEqual(SECTION_CONFIGS);
    expect(resolveSectionConfigs(undefined)).toEqual(SECTION_CONFIGS);
  });

  it('主色走 CSS 变量，浅底是同一变量 + 12% alpha', () => {
    const [work] = resolveSectionConfigs(emptyProfiles());
    expect(sectionColor(work!)).toBe('rgb(var(--c-work))');
    expect(sectionTint(work!)).toBe('rgb(var(--c-work) / 0.12)');
  });
});

describe('resolveSectionConfigs — 改名 / 改色 / 改图标', () => {
  it('改名后组名与 placeholder 一起变（placeholder 要说清这行会记到哪）', () => {
    const profiles = emptyProfiles();
    profiles.study.name = '冥想';
    const [study] = resolveSectionConfigs(profiles).filter((c) => c.key === 'study');

    expect(study!.name).toBe('冥想');
    expect(study!.placeholder).toBe('记录一项冥想…');
  });

  it('改色后主色钉死成 hex，浅底是同一 hex + 12% alpha', () => {
    const profiles = emptyProfiles();
    profiles.fitness.color = '#F43F5E';
    const fitness = resolveSectionConfigs(profiles).find((c) => c.key === 'fitness')!;

    expect(sectionColor(fitness)).toBe('#F43F5E');
    // 12% → 0.12 * 255 ≈ 31 = 0x1F
    expect(sectionTint(fitness)).toBe('#F43F5E1f');
    // 颜色基准值也同步（需要真实 hex 的场合：导出 / 断言）
    expect(fitness.color).toBe('#F43F5E');
    expect(fitness.tint).toBe('#F43F5E1f');
  });

  it('只改一个板块，另外三个仍是主题色', () => {
    const profiles = emptyProfiles();
    profiles.work.color = '#F43F5E';
    const resolved = resolveSectionConfigs(profiles);

    expect(sectionColor(resolved[0]!)).toBe('#F43F5E');
    for (const cfg of resolved.slice(1)) {
      expect(sectionColor(cfg)).toBe(`rgb(var(${cfg.cssVar}))`);
    }
  });

  it('颜色为 null（没改）→ 继续走主题色，而不是内置 hex', () => {
    const profiles = emptyProfiles();
    profiles.work.color = null;
    const [work] = resolveSectionConfigs(profiles);
    expect(sectionColor(work!)).toBe('rgb(var(--c-work))');
  });

  it('改图标不牵动名字与颜色', () => {
    const profiles = emptyProfiles();
    profiles.life.icon = '🧘';
    const life = resolveSectionConfigs(profiles).find((c) => c.key === 'life')!;
    expect(life.icon).toBe('🧘');
    expect(life.name).toBe('生活');
    expect(sectionColor(life)).toBe('rgb(var(--c-life))');
  });
});

describe('normalizeSectionProfiles — 脏配置的收敛', () => {
  it('四个键恒齐全，缺的补默认（调用方不必判空）', () => {
    const profiles = normalizeSectionProfiles({ work: { name: '干活' } });
    expect(Object.keys(profiles).sort()).toEqual([...SECTION_KEYS].sort());
    expect(profiles.work.name).toBe('干活');
    expect(profiles.study).toEqual(DEFAULT_SECTION_PROFILES.study);
  });

  it('非对象 / null / 字符串输入都安全回落', () => {
    expect(normalizeSectionProfiles(null)).toEqual(DEFAULT_SECTION_PROFILES);
    expect(normalizeSectionProfiles('x')).toEqual(DEFAULT_SECTION_PROFILES);
    expect(normalizeSectionProfiles(42)).toEqual(DEFAULT_SECTION_PROFILES);
  });

  it('颜色必须是 6 位 hex，否则回落成 null（= 用主题色）', () => {
    expect(normalizeSectionProfiles({ life: { color: '#xyz' } }).life.color).toBeNull();
    expect(normalizeSectionProfiles({ life: { color: '#abc' } }).life.color).toBeNull();
    expect(normalizeSectionProfiles({ life: { color: 'red' } }).life.color).toBeNull();
    expect(normalizeSectionProfiles({ life: { color: 123 } }).life.color).toBeNull();
    expect(normalizeSectionProfiles({ life: { color: '#0EA5E9' } }).life.color).toBe('#0EA5E9');
  });

  it('名字空串 / 纯空白 → 回落默认名（组头不能变成一片空白）', () => {
    expect(normalizeSectionProfiles({ work: { name: '   ' } }).work.name).toBe('工作');
    expect(normalizeSectionProfiles({ work: { name: '' } }).work.name).toBe('工作');
    expect(normalizeSectionProfiles({ work: { name: '干活' } }).work.name).toBe('干活');
  });

  it('超长名字被截断到 SECTION_NAME_MAX', () => {
    const long = '一'.repeat(20);
    expect(normalizeSectionProfiles({ work: { name: long } }).work.name.length).toBeLessThanOrEqual(
      6,
    );
  });

  it('图标空串 → 回落默认图标', () => {
    expect(normalizeSectionProfiles({ work: { icon: '  ' } }).work.icon).toBe('💼');
    expect(normalizeSectionProfiles({ work: { icon: '🧠' } }).work.icon).toBe('🧠');
  });

  it('单个板块的归一化不会污染其他板块', () => {
    const profiles = emptyProfiles();
    profiles.study.name = '冥想';
    const merged = normalizeSectionProfiles(profiles);
    expect(merged.study.name).toBe('冥想');
    expect(merged.work.name).toBe('工作');
  });
});

describe('色板与图标候选', () => {
  it('色板全是合法 6 位 hex，且没有重复', () => {
    for (const color of SECTION_COLOR_CHOICES) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(new Set(SECTION_COLOR_CHOICES).size).toBe(SECTION_COLOR_CHOICES.length);
  });

  it('图标候选没有重复，且包含四个内置默认图标', () => {
    expect(new Set(SECTION_ICON_CHOICES).size).toBe(SECTION_ICON_CHOICES.length);
    for (const cfg of SECTION_CONFIGS) {
      expect(SECTION_ICON_CHOICES).toContain(cfg.icon);
    }
  });
});

describe('resolveTaskSectionConfigs — 任务分组', () => {
  it('四大板块跟着改名，顺序不变，「其他」恒垫底', () => {
    const profiles = emptyProfiles();
    profiles.work.name = '搬砖';
    const configs = resolveTaskSectionConfigs(resolveSectionConfigs(profiles));

    expect(configs.map((c) => c.name)).toEqual(['搬砖', '学习', '健身', '生活', '其他']);
    expect(configs[4]!.key).toBe(OTHER_KEY);
  });

  it('「其他」的颜色与 cssColor 取弱化墨色（不给它彩色，免得被误认为第五个板块）', () => {
    const [other] = resolveTaskSectionConfigs().slice(-1);
    expect(other!.cssVar).toBe('--c-ink-faint');
    expect(other!.cssColor).toBe('rgb(var(--c-ink-faint))');
  });
});

describe('SectionKey 约定（键不可改、数量固定）', () => {
  it('恒为 4 个键', () => {
    expect(SECTION_KEYS).toHaveLength(4);
  });

  it('非法值不被当成板块', () => {
    expect(isSectionKey('other')).toBe(false);
    expect(isSectionKey('inspiration')).toBe(false);
    expect(isSectionKey('冥想')).toBe(false);
  });
});
