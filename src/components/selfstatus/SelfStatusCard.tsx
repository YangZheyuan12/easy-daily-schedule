import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { Rating } from '@/domain/enums';
import { useDayStore } from '@/store/useDayStore';
import { Icon } from '@/components/ui/Icon';
import { isToday } from '@/utils/date';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';

interface SelfStatusCardProps {
  date: string;
}

/**
 * 切换评分：再次点击当前值则清零（与 RatingStars 的交互一致）。
 *
 * 导出是为了能被单测直接锁住 —— 这条规则藏在组件里时改坏了没有任何用例会红。
 */
export function nextRating(current: Rating, clicked: number): Rating {
  return (current === clicked ? 0 : clicked) as Rating;
}

/** 紧凑行的文字预览截断长度 */
const PREVIEW_MAX = 16;

function truncatePreview(text: string): string {
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
}

/**
 * 首页的自我状态卡片（紧凑版）。
 *
 * 默认是一行：心情（♥）+ 身体（★）+ 一行文字预览；点整行就地展开成完整编辑器
 * （大图标 + 备注输入），再点收起。任意改动都即时走 `useDayStore.saveSelfStatus`，
 * 数据模型与保存流程不变，只改了展示形态。
 */
export function SelfStatusCard({ date }: SelfStatusCardProps) {
  const selfStatus = useDayStore((s) => s.selfStatus);
  const [expanded, setExpanded] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // 本卡片只渲染当前日期的状态；日期切走后由 AppShell 重新 loadSelfStatus
  const mood = selfStatus?.date === date ? selfStatus.mood : 0;
  const moodText = selfStatus?.date === date ? selfStatus.moodText : '';
  const body = selfStatus?.date === date ? selfStatus.body : 0;
  const bodyText = selfStatus?.date === date ? selfStatus.bodyText : '';

  // 新选中的那颗心 / 星弹一下（和评分星同一套反馈）
  const moodPopped = useRecentlyChanged(mood);
  const bodyPopped = useRecentlyChanged(body);

  // 折叠时把编辑器整体移出可交互范围：内容为了做高度过渡一直挂在 DOM 上，
  // 不置 inert 的话键盘 Tab 会跳进看不见的输入框里。
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    if (expanded) node.removeAttribute('inert');
    else node.setAttribute('inert', '');
  }, [expanded]);

  const commit = (patch: Partial<{ mood: Rating; moodText: string; body: Rating; bodyText: string }>) => {
    useDayStore.getState().saveSelfStatus(
      patch.mood ?? mood,
      patch.moodText ?? moodText,
      patch.body ?? body,
      patch.bodyText ?? bodyText,
    );
  };

  const previewText = [truncatePreview(moodText), truncatePreview(bodyText)]
    .filter((text) => text.length > 0)
    .join(' · ');

  return (
    <div>
      <div className="bg-surface rounded-card border border-surface-line shadow-card">
        {/* 紧凑单行：点击展开 / 收起完整编辑器（概念稿：心 + 星 + 右侧状态摘要） */}
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-full px-3.5 py-2.5 text-left active:bg-surface-sunken/60"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-[3px] shrink-0">
              {[1, 2, 3, 4, 5].map((value) => (
                <Icon
                  key={value}
                  name="heart"
                  size={15}
                  filled={value <= mood}
                  className={value <= mood ? 'text-heart' : 'text-edge-strong'}
                />
              ))}
            </span>
            <span className="flex items-center gap-[3px] shrink-0">
              {[1, 2, 3, 4, 5].map((value) => (
                <Icon
                  key={value}
                  name="star"
                  size={15}
                  filled={value <= body}
                  className={value <= body ? 'text-star' : 'text-edge-strong'}
                />
              ))}
            </span>
            <span className="flex-1 min-w-0 text-right text-meta text-ink-faint truncate">
              {/*
                看别的日期时不能说「今天」—— 日期可以往前翻，措辞不能跟着撒谎。
                文案刻意压到 7–8 个字：这一行跟 10 颗心/星挤在同一行。
                实测这一行剩 120px，14px 下 8 个汉字要 112px —— 再加长就会被截断，
                所以「记录这一天的状态」是为数不多不能再动字号的文案。
              */}
              {previewText || (isToday(date) ? '记录今天的状态' : '记录这一天的状态')}
            </span>
          </div>
        </button>

        {/*
          展开后的完整编辑器。用 `grid-template-rows: 0fr → 1fr` 让它「长出来」，
          而不是瞬间出现 —— 这张卡是首页第一屏的主角，它撑开的高度变化值得被看见。
          内容始终挂在 DOM 上（折叠时置 inert），否则没有可过渡的高度。
        */}
        <div
          className="grid transition-[grid-template-rows] duration-[var(--m-dur-3)] ease-[var(--m-ease-out)]"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div ref={editorRef} className="min-h-0 overflow-hidden">
            <div className="px-3.5 pt-3 pb-3.5 border-t border-surface-line">
              <div className="flex items-center justify-between">
                <span className="text-lead font-medium text-ink">心情</span>
                <span className="text-meta text-ink-faint tabular-nums">
                  {mood > 0 ? `${mood}/5` : '未记录'}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((value) => {
                  const filled = value <= mood;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => commit({ mood: nextRating(mood, value) })}
                      className={clsx(
                        'press p-0.5 active:scale-110',
                        moodPopped && value === mood && 'm-pop-soft',
                        filled ? 'text-heart' : 'text-edge-strong',
                      )}
                      aria-label={`心情 ${value} 分`}
                    >
                      <Icon name="heart" size={24} filled={filled} />
                    </button>
                  );
                })}
              </div>
              <AutoTextarea
                value={moodText}
                placeholder="写一句今天的心情…"
                onChange={(text) => commit({ moodText: text })}
              />

              <div className="mt-3 pt-3 border-t border-surface-line">
                <div className="flex items-center justify-between">
                  <span className="text-lead font-medium text-ink">身体</span>
                  <span className="text-meta text-ink-faint tabular-nums">
                    {body > 0 ? `${body}/5` : '未记录'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const filled = value <= body;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => commit({ body: nextRating(body, value) })}
                        className={clsx(
                          'press p-0.5 active:scale-110',
                          bodyPopped && value === body && 'm-pop-soft',
                          filled ? 'text-star' : 'text-edge-strong',
                        )}
                        aria-label={`身体 ${value} 分`}
                      >
                        <Icon name="star" size={24} filled={filled} />
                      </button>
                    );
                  })}
                </div>
                <AutoTextarea
                  value={bodyText}
                  placeholder="今天身体状态如何？"
                  onChange={(text) => commit({ bodyText: text })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 随内容自动增高的备注输入框（复用首页其它处的交互手感） */
function AutoTextarea({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={1}
      className="mt-2 w-full min-h-[30px] text-body leading-6 text-ink placeholder:text-ink-faint outline-none bg-transparent resize-none"
    />
  );
}
