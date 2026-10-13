/**
 * 列表落定的节拍（纯函数，无副作用）。
 *
 * 节奏参数集中在这里而不是散在各组件里 —— 和 `--m-dur-*` 一样，
 * 「列表以什么节拍落下」是一个全局决定，分散开就会各写各的。
 *
 * 为什么要封顶：20 条的板块若按 24ms 一路排下去，最后一行要等半秒才出现，
 * 读起来不是「有质感」而是「卡」。超过 6 行之后一起落下即可。
 */
const STAGGER_STEP_MS = 24;
const STAGGER_CAP = 6;

/** 第 index 行的入场延迟，直接喂给行内 `animationDelay` */
export function staggerDelay(index: number, stepMs = STAGGER_STEP_MS): string {
  return `${Math.min(Math.max(index, 0), STAGGER_CAP) * stepMs}ms`;
}
