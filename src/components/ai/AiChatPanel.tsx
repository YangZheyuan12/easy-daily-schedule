import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useAiStore } from '@/store/useAiStore';
import { useUiStore } from '@/store/useUiStore';
import { shiftDateKey, todayKey } from '@/utils/date';
import { useKeyboardVisible, KEYBOARD_HIDDEN_CLASS } from '@/hooks/useKeyboardVisible';

/** 推荐词条：点一下即触发对应问题 */
const SUGGESTIONS = ['分析日程', '我这周表现如何', '给我一些建议'];

/**
 * AI 对话面板（我的页上半屏）。
 *
 * 基于完成快照的自然语言问答：用户点推荐词条或输入问题，AI 依据最近 30 天的
 * 聚合完成情况回答。未配置厂商/密钥时给出引导，点「去配置」展开下方设置卡。
 */
export function AiChatPanel() {
  const chat = useAiStore((s) => s.chat);
  const busy = useAiStore((s) => s.busy);
  const keySet = useAiStore((s) => s.keySet);
  const sendMessage = useAiStore((s) => s.sendMessage);
  const load = useAiStore((s) => s.load);
  const pushToast = useUiStore((s) => s.pushToast);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const keyboardVisible = useKeyboardVisible();

  useEffect(() => {
    void load();
  }, [load]);

  // 新消息时滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, busy]);

  const range = () => {
    const end = todayKey();
    const start = shiftDateKey(end, -29); // 最近 30 天（含今天）
    return { start, end };
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (!keySet) {
      pushToast('请先在下方「AI 助手」里配置厂商与密钥', 'error');
      return;
    }
    setInput('');
    const { start, end } = range();
    await sendMessage(trimmed, start, end);
  };

  const handleSubmit = () => {
    void send(input);
  };

  return (
    <div className="flex flex-col">
      {/* 对话区 */}
      <div ref={scrollRef} className="max-h-[38vh] overflow-y-auto space-y-3">
        {chat.length === 0 ? (
          <div className="text-center pt-6 pb-2">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-pill bg-surface-sunken">
              <Icon name="bulb" size={24} />
            </div>
            <p className="text-lead font-medium text-ink">AI 助手</p>
            <p className="mt-1 text-caption leading-5 text-ink-faint">
              问我你的完成情况、趋势或建议，我会基于你的日程数据回答。
            </p>
          </div>
        ) : (
          chat.map((m, i) => (
            <div
              key={i}
              className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={clsx(
                  'max-w-[80%] px-3 py-2 rounded-card text-body leading-6',
                  m.role === 'user'
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface-sunken text-ink',
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3 py-2 rounded-card bg-surface-sunken text-ink-faint text-body">
              正在思考…
            </div>
          </div>
        )}
      </div>

      {/* 推荐词条 */}
      {chat.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={busy}
              className="press px-3 min-h-[32px] rounded-pill border border-surface-line text-caption text-accent disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div
        className={clsx(
          'mt-3 flex items-center gap-2',
          keyboardVisible && KEYBOARD_HIDDEN_CLASS,
        )}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={keySet ? '问问你的完成情况…' : '先在下方配置 AI 接入'}
          className="flex-1 min-w-0 bg-surface-sunken rounded-pill border border-surface-line px-4 py-2.5 text-body text-ink outline-none"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !input.trim()}
          aria-label="发送"
          className="press shrink-0 w-[42px] h-[42px] rounded-full bg-accent text-accent-fg flex items-center justify-center disabled:opacity-40"
        >
          <Icon name="chevron-right" size={18} />
        </button>
      </div>
    </div>
  );
}
