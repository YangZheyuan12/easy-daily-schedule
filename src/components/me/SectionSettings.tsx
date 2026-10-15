import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useSectionConfigs } from '@/hooks/useSectionConfigs';
import { useExpanded } from '@/hooks/useExpanded';
import { useSectionProfileStore } from '@/store/useSectionProfileStore';
import {
  SECTION_COLOR_CHOICES,
  SECTION_ICON_CHOICES,
  SECTION_NAME_MAX,
  sectionColor,
  sectionTint,
  type SectionConfig,
} from '@/domain/constants';
import type { SectionKey } from '@/domain/enums';

/**
 * 板块自定义（「我的」页）。
 *
 * 用户能改的只有**名称 / 颜色 / 图标**；板块**数量固定为 4、键不可改** ——
 * 业务数据（`Item.sectionId` / `Task.sectionId` / `TimeSlot.sectionId`、日历与
 * 时长的统计口径）都按这四个键存，允许增删会让已有记录变成悬空引用。
 *
 * 改名改色的影响面是全站的：今日页日视图组头与周视图田字格标题、板块详情页标题、
 * 任务页分组、时间轴分组与课程表色块、日历的时长条 / 完成情况 / 月历色点 / 年视图，
 * 全部从 `useSectionConfigs()` 读同一份配置（见该文件头的说明）。
 *
 * 两个交互上的取舍：
 * - **名字是本地草稿、失焦才提交**：直接绑 store 的话，用户选中全部重打时中间态是
 *   空串，会被归一化弹回默认值，边删边跳，根本打不进去。
 * - **颜色用色板而不是取色器**：自由取色器在深浅两套主题上都可能挑出看不见的颜色
 *   （浅底上挑米白），12 色是挑过的、两套底上都读得清的值。
 */
export function SectionSettings() {
  const configs = useSectionConfigs();
  const resetAll = useSectionProfileStore((s) => s.resetAll);

  return (
    <div className="px-3.5 pb-3.5">
      <p className="text-caption leading-5 text-ink-faint">
        改名后，今日、任务、时间轴、日历里的板块名与配色会一起变；记录本身不受影响。
      </p>

      <div className="mt-2.5 space-y-2">
        {configs.map((config) => (
          <SectionRow key={config.key} config={config} />
        ))}
      </div>

      <button
        type="button"
        onClick={resetAll}
        className="press mt-2.5 min-h-[34px] px-2 text-caption text-ink-faint"
      >
        全部恢复默认
      </button>
    </div>
  );
}

function SectionRow({ config }: { config: SectionConfig }) {
  const setName = useSectionProfileStore((s) => s.setName);
  const setColor = useSectionProfileStore((s) => s.setColor);
  const setIcon = useSectionProfileStore((s) => s.setIcon);
  const resetOne = useSectionProfileStore((s) => s.resetOne);

  // 展开态跨页保持（2026-10-16 用户要求）：正在改哪个板块，切走再回来不改
  const { open, toggle } = useExpanded(`me:section:${config.key}`);

  return (
    <div className="rounded-sm bg-surface-sunken p-2.5">
      <div className="flex items-center gap-2">
        <span
          className="w-8 h-8 shrink-0 rounded-pill flex items-center justify-center text-lead"
          style={{ backgroundColor: sectionTint(config), color: sectionColor(config) }}
        >
          {config.icon}
        </span>

        <NameInput
          value={config.name}
          onCommit={(next) => setName(config.key, next)}
          label={config.name}
        />

        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`自定义${config.name}`}
          className="press shrink-0 w-8 h-8 flex items-center justify-center rounded-pill text-ink-faint"
        >
          <Icon
            name="chevron-down"
            size={16}
            className={clsx(
              'transition-transform duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
              open ? 'rotate-180' : 'rotate-0',
            )}
          />
        </button>
      </div>

      {open && (
        <div className="mt-2.5">
          <div className="text-caption text-ink-faint">颜色</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {SECTION_COLOR_CHOICES.map((color) => {
              const active = config.color.toLowerCase() === color.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setColor(config.key, color)}
                  aria-label={`颜色 ${color}`}
                  aria-pressed={active}
                  className={clsx(
                    'w-7 h-7 rounded-pill border-2 press shrink-0',
                    active ? 'border-ink' : 'border-transparent',
                  )}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>

          <div className="mt-2.5 text-caption text-ink-faint">图标</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SECTION_ICON_CHOICES.map((icon) => {
              const active = config.icon === icon;
              return (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setIcon(config.key, icon)}
                  aria-label={`图标 ${icon}`}
                  aria-pressed={active}
                  className={clsx(
                    'press w-8 h-8 shrink-0 rounded-sm text-lead flex items-center justify-center border',
                    active ? 'border-accent bg-accent-soft' : 'border-transparent bg-surface',
                  )}
                >
                  {icon}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => resetOne(config.key as SectionKey)}
            className="press mt-2.5 min-h-[32px] px-1 text-caption text-ink-faint"
          >
            恢复此板块默认
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 板块名输入框。
 *
 * 本地草稿 + 失焦提交：见文件头说明。
 * 空串提交时 store 会归一化回默认值，这里同步把草稿改回当前值 ——
 * 否则「改名成默认值」这种值没变的情况不会触发 props 变化，输入框会停在空白。
 */
function NameInput({
  value,
  onCommit,
  label,
}: {
  value: string;
  onCommit: (next: string) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value);

  // 外部值变了（恢复默认、hydrate 读回存储）→ 草稿跟着变
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      value={draft}
      maxLength={SECTION_NAME_MAX}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        onCommit(next);
        setDraft(next.length > 0 ? next : value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      aria-label={`板块名称：${label}`}
      placeholder="板块名称"
      className="flex-1 min-w-0 min-h-[38px] px-2.5 rounded-sm border border-surface-line bg-surface text-body text-ink outline-none focus:border-accent"
    />
  );
}
