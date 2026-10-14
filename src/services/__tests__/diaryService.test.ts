import { describe, expect, it } from 'vitest';
import { buildDiaryList, DIARY_GROUP_ORDER } from '../diaryService';
import { makeInspiration, makeItem, makeSlot } from './fixtures';

describe('buildDiaryList — 分组与顺序', () => {
  it('组顺序固定为 工作/学习/健身/生活/灵感（与输入顺序无关）', () => {
    const items = [
      makeItem({ id: 'l1', sectionId: 'life' }),
      makeItem({ id: 'w1', sectionId: 'work' }),
      makeItem({ id: 'f1', sectionId: 'fitness' }),
      makeItem({ id: 's1', sectionId: 'study' }),
    ];
    const groups = buildDiaryList(items, [], []);
    expect(groups.map((g) => g.key)).toEqual([...DIARY_GROUP_ORDER]);
  });

  it('顶层条目跨组连续编号：work 2 + study 2 → 1..4', () => {
    const items = [
      makeItem({ id: 'w1', sectionId: 'work', order: 1000 }),
      makeItem({ id: 'w2', sectionId: 'work', order: 2000 }),
      makeItem({ id: 's1', sectionId: 'study', order: 1000 }),
      makeItem({ id: 's2', sectionId: 'study', order: 2000 }),
    ];
    const groups = buildDiaryList(items, [], []);
    const sectionGroups = groups.filter((g) => g.key !== 'inspiration');
    // 现在四板块组恒在（fitness/life 为空也不再消失）
    expect(sectionGroups.map((g) => g.key)).toEqual(['work', 'study', 'fitness', 'life']);

    const numbers = sectionGroups.flatMap((g) => g.entries.map((e) => e.displayNo));
    expect(numbers).toEqual([1, 2, 3, 4]);
  });

  it('四板块组恒存在：空板块也展示（作为添加入口），组数固定为 5', () => {
    const items = [makeItem({ id: 'w1', sectionId: 'work' })];
    const groups = buildDiaryList(items, [], []);
    const sectionKeys = groups.filter((g) => g.key !== 'inspiration').map((g) => g.key);
    // 空板块不再整组消失
    expect(sectionKeys).toEqual(['work', 'study', 'fitness', 'life']);
    expect(groups).toHaveLength(5); // 4 板块 + 灵感
    // 空组的 entries 是空数组（不是 undefined）
    expect(groups.find((g) => g.key === 'study')?.entries).toEqual([]);
  });

  it('空板块不影响跨组连续编号：work 1 条 + fitness 1 条 → 1、2（study/life 空）', () => {
    const items = [
      makeItem({ id: 'w1', sectionId: 'work' }),
      makeItem({ id: 'f1', sectionId: 'fitness' }),
    ];
    const groups = buildDiaryList(items, [], []);
    const work = groups.find((g) => g.key === 'work')!;
    const fitness = groups.find((g) => g.key === 'fitness')!;
    expect(work.entries[0]?.displayNo).toBe(1);
    expect(fitness.entries[0]?.displayNo).toBe(2);
  });

  it('灵感组恒存在（即使为空），且恒在末尾', () => {
    const groups = buildDiaryList([], [], []);
    const insp = groups.find((g) => g.key === 'inspiration');
    expect(insp).toBeDefined();
    expect(insp?.entries).toHaveLength(0);
    expect(groups[groups.length - 1]?.key).toBe('inspiration');
  });
});

