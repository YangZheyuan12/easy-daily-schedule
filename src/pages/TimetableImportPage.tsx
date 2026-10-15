import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { useSectionConfigs } from '@/hooks/useSectionConfigs';
import type { SectionKey } from '@/domain/enums';
import { COURSE_FIELDS, type CourseField } from '@/services/courseImportService';
import { useTimetableImportStore } from '@/store/useTimetableImportStore';
import { useUiStore } from '@/store/useUiStore';
import { useDayStore } from '@/store/useDayStore';
import { pickBinaryFile } from '@/platform/fileBridge';
import { decodeTextBytes } from '@/platform/textCodec';

/**
 * 课表导入页。
 *
 * 两个入口共用一套解析核心：
 * - **上传 CSV**：走文件选择器，字节先过 `decodeTextBytes`（中文教务系统导出多为 GBK）。
 * - **粘贴表格**：在教务系统网页里登录、选中课表复制，粘进来即可 —— 复制出来是 Tab 分隔，
 *   和 CSV 走同一条解析路径。这样既拿到了「教务系统里的课表」，
 *   又完全绕开了爬虫要面对的 CORS、验证码、账号密码与合规问题。
 *
 * 导入结果是**展开式**的（每周重复铺成具体日期），所以改课表要重新导一次 ——
 * 用「导入前清除旧课表」+ 批次号来兜住这个代价。
 */
