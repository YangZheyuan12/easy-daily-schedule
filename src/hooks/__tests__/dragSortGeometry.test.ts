import { describe, expect, it } from 'vitest';
import { shiftOf, settleDyOf, computeTargetIndex } from '@/hooks/useDragSort';

/**
 * 拖拽排序的「让位几何」。
 *
 * 这两个函数是「为什么列表中途不会露缝」的全部根据 —— 它们必须是**恒等式**：
 * 抽走一张卡腾出的空间 == 把它插到新位置后占掉的空间。行高不一致时（任务行有的
 * 带第二行描述）这一点最容易算错，所以单独钉一组用例，含不等高行的场景。
 */
describe('shiftOf — 其余行让位多少像素', () => {
  it('往下拖：from 与 to 之间的行整体上移一个「卡高」', () => {
    // 5 行，把第 0 行拖到第 2 行：1、2 两行各上移 h，其余不动
    expect(shiftOf(0, 0, 2, 44)).toBe(0);
    expect(shiftOf(1, 0, 2, 44)).toBe(-44);
    expect(shiftOf(2, 0, 2, 44)).toBe(-44);
    expect(shiftOf(3, 0, 2, 44)).toBe(0);
    expect(shiftOf(4, 0, 2, 44)).toBe(0);
  });

  it('往上拖：to 与 from 之间的行整体下移一个「卡高」', () => {
    // 把第 3 行拖到第 1 行：1、2 两行各下移 h
    expect(shiftOf(0, 3, 1, 44)).toBe(0);
    expect(shiftOf(1, 3, 1, 44)).toBe(44);
    expect(shiftOf(2, 3, 1, 44)).toBe(44);
    expect(shiftOf(3, 3, 1, 44)).toBe(0);
  });

  it('没换位则没人动', () => {
    for (let i = 0; i < 4; i += 1) expect(shiftOf(i, 2, 2, 44)).toBe(0);
  });

  it('移到列表末尾 / 开头时，端点行也一样参与让位', () => {
    expect(shiftOf(3, 0, 3, 44)).toBe(-44);
    expect(shiftOf(0, 3, 0, 44)).toBe(44);
  });
});

describe('settleDyOf — 松手后归位的位移', () => {
  it('往下落：位移等于中间各行的高度之和（与让位互补）', () => {
    const heights = [44, 66, 50, 44];
    // 第 0 行落到第 2 行位置：中间是 1、2 两行，高 66 + 50
    expect(settleDyOf(heights, 0, 2)).toBe(116);
  });

  it('往上落：位移是负的中间各行高度之和', () => {
    const heights = [44, 66, 50, 44];
    // 第 3 行落到第 1 行位置：中间是 1、2 两行
    expect(settleDyOf(heights, 3, 1)).toBe(-116);
  });

  it('相邻换位：位移就是对方那一行的高度', () => {
    expect(settleDyOf([44, 66], 0, 1)).toBe(66);
    expect(settleDyOf([44, 66], 1, 0)).toBe(-44);
  });

  it('原地放回：位移为 0', () => {
    expect(settleDyOf([44, 66, 50], 1, 1)).toBe(0);
  });
});

describe('computeTargetIndex — 目标下标 + 滞回（防交界抖动）', () => {
  // 4 行等高 50：top 0/50/100/150，中心 25/75/125/175；被拖的是第 0 行
  const tops = [0, 50, 100, 150];
  const heights = [50, 50, 50, 50];
  const from = 0;

  it('拖过所有中心 → 落到最后一个位置', () => {
    expect(computeTargetIndex(tops, heights, from, 200, from)).toBe(3);
  });

  it('没越过任何中心 → 仍在原地', () => {
    expect(computeTargetIndex(tops, heights, from, 25, from)).toBe(0);
  });

  it('滞回：刚越过相邻中心一点点（< 6px）不切换，维持 prevTo', () => {
    // index=1 中心是 75，prevTo=0；draggedCenter=78 还没越过 75+6
    expect(computeTargetIndex(tops, heights, from, 78, 0)).toBe(0);
  });

  it('滞回：明显越过相邻中心才切换一格', () => {
    // draggedCenter=85 >= 75+6 → 从 0 变 1
    expect(computeTargetIndex(tops, heights, from, 85, 0)).toBe(1);
  });

  it('滞回：从已落定的位置往回轻微抖动不回退', () => {
    // prevTo=1，draggedCenter=70 还没穿过 75-6=69 → 维持 1
    expect(computeTargetIndex(tops, heights, from, 70, 1)).toBe(1);
  });

  it('滞回：明显往回越过才回退一格', () => {
    // prevTo=1，draggedCenter=60 <= 69 → 退回 0
    expect(computeTargetIndex(tops, heights, from, 60, 1)).toBe(0);
  });

  it('行高不一致时仍按中心判定（带第二行描述的更高行）', () => {
    // 第 1 行更高（80）：top 0/50/130/180，中心 25/90/170/205
    const t = [0, 50, 130, 180];
    const h = [50, 80, 50, 50];
    // 被拖第 0 行，拖到 95（越过第 1 行中心 90 +6=96? 95<96 → 维持 0）
    expect(computeTargetIndex(t, h, 0, 95, 0)).toBe(0);
    // 拖到 100（>=96）→ 变 1
    expect(computeTargetIndex(t, h, 0, 100, 0)).toBe(1);
  });
});