describe('buildDiaryList — 子项与软删', () => {
  it('子项不编号，depth 正确（item=0 / child=子孙层级）', () => {
    const items = [
      makeItem({ id: 'top', sectionId: 'work', order: 1000 }),
      makeItem({ id: 'child', sectionId: 'work', parentId: 'top', level: 1, order: 1000 }),
      makeItem({ id: 'grand', sectionId: 'work', parentId: 'child', level: 2, order: 1000 }),
    ];
    const groups = buildDiaryList(items, [], []);
    const work = groups.find((g) => g.key === 'work')!;

    const top = work.entries.find((e) => e.item?.id === 'top')!;
    const child = work.entries.find((e) => e.item?.id === 'child')!;
    const grand = work.entries.find((e) => e.item?.id === 'grand')!;

    expect(top).toMatchObject({ kind: 'item', displayNo: 1, depth: 0 });
    expect(child).toMatchObject({ kind: 'child', displayNo: null, depth: 1 });
    expect(grand).toMatchObject({ kind: 'child', displayNo: null, depth: 2 });
  });

  it('软删条目被排除', () => {
    const items = [
      makeItem({ id: 'alive', sectionId: 'work' }),
      makeItem({ id: 'dead', sectionId: 'work', deletedAt: 999 }),
    ];
    const groups = buildDiaryList(items, [], []);
    const work = groups.find((g) => g.key === 'work')!;
    expect(work.entries).toHaveLength(1);
    expect(work.entries[0]?.item?.id).toBe('alive');
  });

  it('灵感条目按 order 排序、kind=inspiration、不编号', () => {
    const inspirations = [
      makeInspiration({ id: 'b', order: 2000 }),
      makeInspiration({ id: 'a', order: 1000 }),
    ];
    const groups = buildDiaryList([], inspirations, []);
    const insp = groups.find((g) => g.key === 'inspiration')!;
    expect(insp.entries.map((e) => e.inspiration?.id)).toEqual(['a', 'b']);
    expect(insp.entries.every((e) => e.kind === 'inspiration')).toBe(true);
    expect(insp.entries.every((e) => e.displayNo === null)).toBe(true);
  });

  it('软删灵感被排除', () => {
    const inspirations = [
      makeInspiration({ id: 'live' }),
      makeInspiration({ id: 'dead', deletedAt: 999 }),
    ];
    const groups = buildDiaryList([], inspirations, []);
    const insp = groups.find((g) => g.key === 'inspiration')!;
    expect(insp.entries.map((e) => e.inspiration?.id)).toEqual(['live']);
  });
});

describe('buildDiaryList — 负向验证', () => {
  it('编号跨组不重置：study 的第一条必须接着 work 续号（不是重新从 1 开始）', () => {
    const items = [
      makeItem({ id: 'w1', sectionId: 'work' }),
      makeItem({ id: 's1', sectionId: 'study' }),
    ];
    const groups = buildDiaryList(items, [], []);
    const work = groups.find((g) => g.key === 'work')!;
    const study = groups.find((g) => g.key === 'study')!;
    // 若编号「按组重置」，study 会拿到 1；连续编号必须是 2
    expect(work.entries[0]?.displayNo).toBe(1);
    expect(study.entries[0]?.displayNo).toBe(2);
  });

  it('灵感不进编号序列：有灵感时板块编号仍从 1 开始且连续', () => {
    const items = [makeItem({ id: 'w1', sectionId: 'work' })];
    const inspirations = [makeInspiration({ id: 'i1' })];
    const groups = buildDiaryList(items, inspirations, []);
    const work = groups.find((g) => g.key === 'work')!;
    expect(work.entries[0]?.displayNo).toBe(1);
    // 灵感组内没有任何编号
    const insp = groups.find((g) => g.key === 'inspiration')!;
    expect(insp.entries[0]?.displayNo).toBeNull();
  });
});

describe('buildDiaryList — 内联新增后的编号完整性', () => {
  it('新增第 2 条 work 后：work 组末尾续号，study 顺延且编号唯一连续（跨组连续编号，不重置/不撞号）', () => {
    // 初始：work 1 条、study 1 条
    const before = [
      makeItem({ id: 'w1', sectionId: 'work', order: 1000 }),
      makeItem({ id: 's1', sectionId: 'study', order: 1000 }),
    ];
    const beforeGroups = buildDiaryList(before, [], []);
    expect(beforeGroups.find((g) => g.key === 'work')!.entries[0]!.displayNo).toBe(1);
    expect(beforeGroups.find((g) => g.key === 'study')!.entries[0]!.displayNo).toBe(2);

    // 内联新增第 2 条 work（addSibling(null,…)：追加到顶层末尾，order 全局最大）
    const after = [...before, makeItem({ id: 'w2', sectionId: 'work', order: 2000 })];
    const groups = buildDiaryList(after, [], []);
    const work = groups.find((g) => g.key === 'work')!;
    const study = groups.find((g) => g.key === 'study')!;

    // work 组内：w1=1、w2=2，组末尾那条拿到正确编号
    expect(work.entries.map((e) => e.item?.id)).toEqual(['w1', 'w2']);
    expect(work.entries.map((e) => e.displayNo)).toEqual([1, 2]);

    // 🔴 冻结形态为「跨组连续编号」：study 顺延为 3 —— 不是重置回 1，也不与 work 撞号 2。
    // （这是 design 推导出的正确值；「study 编号恒定不变」需要改成组内编号，与冻结形态冲突。）
    expect(study.entries[0]!.displayNo).toBe(3);

    // 全表编号唯一且连续：1、2、3
    const nums = groups
      .filter((g) => g.key !== 'inspiration')
      .flatMap((g) => g.entries.filter((e) => e.kind === 'item').map((e) => e.displayNo));
    expect(nums).toEqual([1, 2, 3]);
    expect(new Set(nums).size).toBe(nums.length); // 无撞号
  });
});