export function TimetableImportPage() {
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const setDate = useDayStore((s) => s.setDate);

  const {
    text,
    table,
    mapping,
    hasHeader,
    mondayKey,
    totalWeeks,
    sectionId,
    clearPrevious,
    result,
    draftCount,
    busy,
    loadText,
    setMapping,
    setHasHeader,
    patchOptions,
    reset,
    commit,
  } = useTimetableImportStore();

  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  // 「归到板块」下拉里显示用户自定义后的板块名
  const sectionConfigs = useSectionConfigs();

  const columnCount = useMemo(
    () => table.reduce((max, row) => Math.max(max, row.length), 0),
    [table],
  );
  const sampleRow = hasHeader ? (table[1] ?? []) : (table[0] ?? []);

  const handlePickFile = async () => {
    const buffer = await pickBinaryFile();
    if (!buffer) return;
    loadText(decodeTextBytes(buffer));
    pushToast('已读取文件，请确认列对应关系');
  };

  const handleUsePasted = () => {
    if (pasted.trim().length === 0) return;
    loadText(pasted);
    setShowPaste(false);
  };

  const handleImport = async () => {
    const outcome = await commit();
    if (!outcome) {
      pushToast('没有可导入的课程，请检查列对应关系');
      return;
    }
    const tail = outcome.removed > 0 ? `，已清除旧的 ${outcome.removed} 条` : '';
    pushToast(`已导入 ${outcome.count} 条课程${tail}`);
    // 跳到学期第一周的周视图，导入结果一眼能看到
    setDate(mondayKey);
    navigate('/timeline', { state: { mode: 'week' } });
  };

  return (
    <div className="flex flex-col min-h-full pb-28">
      <PageHeader
        title="导入课表"
        subtitle="从教务系统复制，或上传 CSV"
        onBack={() => navigate(-1)}
      />

      <div className="px-5 mt-3 flex flex-col gap-4">
        {/* 第一步：选择来源 */}
        <section className="rounded-card bg-surface border border-surface-line p-4">
          <h2 className="text-lead text-ink">1 · 课表从哪来</h2>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={handlePickFile}
              className="press flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-sm bg-surface-sunken text-body text-ink"
            >
              <Icon name="plus" size={16} />
              上传 CSV / 表格文件
            </button>
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="press flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-sm bg-surface-sunken text-body text-ink"
            >
              <Icon name="more" size={16} />
              从教务系统复制后粘贴
            </button>
          </div>

          {showPaste && (
            <div className="mt-3">
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={6}
                placeholder={'在教务系统里选中课表 → 复制，粘到这里。例如：\n高等数学\t周一\t8:00\t9:40\t教三-301'}
                className="w-full rounded-sm border border-surface-line bg-app px-3 py-2 text-body text-ink"
              />
              <button
                type="button"
                onClick={handleUsePasted}
                disabled={pasted.trim().length === 0}
                className="press mt-2 w-full min-h-[40px] rounded-pill bg-accent text-accent-fg text-body disabled:opacity-40"
              >
                解析粘贴内容
              </button>
            </div>
          )}

          <p className="mt-3 text-caption text-ink-faint leading-5">
            中文 CSV 常见 GBK 编码，这里会自动识别；认不出的列可以在下面手动指定。
          </p>
        </section>

        {table.length > 0 && (
          <>
            {/* 第二步：列对应 */}
            <section className="rounded-card bg-surface border border-surface-line p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lead text-ink">2 · 每一列是什么</h2>
                <label className="flex items-center gap-1.5 text-caption text-ink-soft">
                  <input
                    type="checkbox"
                    checked={hasHeader}
                    onChange={(event) => setHasHeader(event.target.checked)}
                  />
                  首行是表头
                </label>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {Array.from({ length: columnCount }, (_, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <span className="w-8 shrink-0 text-caption text-ink-faint tabular-nums">
                      第{index + 1}列
                    </span>
                    <span className="flex-1 min-w-0 truncate text-body text-ink-soft">
                      {sampleRow[index] || '（空）'}
                    </span>
                    <select
                      value={mapping[index] ?? 'ignore'}
                      onChange={(event) => setMapping(index, event.target.value as CourseField)}
                      className="shrink-0 rounded-pill border border-surface-line bg-app px-2.5 py-1.5 text-caption text-ink"
                    >
                      {COURSE_FIELDS.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>

            {/* 第三步：学期设置 */}
            <section className="rounded-card bg-surface border border-surface-line p-4">
              <h2 className="text-lead text-ink">3 · 学期与归类</h2>

              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-body text-ink">第一周周一</span>
                  <input
                    type="date"
                    value={mondayKey}
                    onChange={(event) => patchOptions({ mondayKey: event.target.value })}
                    className="rounded-sm border border-surface-line bg-app px-2.5 py-1.5 text-body text-ink"
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span className="text-body text-ink">学期总周数</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={totalWeeks}
                    onChange={(event) =>
                      patchOptions({ totalWeeks: Math.max(1, Number(event.target.value) || 1) })
                    }
                    className="w-20 rounded-sm border border-surface-line bg-app px-2.5 py-1.5 text-body text-ink"
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span className="text-body text-ink">归到板块</span>
                  <select
                    value={sectionId ?? ''}
                    onChange={(event) =>
                      patchOptions({
                        sectionId: event.target.value === '' ? null : (event.target.value as SectionKey),
                      })
                    }
                    className="rounded-sm border border-surface-line bg-app px-2.5 py-1.5 text-body text-ink"
                  >
                    <option value="">不归类</option>
                    {sectionConfigs.map((config) => (
                      <option key={config.key} value={config.key}>
                        {config.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={clearPrevious}
                    onChange={(event) => patchOptions({ clearPrevious: event.target.checked })}
                  />
                  <span className="text-body text-ink">导入前清除上一次导入的课表</span>
                </label>
              </div>
            </section>

            {/* 解析结果 */}
            <section className="rounded-card bg-surface border border-surface-line p-4">
              <h2 className="text-lead text-ink">解析结果</h2>
              <p className="mt-2 text-body text-ink-soft">
                认出 {result?.courses.length ?? 0} 门课，将生成{' '}
                <span className="text-accent font-semibold tabular-nums">{draftCount}</span> 条时间段
              </p>

              {result && result.issues.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {result.issues.slice(0, 8).map((issue) => (
                    <li key={`${issue.line}-${issue.message}`} className="text-caption text-ink-faint">
                      {issue.line > 0 ? `第 ${issue.line} 行：` : ''}
                      {issue.message}
                    </li>
                  ))}
                  {result.issues.length > 8 && (
                    <li className="text-caption text-ink-faint">
                      ……还有 {result.issues.length - 8} 条
                    </li>
                  )}
                </ul>
              )}

              {result && result.courses.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {result.courses.slice(0, 6).map((course, index) => (
                    <li key={`${course.name}-${index}`} className="text-body text-ink truncate">
                      {course.name}
                      <span className="ml-1.5 text-caption text-ink-faint">
                        周{course.weekday} · {course.weeks.length} 周
                        {course.location ? ` · ${course.location}` : ''}
                      </span>
                    </li>
                  ))}
                  {result.courses.length > 6 && (
                    <li className="text-caption text-ink-faint">
                      ……还有 {result.courses.length - 6} 门
                    </li>
                  )}
                </ul>
              )}
            </section>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={reset}
                className="press min-h-[44px] px-4 rounded-pill bg-surface-sunken text-body text-ink-soft"
              >
                重新选文件
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || draftCount === 0}
                className={clsx(
                  'press flex-1 min-h-[46px] rounded-pill bg-accent text-accent-fg text-lead',
                  (busy || draftCount === 0) && 'opacity-40',
                )}
              >
                {busy ? '导入中…' : `导入 ${draftCount} 条`}
              </button>
            </div>

            {text.length > 0 && (
              <p className="text-caption text-ink-faint">已读取 {table.length} 行原始表格。</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
