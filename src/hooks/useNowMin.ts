import { useEffect, useState } from 'react';

/** 当前本地时间 → 距当天 00:00 的分钟数 */
function currentNowMin(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * 当前时间（分钟数），每 60s 刷新一次。
 *
 * 提醒横幅 / 时间轴高亮都要随时间推进，但没必要秒级刷新 —
 * 分钟粒度足够，还能省掉每秒一次的 re-render。
 */
export function useNowMin(): number {
  const [nowMin, setNowMin] = useState(currentNowMin);

  useEffect(() => {
    const timer = setInterval(() => setNowMin(currentNowMin()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return nowMin;
}
