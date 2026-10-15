import { useMemo } from 'react';
import { useSectionProfileStore } from '@/store/useSectionProfileStore';
import {
  resolveTaskSectionConfigs,
  type SectionConfig,
  type TaskSectionConfig,
} from '@/domain/constants';
import type { SectionKey, TaskSectionKey } from '@/domain/enums';

/**
 * 板块展示配置的读取口。
 *
 * 🔴 组件要显示板块名 / 板块色时**一律走这里**，不要直接 import
 * `SECTION_CONFIGS` / `SECTION_CONFIG_MAP` —— 那份是**内置默认值**，
 * 用户改了名或改了色之后它会变成过期数据，页面上就会出现「设置里叫 A、页面上还是 B」。
 *
 * store 里的 `configs` 是写入时算好的派生值（稳定引用），所以这里不需要 useMemo 兜底，
 * 也不会因为每行都调一次而重复计算。
 */
export function useSectionConfigs(): readonly SectionConfig[] {
  return useSectionProfileStore((s) => s.configs);
}

/** 按 key 取一个板块的配置 */
export function useSectionConfig(key: SectionKey): SectionConfig {
  const configs = useSectionConfigs();
  // 四个键恒齐全（normalizeSectionProfiles 保证），find 只是为了满足类型
  return configs.find((cfg) => cfg.key === key) ?? configs[0];
}

/** 四大板块 +「其他」，用于任务分组 */
export function useTaskSectionConfigs(): readonly TaskSectionConfig[] {
  const configs = useSectionConfigs();
  return useMemo(() => resolveTaskSectionConfigs(configs), [configs]);
}

/** 按 key 取一个任务分组的配置 */
export function useTaskSectionConfig(key: TaskSectionKey): TaskSectionConfig {
  const configs = useTaskSectionConfigs();
  return configs.find((cfg) => cfg.key === key) ?? configs[configs.length - 1];
}
