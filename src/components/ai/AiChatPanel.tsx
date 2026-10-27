import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useAiStore } from '@/store/useAiStore';
import { useUiStore } from '@/store/useUiStore';
import { shiftDateKey, todayKey } from '@/utils/date';
import { useKeyboardVisible, KEYBOARD_HIDDEN_CLASS } from '@/hooks/useKeyboardVisible';
import { isNativePlatform, onBackButton } from '@/platform/backButton';

/** 推荐词条：点一下即触发对应问题 */
const SUGGESTIONS = ['分析日程', '我这周表现如何', '给我一些建议'];

/**
 * AI 对话面板（我的页上半屏）。
 *
 * 基于完成快照的自然语言问答：用户点推荐词条或输入问题，AI 依据最近 30 天的
 * 聚合完成情况回答。未配置厂商/密钥时给出引导，点「去配置」展开下方设置卡。
 *
 * 右上角「全屏」按钮可把面板放大为铺满屏幕的浮层（portal 到 body，避开祖先
 * transform/overflow），再次点击 / 按 Esc / 安卓侧滑返回或硬件返回键 / 浏览器后退
 * 均可退出；全屏下对话区自适应撑满，输入区借 `--keyboard-offset` 避让 iOS 软键盘。
 */
export function AiChatPanel() {
  const chat = useAiStore((s) => s.chat);
  const busy = useAiStore((s) => s.busy);
  const keySet = useAiStore((s) => s.keySet);
  const sendMessage = useAiStore((s) => s.sendMessage);
  const load = useAiStore((s) => s.load);
  const pushToast = useUiStore((s) => s.pushToast);

  const [input, setInput] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
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

  // 全屏时：锁定底层滚动 + Esc / 系统返回（安卓侧滑或硬件返回键）/ 浏览器后退 退出
  useEffect(() => {
    if (!fullscreen) return;

    // consumable 标记这条「返回」是否已被手势/后退消化，避免重复消费 history。
    const consumable = { consumed: false };
    const cleanups: Array<() => void> = [];
    let nativeUnsub: (() => void) | undefined;

    if (isNativePlatform()) {
      // 原生壳：Android 侧滑返回 + 硬件返回键都走 backButton；已在助手内 preventDefault，
      // 拦截「关闭 App / 默认返回」，改为关闭全屏浮层（再按一次才会退出 App）。
      nativeUnsub = onBackButton(() => {
        consumable.consumed = true;
        setFullscreen(false);
      });
    } else {
      // Web / PWA：原生 backButton 不触发，进全屏压一条 history 记录，
      // 系统/浏览器「后退手势」落到 popstate 即退出。
      const onPop = () => {
        if (!consumable.consumed) {
          consumable.consumed = true;
          setFullscreen(false);
        }
      };
      window.history.pushState({ aiFullscreen: true }, '');
      window.addEventListener('popstate', onPop);
      cleanups.push(() => window.removeEventListener('popstate', onPop));
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      nativeUnsub?.();
      for (const fn of cleanups) fn();
      // 非手势退出（按钮 / Esc）：消化压入的 history 记录，避免污染浏览器历史。
      if (!isNativePlatform() && !consumable.consumed) {
        window.history.back();
      }
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

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

  const containerClass = clsx(
    'flex flex-col',
    fullscreen &&
      'fixed inset-0 z-[60] bg-surface px-5 pt-[calc(16px+env(safe-area-inset-top,0px))]',
  );

  const panel = (
    <div className={containerClass}>
      {/* 身份头 */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-accent-soft text-accent">
          <Icon name="sparkle" size={22} />
        </div>
        <div className="min-w-0">
          <div className="text-lead font-semibold leading-5 text-ink">AI 助手</div>
          <div className="text-caption text-ink-faint">基于你的日程数据 · 本地隐私</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {keySet && (
            <span className="flex items-center gap-1 rounded-pill bg-accent-soft px-2.5 py-1 text-micro text-accent">
              <Icon name="check" size={12} strokeWidth={2.6} />
              已接入
            </span>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? '退出全屏' : '全屏'}
            title={fullscreen ? '退出全屏（或侧滑 / 按返回键）' : '全屏'}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-surface-line bg-surface text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
          >
            <Icon name={fullscreen ? 'minimize' : 'maximize'} size={18} />
          </button>
        </div>
      </div>

      <div className="my-3 h-px bg-surface-line" />

      {/* 对话区：全屏时撑满，否则限高 */}
      <div
        ref={scrollRef}
        className={clsx(
          'overflow-y-auto space-y-3 pr-0.5',
          fullscreen ? 'flex-1 min-h-0' : 'max-h-[36vh]',
        )}
      >
        {chat.length === 0 ? (
          <div className="pt-4 pb-1 text-center">
            <p className="text-body leading-6 text-ink-muted">
              问我完成情况、趋势或建议，
              <br />
              我会基于你最近 30 天的数据回答。
            </p>
          </div>
        ) : (
          chat.map((m, i) => <ChatBubble key={i} role={m.role} content={m.content} />)
        )}
        {busy && <TypingBubble />}
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
              className="press inline-flex items-center gap-1.5 rounded-pill border border-surface-line bg-surface px-3.5 min-h-[34px] text-caption text-ink-soft transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent disabled:opacity-50"
            >
              <Icon name="sparkle" size={13} />
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 输入区：全屏时借 --keyboard-offset 避让 iOS 键盘，不再隐藏输入条 */}
      <div
        className={clsx('mt-3', !fullscreen && keyboardVisible && KEYBOARD_HIDDEN_CLASS)}
        style={
          fullscreen
            ? { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px))' }
            : undefined
        }
      >
        <div className="flex items-center gap-2 rounded-pill border border-surface-line bg-surface-sunken px-2 py-1.5 transition-colors focus-within:border-accent/50">
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
            className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-body text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !input.trim()}
            aria-label="发送"
            className="press flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-colors disabled:bg-surface-line disabled:text-ink-faint"
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return fullscreen ? createPortal(panel, document.body) : panel;
}

/** 单条气泡：AI 带头像与左侧小尾巴，用户右对齐带右侧小尾巴 + 轻阴影 */
function ChatBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={clsx('flex items-end gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-card bg-accent-soft text-accent">
          <Icon name="sparkle" size={15} />
        </div>
      )}
      <div
        className={clsx(
          'max-w-[78%] px-3.5 py-2.5 text-body leading-6 shadow-card',
          isUser
            ? 'rounded-card rounded-tr-xs bg-accent text-accent-fg'
            : 'rounded-card rounded-tl-xs bg-surface-sunken text-ink',
        )}
      >
        {content}
      </div>
    </div>
  );
}

/** 思考中：AI 头像 + 跳动三点 */
function TypingBubble() {
  return (
    <div className="flex items-end gap-2">
      <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-card bg-accent-soft text-accent">
        <Icon name="sparkle" size={15} />
      </div>
      <div className="flex items-center gap-1 rounded-card rounded-tl-xs bg-surface-sunken px-4 py-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" style={{ animationDelay: '0ms' }} />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" style={{ animationDelay: '150ms' }} />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
