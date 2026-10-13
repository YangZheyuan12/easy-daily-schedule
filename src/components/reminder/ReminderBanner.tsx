import { Icon } from '@/components/ui/Icon';
import { useState } from 'react';
import { useDayStore } from '@/store/useDayStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { listDueSlots } from '@/services/reminderService';
import { useNowMin } from '@/hooks/useNowMin';
import { formatTimeRange, todayKey } from '@/utils/date';

/**
 * 应用内提醒横幅：当天有「已到计划时间且未完成」的时间段时，在页面顶部提示。
 *
 * 只在「看今天」时出现（看历史 / 未来日期不打扰）；✕ 只是临时收起，
 * 一旦有新的时间段到期会自动重新出现（dismiss 键 = 日期 + 到期 id 集合，
 * 集合变了键就变了）。
 */
export function ReminderBanner() {
  const date = useDayStore((s) => s.date);
  const slots = useTimeSlotStore((s) => s.slots);
  const nowMin = useNowMin();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // 只有正在看「今天」才提醒
  if (date !== todayKey()) return null;

  const due = listDueSlots(slots, nowMin);
  if (due.length === 0) return null;

  // dismiss 键跟随「到期集合」：点 ✕ 记当前集合；新时段到期后集合变化 → 自动重现
  const bannerKey = `${date}|${due.map((slot) => slot.id).sort().join(',')}`;
  if (dismissedKey === bannerKey) return null;

  return (
    <div className="m-rise px-5 mt-2.5">
      {/*
        呼吸两次就停 —— 这是全应用唯一的循环动效，只用来「把注意力叫过来」。
        无限脉冲会变成骚扰：用户每天都打开这个页面，被动接受一个永远在闪的横幅。
      */}
      <div
        className="flex items-center gap-2 rounded-sm bg-star/10 px-3 py-2.5"
        style={{ animation: 'm-breathe 900ms var(--m-ease-in-out) 2' }}
      >
        <div className="flex-1 min-w-0 text-body leading-6 text-star truncate">
          {due.length} 个计划时间到了：
          {due
            .slice(0, 3)
            .map((slot) => `${formatTimeRange(slot.startMin, slot.endMin)} ${slot.content}`.trim())
            .join('；')}
          {due.length > 3 ? ` 等 ${due.length} 条` : ''}
        </div>
        <button
          type="button"
          onClick={() => setDismissedKey(bannerKey)}
          className="shrink-0 w-6 h-6 flex items-center justify-center text-ink-faint active:text-ink"
          aria-label="收起提醒"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
