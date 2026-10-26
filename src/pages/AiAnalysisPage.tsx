import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { useAiStore } from '@/store/useAiStore';
import { useUiStore } from '@/store/useUiStore';
import type { AiAnalysisResult, AiFocus, AiInsight, AiInsightSeverity } from '@/domain/types';
import { todayKey, shiftDateKey } from '@/utils/date';

const RANGE_PRESETS: { label: string; days: number }[] = [
  { label: '近 7 天', days: 7 },
  { label: '近 30 天', days: 30 },
  { label: '近 90 天', days: 90 },
];

const FOCUS_OPTIONS: { label: string; value: AiFocus }[] = [
  { label: '综合', value: 'general' },
  { label: '周视角', value: 'weekly' },
  { label: '月视角', value: 'monthly' },
];

const CATEGORY_LABEL: Record<string, string> = {
  rate: '完成率',
  trend: '趋势',
  weakspot: '短板',
  suggestion: '建议',
  streak: '坚持',
};

const SEVERITY_CLASS: Record<AiInsightSeverity, string> = {
  good: 'text-life',
  warn: 'text-heart',
  info: 'text-ink-muted',
};

function SeverityBadge({ severity }: { severity: AiInsightSeverity }) {
  const label = severity === 'good' ? '亮点' : severity === 'warn' ? '注意' : '信息';
  return <span className={`text-caption font-medium ${SEVERITY_CLASS[severity]}`}>{label}</span>;
}

/** AI 分析页：选时间范围与视角 → 生成分析 → 展示完成率 / 洞察 / 历史 */
export function AiAnalysisPage() {
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);

  const config = useAiStore((s) => s.config);
  const keySet = useAiStore((s) => s.keySet);
  const busy = useAiStore((s) => s.busy);
  const error = useAiStore((s) => s.error);
  const history = useAiStore((s) => s.history);
  const runAnalysis = useAiStore((s) => s.runAnalysis);
  const load = useAiStore((s) => s.load);
  const loadHistory = useAiStore((s) => s.loadHistory);

  const [days, setDays] = useState(30);
  const [focus, setFocus] = useState<AiFocus>('general');
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const configured = config !== null && keySet;

  useEffect(() => {
    void load();
    void loadHistory();
  }, [load, loadHistory]);

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    const end = todayKey();
    const start = shiftDateKey(end, -(days - 1));
    const label = days <= 7 ? '本周' : days <= 30 ? '近一月' : '近三月';
    return { rangeStart: start, rangeEnd: end, rangeLabel: label };
  }, [days]);

  const handleGenerate = async () => {
    try {
      const res = await runAnalysis(rangeStart, rangeEnd, focus);
      setResult(res);
    } catch {
      // 错误已进 store.error，下方会展示；这里给个 toast 兜底
      pushToast(error ?? '分析失败', 'error');
    }
  };

  if (!configured) {
    return (
      <div className="min-h-full bg-app">
        <PageHeader title="AI 分析" onBack={() => navigate('/me')} />
        <div className="px-5 py-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pill bg-surface-sunken">
            <Icon name="bulb" size={26} />
          </div>
          <p className="mb-1 text-body text-ink">尚未配置 AI</p>
          <p className="mb-5 text-caption leading-5 text-ink-faint">
            先在「我的 → AI 助手」选择厂商、填写 API Key，即可用自带 API 分析完成情况。
          </p>
          <button
            type="button"
            onClick={() => navigate('/me')}
            className="press rounded-card bg-accent px-6 py-2.5 text-body text-accent-fg"
          >
            去「我的」配置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-app">
      <PageHeader title="AI 分析" subtitle={config ? `当前：${config.model}` : undefined} onBack={() => navigate('/me')} />

      <div className="space-y-4 px-5 py-4">
        {/* 时间范围 */}
        <div>
          <div className="mb-2 text-caption text-ink-muted">分析范围</div>
          <div className="flex gap-2">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => setDays(preset.days)}
                className={`press flex-1 rounded-card border px-3 py-2 text-body ${
                  days === preset.days
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-ink-soft'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* 视角 */}
        <div>
          <div className="mb-2 text-caption text-ink-muted">分析视角</div>
          <div className="flex gap-2">
            {FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFocus(opt.value)}
                className={`press flex-1 rounded-card border px-3 py-2 text-body ${
                  focus === opt.value
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-ink-soft'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={busy}
          className="press flex w-full items-center justify-center gap-2 rounded-card bg-accent py-3 text-body font-medium text-accent-fg disabled:opacity-50"
        >
          {busy ? (
            '分析中…'
          ) : (
            <>
              <Icon name="bulb" size={18} />
              生成分析
            </>
          )}
        </button>

        {error && busy === false && <p className="text-caption text-heart">{error}</p>}

        {/* 当前结果 */}
        {result && !busy && (
          <div className="space-y-3">
            <div className="rounded-card border border-line bg-surface p-4">
              <div className="flex items-end gap-3">
                <div className="text-display font-semibold text-ink">
                  {Math.round(result.completionRate * 100)}
                  <span className="text-title">%</span>
                </div>
                <div className="pb-1 text-caption text-ink-muted">{rangeLabel}整体完成度</div>
              </div>
              <p className="mt-2 text-body leading-6 text-ink-soft">{result.summary}</p>
            </div>

            {result.insights.length > 0 && (
              <div className="space-y-2">
                {result.insights.map((insight: AiInsight, idx: number) => (
                  <div key={idx} className="rounded-card border border-line bg-surface-sunken p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-pill bg-surface px-2 py-0.5 text-caption text-ink-muted">
                        {CATEGORY_LABEL[insight.category] ?? insight.category}
                      </span>
                      <SeverityBadge severity={insight.severity} />
                    </div>
                    <div className="text-body font-medium text-ink">{insight.title}</div>
                    <p className="mt-0.5 text-caption leading-5 text-ink-soft">{insight.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 历史 */}
        {history.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-caption text-ink-muted">历史分析</div>
            {history.map((record) => {
              const open = expandedId === record.id;
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setExpandedId(open ? null : record.id)}
                  className="press block w-full rounded-card border border-line bg-surface p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-caption text-ink-muted">
                      {record.rangeStart} ~ {record.rangeEnd}
                    </div>
                    <div className="text-body font-medium text-ink">
                      {Math.round(record.completionRate * 100)}%
                    </div>
                  </div>
                  <p className="mt-1 text-body leading-5 text-ink-soft">{record.summary}</p>
                  {open && record.insights.length > 0 && (
                    <div className="mt-2 space-y-2 border-t border-line pt-2">
                      {record.insights.map((insight, idx) => (
                        <div key={idx}>
                          <div className="flex items-center gap-2">
                            <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-caption text-ink-muted">
                              {CATEGORY_LABEL[insight.category] ?? insight.category}
                            </span>
                            <SeverityBadge severity={insight.severity} />
                          </div>
                          <div className="mt-0.5 text-body text-ink">{insight.title}</div>
                          <p className="text-caption leading-5 text-ink-soft">{insight.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