describe('buildDiaryList — 时间轴时间段投影', () => {
  it('归类到板块的时间段出现在对应板块，追加在该板块条目之后并接着编号', () => {
    const items = [makeItem({ id: 'w1', sectionId: 'work', order: 1000 })];
    const slots = [
      makeSlot({ id: 'ts1', sectionId: 'work', startMin: 9 * 60, content: '开组会' }),
    ];
    const work = buildDiaryList(items, [], slots).find((g) => g.key === 'work')!;

    // 顺序刻意是「条目在前、时间段在后」：条目顺序是用户排的，不被外部来源顶开
    expect(work.entries.map((e) => e.kind)).toEqual(['item', 'timeSlot']);
    expect(work.entries.map((e) => e.displayNo)).toEqual([1, 2]);
    expect(work.entries[1]?.timeSlot?.content).toBe('开组会');
  });

  it('未归类（sectionId=null）的时间段不出现在任何板块', () => {
    const slots = [makeSlot({ id: 'ts1', sectionId: null })];
    const groups = buildDiaryList([], [], slots);
    const sectionEntries = groups
      .filter((g) => g.key !== 'inspiration')
      .flatMap((g) => g.entries);
    expect(sectionEntries).toHaveLength(0);
  });

  it('软删的时间段不投影', () => {
    const slots = [
      makeSlot({ id: 'live', sectionId: 'work' }),
      makeSlot({ id: 'dead', sectionId: 'work', deletedAt: 999 }),
    ];
    const work = buildDiaryList([], [], slots).find((g) => g.key === 'work')!;
    expect(work.entries.map((e) => e.timeSlot?.id)).toEqual(['live']);
  });

  it('同一板块的多个时间段按开始时间升序（与 store 排序同口径）', () => {
    const slots = [
      makeSlot({ id: 'late', sectionId: 'work', startMin: 15 * 60, order: 1000 }),
      makeSlot({ id: 'early', sectionId: 'work', startMin: 9 * 60, order: 2000 }),
    ];
    const work = buildDiaryList([], [], slots).find((g) => g.key === 'work')!;
    expect(work.entries.map((e) => e.timeSlot?.id)).toEqual(['early', 'late']);
  });

  it('时间段参与跨组连续编号：work 1 条 + work 时间段 1 条 + study 1 条 → 1、2、3', () => {
    const items = [
      makeItem({ id: 'w1', sectionId: 'work' }),
      makeItem({ id: 's1', sectionId: 'study' }),
    ];
    const slots = [makeSlot({ id: 'ts1', sectionId: 'work', startMin: 9 * 60 })];
    const groups = buildDiaryList(items, [], slots);
    const work = groups.find((g) => g.key === 'work')!;
    const study = groups.find((g) => g.key === 'study')!;

    expect(work.entries.map((e) => e.displayNo)).toEqual([1, 2]);
    expect(study.entries.map((e) => e.displayNo)).toEqual([3]);
  });

  it('负向：不传时间段时，编号与分组形态与改动前完全一致（不回归）', () => {
    const items = [
      makeItem({ id: 'w1', sectionId: 'work' }),
      makeItem({ id: 's1', sectionId: 'study' }),
    ];
    const groups = buildDiaryList(items, [], []);
    expect(groups.map((g) => g.key)).toEqual([...DIARY_GROUP_ORDER]);
    expect(groups.flatMap((g) => g.entries).map((e) => e.kind)).toEqual(['item', 'item']);
  });

  it('负向：时间段是只读投影，不产生 Item（entries 里 item 字段为空）', () => {
    const slots = [makeSlot({ id: 'ts1', sectionId: 'life' })];
    const life = buildDiaryList([], [], slots).find((g) => g.key === 'life')!;
    // 若实现改成了「复制成条目」，item 会变成有值 —— 那就存在两份数据要同步
    expect(life.entries[0]?.item).toBeUndefined();
    expect(life.entries[0]?.timeSlot).toBeDefined();
  });
});
