// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/**
 * 板块自定义的**端到端接线**验证（store → hook → 组件）。
 *
 * 为什么单列一个文件：domain 层的 21 条只证明「合成函数是对的」，
 * 但不证明「组件真的读它」。曾经的真实风险是 —— 组件仍然读
 * `SECTION_CONFIGS`（内置默认值），于是设置里改了名、页面上纹丝不动，
 * 而这种 bug 在 domain 测试里永远是绿的。
 *
 * 这里用 `DiaryList`（今日页日视图）当观测点：它同时显示**组名**、
 * **色点**、**placeholder** 三处，一处漏改就会红。
 */
const { fakeRepos } = vi.hoisted(() => ({
  fakeRepos: {
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]) },
    timeSlots: { listByDate: vi.fn().mockResolvedValue([]) },
    settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: { markItems: vi.fn(), scheduleImmediate: vi.fn(), markInspiration: vi.fn() },
  clock: { now: () => 1700000000000 },
  undoService: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

import { DiaryList } from '@/components/diary/DiaryList';
import { useSectionProfileStore } from '@/store/useSectionProfileStore';
import { DEFAULT_SECTION_PROFILES, resolveSectionConfigs } from '@/domain/constants';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = '2026-10-10';
const mounted: { root: Root; container: HTMLDivElement }[] = [];

function renderDiaryList(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(MemoryRouter, null, createElement(DiaryList, { date: DATE })),
    );
  });
  mounted.push({ root, container });
  return container;
}

/** 板块组头按钮（点它进板块详情页） */
function groupHeader(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').startsWith(name) && (b.textContent ?? '').length < 12,
  );
}

function dotColorOf(header: HTMLButtonElement): string {
  const dot = header.querySelector('span[style*="background-color"]');
  return dot?.getAttribute('style') ?? '';
}

beforeEach(() => {
  // 🔴 profiles 与 configs 必须一起复位：configs 是派生值，只复位 profiles 的话
  // 上一条用例改过的名字会留在 configs 里，本页一开头就渲染出「搬砖」。
  useSectionProfileStore.setState({
    profiles: DEFAULT_SECTION_PROFILES,
    configs: resolveSectionConfigs(DEFAULT_SECTION_PROFILES),
  });
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
});

describe('板块自定义 → 今日页日视图', () => {
  it('默认渲染：组名是内置四个，组头色点走 CSS 变量', () => {
    const container = renderDiaryList();

    for (const name of ['工作', '学习', '健身', '生活']) {
      const header = groupHeader(container, name);
      expect(header, `找不到组头「${name}」`).toBeTruthy();
      expect(dotColorOf(header!)).toContain('var(--c-');
      // 防回归：没自定义过就不允许出现写死的 hex
      expect(dotColorOf(header!)).not.toMatch(/#[0-9A-Fa-f]{6}/);
    }
  });

  it('改名后组名与 placeholder 一起变（设置里改完，页面上要真的变）', () => {
    const container = renderDiaryList();
    expect(groupHeader(container, '工作')).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="diary-inline-add-work"]')!
        .placeholder,
    ).toBe('记录一项工作…');

    act(() => {
      useSectionProfileStore.getState().setName('work', '搬砖');
    });

    // 旧名字消失、新名字出现
    expect(groupHeader(container, '工作')).toBeUndefined();
    const header = groupHeader(container, '搬砖');
    expect(header, '组头没有跟着改名').toBeTruthy();
    // placeholder 跟着板块名走（提示语要说清这行会记到哪）
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="diary-inline-add-work"]')!
        .placeholder,
    ).toBe('记录一项搬砖…');
  });

  it('改色后组头色点变成用户选中的 hex（而不是继续用主题色）', () => {
    const container = renderDiaryList();
    const header = groupHeader(container, '工作')!;
    expect(dotColorOf(header)).toContain('var(--c-work)');

    act(() => {
      useSectionProfileStore.getState().setColor('work', '#F43F5E');
    });

    expect(dotColorOf(groupHeader(container, '工作')!)).toContain('rgb(244, 63, 94)');
  });

  it('名字被清空 → 归一化回默认名，组头不会变成一片空白', () => {
    const container = renderDiaryList();
    act(() => {
      useSectionProfileStore.getState().setName('study', '冥想');
    });
    expect(groupHeader(container, '冥想')).toBeTruthy();

    act(() => {
      useSectionProfileStore.getState().setName('study', '   ');
    });
    expect(groupHeader(container, '冥想')).toBeUndefined();
    expect(groupHeader(container, '学习')).toBeTruthy();
    expect(container.textContent).not.toMatch(/^\s*$/);
  });

  it('恢复默认 → 四个板块回到内置名与主题色', () => {
    const container = renderDiaryList();
    act(() => {
      useSectionProfileStore.getState().setName('work', '搬砖');
      useSectionProfileStore.getState().setColor('life', '#F43F5E');
    });
    act(() => {
      useSectionProfileStore.getState().resetAll();
    });

    expect(groupHeader(container, '工作')).toBeTruthy();
    expect(dotColorOf(groupHeader(container, '生活')!)).toContain('var(--c-life)');
  });

  it('写入会落到设置仓储（换 App / 换设备后仍记得）', () => {
    renderDiaryList();
    act(() => {
      useSectionProfileStore.getState().setName('fitness', '跑步');
    });
    expect(fakeRepos.settings.set).toHaveBeenCalled();
    const calls = fakeRepos.settings.set.mock.calls;
    const [key, value] = calls[calls.length - 1] as [string, unknown];
    expect(key).toBe('sectionProfiles');
    expect((value as Record<string, { name: string }>).fitness.name).toBe('跑步');
  });
});
