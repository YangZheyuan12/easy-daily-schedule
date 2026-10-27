import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { SectionSettings } from '@/components/me/SectionSettings';
import { THEMES, getThemeMeta } from '@/theme/themes';
import { useThemeStore } from '@/theme/useThemeStore';
import { useTimelineWindowStore } from '@/store/useTimelineWindowStore';
import { useUiStore } from '@/store/useUiStore';
import { useBackupStore } from '@/store/useBackupStore';
import { parseBackup, summarizeBackup, describeSummary } from '@/services/backupService';
import { evaluateUpdate } from '@/services/updateService';
import { getCurrentVersion } from '@/platform/appInfo';
import { fetchLatestRelease, openExternalUrl } from '@/platform/updateBridge';
import { AI_VENDOR_PRESETS, findVendorPreset } from '@/platform/ai';
import { useAiStore } from '@/store/useAiStore';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import type { AiProviderConfig } from '@/domain/types';
import { formatShortDate, toDateKey } from '@/utils/date';

/** 我的（P1，当前为占位 + 版本信息） */
export function MePage() {
  const w = useTimelineWindowStore((s) => s.settings);
  const setStartHour = useTimelineWindowStore((s) => s.setStartHour);
  const setEndHour = useTimelineWindowStore((s) => s.setEndHour);
  const setTickHours = useTimelineWindowStore((s) => s.setTickHours);
  const resetWindow = useTimelineWindowStore((s) => s.reset);
  const theme = useThemeStore((s) => s.theme);
  const aiKeySet = useAiStore((s) => s.keySet);

  /*
    每一卡都能折叠，且**默认全部收起**（用户要求）：设置页一屏只剩六行标题，
    找什么一眼就看到；要改哪张点哪张。当前主题名写在标题行的 hint 上，
    收不着也知道现在用的是哪套。
    展开态跨页保持（`useExpanded`，2026-10-16 用户要求）：展开着切去今日 /
    日历再回来，那张卡还是展开的 —— 每张卡一个稳定 key。
  */
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="我的" subtitle="AI 助手 · 设置" />

      <div className="m-rise px-5 pt-4 space-y-3.5">
        {/* 上半屏：AI 对话 */}
        <div className="rounded-card border border-surface-line bg-surface p-4">
          <AiChatPanel />
        </div>

        {/* 下半屏：设置模块 */}
        <div className="flex items-center gap-2 pt-2">
          <span className="text-caption text-ink-faint">设置</span>
          <div className="flex-1 h-px bg-surface-line" />
        </div>

        <CollapsibleCard title="外观主题" expandKey="me:appearance" hint={getThemeMeta(theme).label}>
          <ThemeSwitcher />
        </CollapsibleCard>

        <CollapsibleCard title="板块设置" expandKey="me:sections" hint="4 个板块">
          <SectionSettings />
        </CollapsibleCard>

        <CollapsibleCard title="时间轴视图" expandKey="me:timeline">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lead font-medium text-ink">周课程表时间范围</div>
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
        </CollapsibleCard>

        <CollapsibleCard title="存储与同步" expandKey="me:storage">
          <div className="space-y-1">
            <Row label="数据存放" value="本机浏览器（IndexedDB）" />
            <Row label="账号同步" value="规划中" />
          </div>
        </CollapsibleCard>

        <CollapsibleCard title="AI 助手" expandKey="me:ai" hint={aiKeySet ? '已配置' : '未配置'}>
          <AiSettingsCard />
        </CollapsibleCard>

        <CollapsibleCard title="数据备份" expandKey="me:backup">
          <BackupCard />
        </CollapsibleCard>

        <CollapsibleCard title="关于" expandKey="me:about">
          <AboutCard />
        </CollapsibleCard>
      </div>
    </div>
  );
}

/**
 * 「关于」卡：显示运行时读到的真实版本号，并提供「检查更新」。
 *
 * 版本号不写死在 UI 里：原生端来自 `App.getInfo().version`（versionName），
 * Web 端是 `appInfo.ts` 里的兜底常量。检查更新分两层：
 * ① `platform/updateBridge.fetchLatestRelease()` 拉 GitHub 最新 Release（fetch 在 platform 层）；
 * ② `services/updateService.evaluateUpdate()` 做纯解析 + 版本比对（零浏览器 API）。
 * 有新版弹 Sheet 提供「去下载」，没新版 / 拿不到版本号就 toast「已是最新」。
 */
