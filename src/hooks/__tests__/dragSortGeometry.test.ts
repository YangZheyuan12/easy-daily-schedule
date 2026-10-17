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

describe('computeTargetIndex — 拖中后段条目（from>0，防乱跳）', () => {
  // 5 行等高 50：top 0/50/100/150/200，中心 25/75/125/175/225
  const tops = [0, 50, 100, 150, 200];
  const heights = [50, 50, 50, 50, 50];

  it('拖第 2 行时静止下标仍是 2，不会一上手就跳到 0', () => {
    expect(computeTargetIndex(tops, heights, 2, 125, 2)).toBe(2);
  });

  it('往下拖：过第 3 行中心落 3，过第 4 行中心落 4（滞回仍在）', () => {
    expect(computeTargetIndex(tops, heights, 2, 180, 2)).toBe(2); // 未过 175+6
    expect(computeTargetIndex(tops, heights, 2, 185, 2)).toBe(3);
    expect(computeTargetIndex(tops, heights, 2, 190, 3)).toBe(3); // 未满下一条滞回
    expect(computeTargetIndex(tops, heights, 2, 235, 3)).toBe(4); // 过 225+6
  });

  it('往上拖：过第 1 行中心落 1，拖到顶落 0', () => {
    expect(computeTargetIndex(tops, heights, 2, 80, 2)).toBe(2); // 未过 75-6
    expect(computeTargetIndex(tops, heights, 2, 65, 2)).toBe(1);
    expect(computeTargetIndex(tops, heights, 2, 10, 1)).toBe(0); // 最顶
  });

  it('拖最后一行（from=4）往上拖 → 下标按中心判定递减', () => {
    expect(computeTargetIndex(tops, heights, 4, 180, 4)).toBe(4); // 未过 175-6
    expect(computeTargetIndex(tops, heights, 4, 165, 4)).toBe(3);
    expect(computeTargetIndex(tops, heights, 4, 70, 3)).toBe(1); // 过 125、75 两条中心
  });
});

describe('computeTargetIndex — sensitivity 判定提前量（少移动即可换位）', () => {
  // 5 行等高 50：top 0/50/100/150/200，中心 25/75/125/175/225
  const tops = [0, 50, 100, 150, 200];
  const heights = [50, 50, 50, 50, 50];

  it('向下拖：sensitivity=20 时，中心未到下一行中心(175)也能换到下一格', () => {
    // 拖第 2 行（中心 125）往下移动 40px → 中心 165：无 sensitivity 时 165 < 175+6=181，
    // 不换（仍 2）；有 sensitivity 时 probe=185 >= 181 → 换到 3（少移动约 20px 即可）
    expect(computeTargetIndex(tops, heights, 2, 165, 2, 20)).toBe(3);
    expect(computeTargetIndex(tops, heights, 2, 165, 2, 0)).toBe(2);
  });

  it('向上拖：sensitivity=20 时，中心未退到上一行中心(75)也能换上一格', () => {
    // 拖第 2 行（中心 125）向上移到中心 85：无 sensitivity 时 85 > 75-6=69，不换（仍 2）；
    // 有 sensitivity 时 probe=65 <= 69 → 换到 1（少移动约 20px 即可）
    expect(computeTargetIndex(tops, heights, 2, 85, 2, 20)).toBe(1);
    expect(computeTargetIndex(tops, heights, 2, 85, 2, 0)).toBe(2);
  });

  it('sensitivity=0 与原「中心对中心」行为完全一致', () => {
    // 拖第 2 行到中心 160：无 sensitivity 时 175-6=169 未过 → 仍 2
    expect(computeTargetIndex(tops, heights, 2, 160, 2, 0)).toBe(2);
    // 到中心 180：过 175+6=181? 180<181 → 仍 2；到 185 过 → 3
    expect(computeTargetIndex(tops, heights, 2, 185, 2, 0)).toBe(3);
  });
});
