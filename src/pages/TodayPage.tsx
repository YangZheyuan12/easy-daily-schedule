import { useNavigate } from 'react-router-dom';
import { useDayStore } from '@/store/useDayStore';
import { DateNavigator } from '@/components/date/DateNavigator';
import { SelfStatusCard } from '@/components/selfstatus/SelfStatusCard';
import { DiaryList } from '@/components/diary/DiaryList';
import { ReminderBanner } from '@/components/reminder/ReminderBanner';
import { useDayFestivals } from '@/hooks/useDayFestivals';

/**
 * 今日首页：顶部日期导航，接着是紧凑的自我状态（心情 + 身体），
 * 主体是日记体统一列表（四板块编号条目 + 灵感），底部可加时间段。
 */
export function TodayPage() {
  const navigate = useNavigate();
  const date = useDayStore((s) => s.date);
  const shiftDate = useDayStore((s) => s.shiftDate);
  const goToday = useDayStore((s) => s.goToday);

  // 日期下方的农历 / 节日行（如「九月初三 · 中秋节」）；无内容时为空串
  const { festivalLine, lunarLine } = useDayFestivals(date);
  const subtitleText = [lunarLine, festivalLine].filter(Boolean).join(' · ');

  return (
    <div className="pb-4">
      <DateNavigator
        date={date}
        subtitleText={subtitleText || null}
        onPrev={() => shiftDate(-1)}
        onNext={() => shiftDate(1)}
        onToday={goToday}
        // 点中间日期 → 去日历选日子（选完自动回到本页）
        onDateClick={() => navigate('/calendar', { state: { pickDateFrom: '/today' } })}
      />

      {/* 计划时间到了的提醒（仅当天） */}
      <ReminderBanner />

      <div className="m-rise px-5 mt-2.5 space-y-4">
        {/* 自我状态（心情 + 身体）— 紧凑单行，点开再编辑 */}
        <SelfStatusCard date={date} />

        {/* 日记体统一列表（四板块 + 灵感） */}
        <DiaryList date={date} />
      </div>
    </div>
  );
}