function AboutCard() {
  const pushToast = useUiStore((s) => s.pushToast);
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCurrentVersion().then((value) => {
      if (!cancelled) setVersion(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const current = await getCurrentVersion();
      const release = await fetchLatestRelease();
      if (!release) {
        pushToast('检查更新失败，请稍后再试', 'error');
        return;
      }
      const result = evaluateUpdate(release.body, release.tagName, current);
      if (result.hasUpdate && result.latestVersion) {
        setUpdate({ version: result.latestVersion, url: release.htmlUrl });
      } else {
        pushToast('已是最新版本');
      }
    } catch {
      pushToast('检查更新失败，请稍后再试', 'error');
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = () => {
    if (update?.url) openExternalUrl(update.url);
    setUpdate(null);
  };

  return (
    <div className="space-y-3">
      {/* 只留一句：这页是设置页，用户来这里是找开关，不是来读产品介绍的 */}
      <p className="text-body leading-6 text-ink-muted">
        一款移动端优先的日程与完成情况记录工具。
      </p>

      <div className="flex items-center justify-between min-h-[38px]">
        <span className="text-body text-ink">当前版本</span>
        <span className="text-caption text-ink-faint">v{version ?? '…'}</span>
      </div>

      <button
        type="button"
        onClick={() => void handleCheck()}
        disabled={checking}
        className="press w-full min-h-[42px] rounded-card border border-surface-line text-lead text-ink disabled:opacity-50"
      >
        {checking ? '检查中…' : '检查更新'}
      </button>

      <Sheet open={update !== null} onClose={() => setUpdate(null)} title="发现新版本">
        <div className="pt-3 space-y-3">
          <p className="text-body leading-6 text-ink-muted">
            最新版本 v{update?.version}，建议升级以获取新功能与修复。
          </p>
          <button
            type="button"
            onClick={handleDownload}
            className="press w-full min-h-tap rounded-card bg-accent text-lead text-accent-fg"
          >
            去下载
          </button>
          <button
            type="button"
            onClick={() => setUpdate(null)}
            className="press w-full min-h-tap rounded-card text-body text-ink-faint"
          >
            稍后再说
          </button>
        </div>
      </Sheet>
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
    <div className="space-y-3">
      <div>
        <p className="text-caption leading-5 text-ink-faint">
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

      {/*
        导出说明（2026-10-17 重写）：现在导出会**同时**做两件事 ——
        ① 弹系统分享面板，可以直接发给微信 / QQ / 存进网盘（绝大多数人要走的路）；
        ② 顺便在系统「下载」目录留一份原件。
        以前只有②，用户反馈「手机里找不到导出到哪」（10-16 加落点提示也没解决），
        所以主路径改成①，②降级为兜底。
      */}
      <p className="text-caption leading-5 text-ink-faint">
        点「导出备份」会弹出系统分享面板，可以直接发给微信 / QQ（发给「文件传输助手」最省事），
        或存进任意网盘；同时会在系统「下载」目录留一份「日程表备份-日期.json」。
        导入时从这些地方任选其一选中它即可。
      </p>

      <SnapshotSection />

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
 * 本机自救快照（仅 iOS 渲染）。
 *
 * 为什么需要它：iOS 会在存储吃紧时回收 WKWebView 的站点数据，IndexedDB 可能整库消失 ——
 * 这不是「用户误删」，而是系统行为，且**没有任何找回路径**。切后台时自动写进原生沙盒的
 * 那份快照就是唯一的保险（沙盒不随 WebView 回收）。
 *
 * 为什么不自动恢复：自动把空库换成旧快照，等于替用户做了一个不可撤销的决定。
 * 这里只提供入口，恢复必须由用户点，并且再过一道确认。
 */
function SnapshotSection() {
  const supported = useBackupStore((s) => s.snapshotSupported);
  const writeSnapshot = useBackupStore((s) => s.writeSnapshot);
  const restoreSnapshot = useBackupStore((s) => s.restoreSnapshot);
  const pushToast = useUiStore((s) => s.pushToast);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // 非 iOS 不渲染：Android / 网页端没有这条兜底路径，不该给用户一个按了没反应的按钮
  if (!supported) return null;

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    await writeSnapshot();
    setBusy(false);
    pushToast('已在本机存一份快照（不含图片）');
  };

  const handleRestore = async () => {
    if (busy) return;
    setBusy(true);
    const result = await restoreSnapshot();
    setBusy(false);
    pushToast(result.message);
  };

  return (
    <div className="pt-3 mt-1 border-t border-surface-line space-y-2">
      <div className="text-lead font-medium text-ink">本机快照（iOS）</div>
      <p className="text-caption leading-5 text-ink-faint">
        App 切到后台时会自动在本机留一份快照（不含图片）。如果系统回收了网页数据，
        可以在这里把它找回来。卸载 App 会连同快照一起删除，所以长期备份仍请导出文件。
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="press flex-1 min-h-[38px] rounded-card border border-surface-line text-body text-ink disabled:opacity-50"
        >
          立即存一份
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="press flex-1 min-h-[38px] rounded-card border border-surface-line text-body text-ink disabled:opacity-50"
        >
          从快照恢复
        </button>
      </div>

      <ConfirmSheet
        open={confirming}
        title="从本机快照恢复"
        message="会用快照里的内容覆盖当前全部数据，且无法撤销。确定继续吗？"
        confirmText="覆盖恢复"
        onConfirm={() => void handleRestore()}
        onClose={() => setConfirming(false)}
      />
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

  // 卡壳由 CollapsibleCard 提供，这里只管列表本身
  return (
    <div className="space-y-2">
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
    <div className="flex items-center justify-between min-h-[44px]">
      <span className="text-body text-ink">{label}</span>
      <span className="text-caption text-ink-faint">{value}</span>
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

/**
 * AI 接入设置卡。
 *
 * 用户自带 API：选厂商（OpenAI 兼容 / Anthropic / Gemini）→ 填 Base URL / 模型 /
 * API Key。配置（非敏感）存 SettingsRepository，密钥走 `SecureAiKeyStore`（AES-GCM 信封），
 * 与账号 token 同等级。密钥**只在点「生成分析」时**发往所选厂商，不进任何本机明文库。
 *
 * 第二阶段才接入真正的分析网关；此卡先把「接入配置」这层跑通。
 */
function AiSettingsCard() {
  const pushToast = useUiStore((s) => s.pushToast);
  const config = useAiStore((s) => s.config);
  const keySet = useAiStore((s) => s.keySet);
  const busy = useAiStore((s) => s.busy);
  const error = useAiStore((s) => s.error);
  const saveConfig = useAiStore((s) => s.saveConfig);
  const clearKey = useAiStore((s) => s.clearKey);
  const testConnection = useAiStore((s) => s.testConnection);
  const fetchModels = useAiStore((s) => s.fetchModels);
  const models = useAiStore((s) => s.models);
  const fetchingModels = useAiStore((s) => s.fetchingModels);
  const modelError = useAiStore((s) => s.modelError);
  const clearModels = useAiStore((s) => s.clearModels);
  const load = useAiStore((s) => s.load);

  const [vendorKey, setVendorKey] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  // 已存配置回填（按 Base URL 反查厂商预设）
  useEffect(() => {
    if (config) {
      setVendorKey(findVendorPreset(config).key);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
    }
  }, [config]);

  const handleVendorChange = (nextKey: string) => {
    setVendorKey(nextKey);
    const preset = AI_VENDOR_PRESETS.find((p) => p.key === nextKey);
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
    }
    clearModels();
  };

  const currentGatewayProvider = (): AiProviderConfig['provider'] => {
    const preset = AI_VENDOR_PRESETS.find((p) => p.key === vendorKey);
    return preset?.gatewayProvider ?? 'openai-compatible';
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      pushToast('请先填写 Base URL', 'error');
      return;
    }
    try {
      const fetched = await fetchModels(
        { provider: currentGatewayProvider(), baseUrl: baseUrl.trim(), model: '' },
        key.trim() || undefined,
      );
      if (fetched.length === 0) {
        pushToast('该地址未返回模型列表，请手动填写模型名', 'error');
      } else {
        pushToast(`已获取 ${fetched.length} 个模型，请在下方选择`);
      }
    } catch {
      pushToast(modelError ?? '获取模型列表失败', 'error');
    }
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      pushToast('请填写 Base URL 与模型名', 'error');
      return;
    }
    await saveConfig(
      { provider: currentGatewayProvider(), baseUrl: baseUrl.trim(), model: model.trim() },
      key.trim() || undefined,
    );
    setKey('');
    pushToast('已保存 AI 接入配置');
  };

  const handleClearKey = async () => {
    await clearKey();
    setKey('');
    pushToast('已清除密钥');
  };

  const handleTest = async () => {
    try {
      await testConnection();
      pushToast('连接成功：密钥与地址可用');
    } catch {
      pushToast(error ?? '连接测试失败', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-caption leading-5 text-ink-faint">
        自带 API Key 即可用 AI 分析完成情况。常用厂商（OpenAI / DeepSeek / Kimi / 智谱 GLM /
        豆包 / 通义千问 / Claude / Gemini）已预填好地址，直接选即可；选「自定义」可填任意 OpenAI
        兼容端点。填好 Key 后点「获取模型」自动拉取模型名，免手填。密钥只存在这台设备，
        仅在点「生成分析」时发往所选厂商，不会上传到本应用任何服务器。
      </p>

      <SettingRow label="厂商">
        <select
          value={vendorKey}
          onChange={(e) => handleVendorChange(e.target.value)}
          className="bg-surface-sunken rounded-sm border border-surface-line px-3 py-2 text-body text-ink outline-none"
        >
          {AI_VENDOR_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </SettingRow>

      <div className="space-y-1">
        <span className="block text-body text-ink">API Base URL</span>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            clearModels();
          }}
          placeholder={AI_VENDOR_PRESETS.find((p) => p.key === vendorKey)?.baseUrl || 'https://your-endpoint/v1'}
          className="w-full bg-surface-sunken rounded-sm border border-surface-line px-3 py-2 text-body text-ink outline-none"
        />
      </div>

      <div className="space-y-1">
        <span className="block text-body text-ink">模型名</span>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={AI_VENDOR_PRESETS.find((p) => p.key === vendorKey)?.model || '从「获取模型」选择，或手动填写'}
          className="w-full bg-surface-sunken rounded-sm border border-surface-line px-3 py-2 text-body text-ink outline-none"
        />
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleFetchModels()}
            disabled={fetchingModels}
            className="press flex-1 min-h-[38px] rounded-sm border border-surface-line text-caption text-ink-soft disabled:opacity-50"
          >
            {fetchingModels ? '获取中…' : '获取模型'}
          </button>
          {models.length > 0 && (
            <select
              value={models.includes(model) ? model : ''}
              onChange={(e) => setModel(e.target.value)}
              className="flex-1 bg-surface-sunken rounded-sm border border-surface-line px-3 py-2 text-body text-ink outline-none"
            >
              <option value="" disabled>
                从列表选择（可选）
              </option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <span className="block text-body text-ink">API Key</span>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keySet ? '已保存（留空则不修改）' : 'sk-...'}
          autoComplete="off"
          className="w-full bg-surface-sunken rounded-sm border border-surface-line px-3 py-2 text-body text-ink outline-none"
        />
      </div>

      {error && <p className="text-caption text-heart">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="press flex-1 min-h-[42px] rounded-card bg-accent text-lead text-accent-fg disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存配置'}
        </button>
        {keySet && (
          <button
            type="button"
            onClick={() => void handleClearKey()}
            className="press min-h-[42px] rounded-card border border-surface-line text-body text-ink-faint"
          >
            清除密钥
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={busy}
          className="press flex-1 min-h-[42px] rounded-card border border-surface-line text-body text-ink-soft disabled:opacity-50"
        >
          {busy ? '测试中…' : '测试连接'}
        </button>
      </div>

      <p className="text-caption leading-5 text-ink-faint">
        配置后即可在上方与 AI 对话，说「分析日程」即可基于最近 30 天数据生成分析；密钥仅存于本设备，只发聚合统计给所选厂商。
      </p>
    </div>
  );
}
