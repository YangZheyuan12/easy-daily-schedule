import { Icon } from '@/components/ui/Icon';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/PageHeader';
import { THEMES } from '@/theme/themes';
import { useThemeStore } from '@/theme/useThemeStore';

/** 我的（P1，当前为占位 + 版本信息） */
export function MePage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="我的" subtitle="设置 · 主题 · 模板 · 数据" />

      <div className="m-rise px-5 pt-4 space-y-3.5">
        <div className="text-meta font-medium text-ink-muted">外观主题</div>
        <ThemeSwitcher />

        <Row label="数据存放" value="本机浏览器（IndexedDB）" />
        <Row label="账号同步" value="P2 规划中" />

        <div className="bg-surface rounded-card border border-surface-line shadow-card p-3.5">
          <div className="text-lead font-medium text-ink">关于</div>
          {/* 只留一句：这页是设置页，用户来这里是找开关，不是来读产品介绍的 */}
          <p className="mt-1 text-body leading-6 text-ink-muted">
            一款移动端优先的日程与完成情况记录工具。
          </p>
          <p className="mt-2 text-caption text-ink-faint">v0.1.0 · MVP</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 三主题切换器。
 *
 * 每行自带「底 / 面 / 重音」三点色板预览，而且**行本身的圆角就用该主题的
 * 圆角尺度** —— 不必真的切过去，就能看出三套主题在形态上的差别，
 * 而不只是换了个配色。
 */
function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="bg-surface rounded-card border border-surface-line shadow-card p-2.5 space-y-2">
      {THEMES.map((item) => {
        const active = item.id === theme;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTheme(item.id)}
            aria-pressed={active}
            className={clsx(
              'press w-full flex items-center gap-3 px-3 min-h-[56px] border text-left transition-colors',
              active ? 'border-accent bg-accent-soft' : 'border-surface-line',
            )}
            style={{ borderRadius: item.radius }}
          >
            <span className="flex gap-1 shrink-0">
              {[item.swatch.app, item.swatch.surface, item.swatch.accent].map((hex) => (
                <span
                  key={hex}
                  className="w-3.5 h-3.5 rounded-full border border-surface-line"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </span>

            <span className="min-w-0 flex-1">
              <span
                className={clsx('block text-lead', active ? 'font-semibold text-ink' : 'text-ink')}
              >
                {item.label}
              </span>
              <span className="block text-caption text-ink-faint truncate">{item.tagline}</span>
            </span>

            {active && <Icon name="check" size={17} strokeWidth={2.4} className="shrink-0 text-accent" />}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-surface rounded-card border border-surface-line shadow-card px-3.5 min-h-[52px]">
      <span className="text-lead text-ink">{label}</span>
      <span className="text-body text-ink-faint">{value}</span>
    </div>
  );
}
