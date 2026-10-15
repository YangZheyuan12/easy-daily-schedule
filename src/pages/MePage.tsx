import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { THEMES } from '@/theme/themes';
import { useThemeStore } from '@/theme/useThemeStore';
import { useTimelineWindowStore } from '@/store/useTimelineWindowStore';
import { useUiStore } from '@/store/useUiStore';
import { useBackupStore } from '@/store/useBackupStore';
import { parseBackup, summarizeBackup, describeSummary } from '@/services/backupService';
import { formatShortDate, toDateKey } from '@/utils/date';

/** 我的（P1，当前为占位 + 版本信息） */
export function MePage() {
  const w = useTimelineWindowStore((s) => s.settings);
  const setStartHour = useTimelineWindowStore((s) => s.setStartHour);
  const setEndHour = useTimelineWindowStore((s) => s.setEndHour);
  const setTickHours = useTimelineWindowStore((s) => s.setTickHours);
  const resetWindow = useTimelineWindowStore((s) => s.reset);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="我的" subtitle="设置 · 主题 · 模板 · 数据" />

      <div className="m-rise px-5 pt-4 space-y-3.5">
        <div className="text-meta font-medium text-ink-muted">外观主题</div>
        <ThemeSwitcher />

        <div className="bg-surface rounded-card border border-surface-line shadow-card p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-lead font-medium text-ink">时间轴视图</div>
            <button
              type="button"
              onClick={resetWindow}
              className="press text-caption text-ink-faint px-2 min-h-[30px] rounded-pill"
            >
              恢复默认
            </button>
          </div>
          <p className="text-caption text-ink-faint">
            自定义周课程表的纵向起止时间与分割线间隔（日视图不受影响）。
          </p>
          <SettingRow label="起始时间">
            <HourSelect value={w.startMin / 60} min={0} max={23} onChange={setStartHour} />
          </SettingRow>
          <SettingRow label="结束时间">
            <HourSelect value={w.endMin / 60} min={1} max={24} onChange={setEndHour} />
          </SettingRow>
          <SettingRow label="分割线间隔">
            <select
              value={w.tickHours}
              onChange={(e) => setTickHours(Number(e.target.value))}
              className="bg-surface-sunken rounded-sm border border-surface-line px-3 py-2 text-body text-ink outline-none tabular-nums"
            >
              {[1, 2, 3, 4, 6].map((h) => (
                <option key={h} value={h}>
                  {h} 小时
                </option>
              ))}
            </select>
          </SettingRow>
        </div>

        <Row label="数据存放" value="本机浏览器（IndexedDB）" />
        <Row label="账号同步" value="P2 规划中" />

        <BackupCard />

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
 * 数据备份卡。
 *
 * 这不是锦上添花 —— 它是当前**唯一**能对抗数据丢失的手段：本应用纯本地、
 * 没有账号同步，卸载 App / 换手机 / iOS 回收 WebView 网站数据都会让
 * IndexedDB 里的记录消失，且**没有任何找回路径**。所以这一卡放在「我的」页显眼处。
 */
function BackupCard() {
  const busy = useBackupStore((s) => s.busy);
  const includeImages = useBackupStore((s) => s.includeImages);
  const setIncludeImages = useBackupStore((s) => s.setIncludeImages);
  const exportBackup = useBackupStore((s) => s.exportBackup);
  const pickBackupText = useBackupStore((s) => s.pickBackupText);
  const importBackup = useBackupStore((s) => s.importBackup);
  const pushToast = useUiStore((s) => s.pushToast);

  /** 已选好、但还没决定导入方式的文件（内容已校验通过） */
  const [pending, setPending] = useState<{ text: string; summary: string; date: string } | null>(
    null,
  );

  const handleExport = async () => {
    const result = await exportBackup();
    pushToast(result.message);
  };

  const handlePick = async () => {
    const text = await pickBackupText();
    if (!text) return; // 用户取消，静默
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      pushToast(parsed.error);
      return;
    }
    setPending({
      text,
      summary: describeSummary(summarizeBackup(parsed.payload)),
      date: formatShortDate(toDateKey(new Date(parsed.payload.exportedAt))),
    });
  };

  const runImport = async (mode: 'merge' | 'overwrite') => {
    const target = pending;
    setPending(null);
    if (!target) return;
    const result = await importBackup(target.text, mode);
    pushToast(result.message);
  };

  return (
    <div className="bg-surface rounded-card border border-surface-line shadow-card p-3.5 space-y-3">
      <div>
        <div className="text-lead font-medium text-ink">数据备份</div>
        <p className="mt-1 text-caption leading-5 text-ink-faint">
          记录只存在这台设备上。卸载 App、换手机或系统回收浏览器数据都会丢失，
          建议定期导出一份备份文件。
        </p>
      </div>

      {/* 图片会让文件明显变大（base64 膨胀约 1/3），默认关 */}
      <label className="flex items-center justify-between gap-3 min-h-[38px]">
        <span className="text-body text-ink">备份包含图片</span>
        <input
          type="checkbox"
          checked={includeImages}
          onChange={(event) => setIncludeImages(event.target.checked)}
          style={{ accentColor: 'rgb(var(--c-accent))' }}
          className="w-5 h-5"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          className="press flex-1 min-h-[42px] rounded-card bg-accent text-lead text-accent-fg disabled:opacity-50"
        >
          导出备份
        </button>
        <button
          type="button"
          onClick={handlePick}
          disabled={busy}
          className="press flex-1 min-h-[42px] rounded-card border border-surface-line text-lead text-ink disabled:opacity-50"
        >
          导入备份
        </button>
      </div>

      <Sheet open={pending !== null} onClose={() => setPending(null)} title="导入备份">
        <div className="pt-3 space-y-3">
          <p className="text-body leading-6 text-ink-muted">
            这份备份导出于 {pending?.date}，包含 {pending?.summary}。
          </p>
          <p className="text-caption leading-5 text-ink-faint">
            合并：同一条记录以备份为准，备份里没有的现有数据保留。
            覆盖：先清空当前全部数据，再写入备份。
          </p>

          <button
            type="button"
            onClick={() => void runImport('merge')}
            className="press w-full min-h-tap rounded-card bg-accent text-lead text-accent-fg"
          >
            合并导入（推荐）
          </button>
          <button
            type="button"
            onClick={() => void runImport('overwrite')}
            className="press w-full min-h-tap rounded-card border border-heart/40 text-lead text-heart"
          >
            覆盖导入（清空当前数据）
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="press w-full min-h-tap rounded-card text-body text-ink-faint"
          >
            取消
          </button>
        </div>
      </Sheet>
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

/** 一行「标签 + 控件」 */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body text-ink">{label}</span>
      {children}
    </div>
  );
}

/** 整点选择器（0–23 / 1–24），显示为 HH:00 */
function HourSelect({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (hour: number) => void;
}) {
  const hours = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="bg-surface-sunken rounded-sm border border-surface-line px-3 py-2 text-body text-ink outline-none tabular-nums"
    >
      {hours.map((h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  );
}
