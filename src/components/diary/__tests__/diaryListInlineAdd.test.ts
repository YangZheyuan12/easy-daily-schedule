// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';

/**
 * DiaryList「四板块组内联快速添加」独立验证（QA，渲染层）。
 *
 * 被验证的契约（eng-feature）：四个板块组每组底部恒定一行 `<input> + <button>添加</button>`；
 * 提交 → `useItemStore.addSibling(null, date, sectionKey, content)`（anchorId=null，追加顶层末尾）；
 * 提交后清空输入框；空/纯空格不提交（按钮 disabled）；组头/条目跳转 URL 仍带 ?date=。
 *
 * 说明：本项目 vite.config.ts 只收 `*.test.ts`，故用 createElement 代替 JSX；
 * jsdom 经文件顶部指令单文件启用，不影响其余测试的 node 环境。
 */

const { fakeRepos, fakePersistence, fakeClock, fakeUndo } = vi.hoisted(() => ({
  fakeRepos: {
    items: { listByDate: vi.fn().mockResolvedValue([]) },
    inspirations: { listByDate: vi.fn().mockResolvedValue([]) },
  },
  fakePersistence: {
    markItems: vi.fn(),
    scheduleImmediate: vi.fn().mockResolvedValue(undefined),
    markInspiration: vi.fn(),
    markSelfStatus: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  },
  fakeClock: { now: () => 1700000000000 },
  fakeUndo: { push: vi.fn(), peek: vi.fn(), consume: vi.fn(), clear: vi.fn() },
}));

vi.mock('@/store/bootstrap', () => ({
  repos: fakeRepos,
  persistence: fakePersistence,
  clock: fakeClock,
  undoService: fakeUndo,
}));

import { DiaryList } from '@/components/diary/DiaryList';
import { useItemStore } from '@/store/useItemStore';
import { useInspirationStore } from '@/store/useInspirationStore';
import { makeItem } from '@/services/__tests__/fixtures';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = '2026-10-10';
const SECTION_NAMES = ['工作', '学习', '健身', '生活'] as const;

/**
 * 内联快速添加的提示语**故意写死在这里**（而不是从 SECTION_CONFIGS 读）——
 * 常量改错了测试要能红。统一格式：「记录一{量词}{板块}…」。
 */
const SECTION_PLACEHOLDER: Record<(typeof SECTION_NAMES)[number], string> = {
  工作: '记录一项工作…',
  学习: '记录一项学习…',
  健身: '记录一项健身…',
  生活: '记录一项生活…',
};

const SECTION_KEY: Record<(typeof SECTION_NAMES)[number], string> = {
  工作: 'work',
  学习: 'study',
  健身: 'fitness',
  生活: 'life',
};

function inputByTestId(container: HTMLElement, testId: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  if (!input) throw new Error(`找不到 data-testid="${testId}" 的输入框`);
  return input;
}

const mounted: { root: Root; container: HTMLDivElement }[] = [];

function LocationProbe() {
  const { sectionId } = useParams();
  const location = useLocation();
  return createElement('div', { id: 'probe' }, `${sectionId ?? ''}|${location.search}`);
}

function renderDiary(date = DATE): HTMLDivElement {
  const element = createElement(
    MemoryRouter,
    { initialEntries: ['/today'], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    createElement(
      Routes,
      null,
      createElement(Route, { path: '*', element: createElement(DiaryList, { date }) }),
      createElement(Route, { path: '/section/:sectionId', element: createElement(LocationProbe) }),
    ),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted.push({ root, container });
  return container;
}

/** 该输入行内的「添加」按钮（同一父容器） */
function addButtonOf(input: HTMLInputElement): HTMLButtonElement {
  const button = input.parentElement?.querySelector('button');
  if (!button) throw new Error('该行没有按钮');
  return button;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function pressEnter(el: Element) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

/** 给 textarea 设值（行内编辑器用受控 value，要走原生 setter + input 事件） */
function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
    ?.set;
  setter?.call(textarea, value);
  act(() => {
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pressEnterOn(el: Element) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

function pressEscapeOn(el: Element) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === text,
  );
}

function resetStores() {
  useItemStore.setState({ items: [], lastCreatedId: null, pendingUndo: null, loading: false });
  useInspirationStore.setState({ inspirations: [], date: '', loading: false });
}

beforeEach(() => {
  resetStores();
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    for (const { root } of mounted) root.unmount();
  });
  for (const { container } of mounted) container.remove();
  mounted.length = 0;
});

describe('DiaryList 内联快速添加 — 形态', () => {
  it('① 四个板块组每组都有输入框 +「添加」按钮（连同灵感组共 5 个输入框）', () => {
    const container = renderDiary();

    for (const name of SECTION_NAMES) {
      const input = inputByTestId(container, `diary-inline-add-${SECTION_KEY[name]}`);
      expect(input).toBeTruthy();
      // placeholder 文案：统一「记录一项{板块}…」，提示语自己说出会落到哪个板块
      expect(input.placeholder).toBe(SECTION_PLACEHOLDER[name]);
      const button = addButtonOf(input);
      expect(button.textContent?.trim()).toBe('添加');
    }
    expect(container.querySelectorAll('input')).toHaveLength(5); // 4 板块 + 灵感
  });

  it('⑤ 空组也渲染输入行；旧的「暂无条目 · 点这里添加」按钮已消失', () => {
    const container = renderDiary();
    expect(container.textContent).not.toContain('暂无条目');
    // 空库 → 4 个板块输入框依然在
    for (const name of SECTION_NAMES) {
      expect(inputByTestId(container, `diary-inline-add-${SECTION_KEY[name]}`)).toBeTruthy();
    }
  });

  it('按钮激活态用本板块配色，且走 CSS 变量（换主题时自动跟随）', () => {
    const container = renderDiary();
    /** 板块名 → 该板块主色的 CSS 变量名 */
    const expected: Record<string, string> = {
      工作: '--c-work',
      学习: '--c-study',
      健身: '--c-fitness',
      生活: '--c-life',
    };
    for (const name of SECTION_NAMES) {
      const input = inputByTestId(container, `diary-inline-add-${SECTION_KEY[name]}`);
      setInputValue(input, 'x');
      const button = addButtonOf(input);
      const varName = expected[name]!;
      const style = button.getAttribute('style') ?? '';
      // 主色：描边 + 文字；浅底：同一变量 + 透明度
      expect(style).toContain(`var(${varName})`);
      expect(style).toContain(`rgb(var(${varName}) / 0.12)`);
      // 防回归：不允许再把 hex 写死在组件里，否则换主题会失效
      expect(style).not.toMatch(/#[0-9A-Fa-f]{6}/);
    }
  });
  it('空组时输入行紧跟组头；非空组时位于条目 ul 之后', () => {
    // 空组：没有 ul，输入行的前一个兄弟就是组头按钮
    const empty = renderDiary();
    const emptyRow = inputByTestId(empty, 'diary-inline-add-work').parentElement!;
    expect(emptyRow.previousElementSibling?.tagName).toBe('BUTTON');

    // 非空组：输入行前一个兄弟是条目 ul
    useItemStore.setState({
      items: [makeItem({ id: 'w1', sectionId: 'work', date: DATE })],
    });
    const full = renderDiary();
    const fullRow = inputByTestId(full, 'diary-inline-add-work').parentElement!;
    expect(fullRow.previousElementSibling?.tagName).toBe('UL');
  });
});

describe('DiaryList 内联快速添加 — 提交行为', () => {
  it('② 点「添加」→ store 新增一条（title/parentId/sectionId/date 正确）且输入框清空', () => {
    const container = renderDiary();
    const input = inputByTestId(container, 'diary-inline-add-work');
    setInputValue(input, '写周报');
    click(addButtonOf(input));

    const items = useItemStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: '写周报',
      parentId: null,
      sectionId: 'work',
      date: DATE,
      done: false,
    });
    // 输入框已清空
    expect(input.value).toBe('');
    // 新条目出现在 DOM 上
    expect(container.textContent).toContain('写周报');
  });

  it('③ 输入框内按 Enter 与点按钮等价', () => {
    const container = renderDiary();
    const input = inputByTestId(container, 'diary-inline-add-study');
    setInputValue(input, '看文档');
    pressEnter(input);

    const items = useItemStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: '看文档', sectionId: 'study', parentId: null });
    expect(input.value).toBe('');
  });

  it('提交后焦点回到输入框（连续录入）', () => {
    const container = renderDiary();
    const input = inputByTestId(container, 'diary-inline-add-work');
    setInputValue(input, 'A');
    click(addButtonOf(input));
    expect(document.activeElement).toBe(input);
  });

  it('④ 空串 / 纯空格：按钮 disabled 且点击不新增', () => {
    const container = renderDiary();
    const input = inputByTestId(container, 'diary-inline-add-work');
    const button = addButtonOf(input);

    // 初始空 → disabled
    expect(button.disabled).toBe(true);

    // 纯空格 → 仍 disabled
    setInputValue(input, '   ');
    expect(button.disabled).toBe(true);

    // 强行点击也不新增
    click(button);
    expect(useItemStore.getState().items).toHaveLength(0);

    // 有内容 → 解禁
    setInputValue(input, 'x');
    expect(button.disabled).toBe(false);
    // 清回空 → 再次禁用
    setInputValue(input, '');
    expect(button.disabled).toBe(true);
  });

  it('不同板块各自独立：往「生活」提交不会写进「工作」', () => {
    const container = renderDiary();
    const lifeInput = inputByTestId(container, 'diary-inline-add-life');
    setInputValue(lifeInput, '买菜');
    click(addButtonOf(lifeInput));

    const items = useItemStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.sectionId).toBe('life');
  });
});

describe('DiaryList 内联快速添加 — 导航 URL 仍带 ?date=', () => {
  it('⑥ 点组头 → /section/{key}?date={date}', () => {
    const container = renderDiary();
    const header = buttonByText(container, '工作:') ?? buttonByText(container, '工作');
    // 组头文本是「工作:」+ 条数 + ›，用包含匹配更稳
    const groupHeader =
      header ??
      Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes('工作'),
      )!;
    click(groupHeader);

    expect(container.querySelector('#probe')?.textContent).toBe(`work|?date=${DATE}`);
  });

  it('⑥ 点组头 → /section/{key}?date={date}（组头仍是进板块详情树的入口）', () => {
    const container = renderDiary();
    const header = buttonByText(container, '工作:') ?? buttonByText(container, '工作');
    // 组头文本是「工作:」+ 条数 + ›，用包含匹配更稳
    const groupHeader =
      header ??
      Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes('工作'),
      )!;
    click(groupHeader);

    expect(container.querySelector('#probe')?.textContent).toBe(`work|?date=${DATE}`);
  });

  /*
    ⑦ 点条目文字 → **行内编辑**（用户要求：主页直接改，不再跳板块页）。
    老契约是「点条目 → /section/{key}?date=」，已按新交互替换：
    点下去出现的是自动增高的 textarea（预填原标题、光标在末尾），且不导航。
  */
  it('⑦ 点条目文字 → 行内编辑（textarea 预填原标题，且不发生导航）', () => {
    useItemStore.setState({
      items: [makeItem({ id: 'w1', title: '写周报', sectionId: 'work', date: DATE })],
    });
    const container = renderDiary();

    const entryButton = buttonByText(container, '写周报');
    expect(entryButton).toBeTruthy();
    click(entryButton!);

    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    expect(editor, '点标题后没有出现行内编辑器').toBeTruthy();
    expect(editor!.value).toBe('写周报');
    // 不导航：探针只挂在 /section/:sectionId 路由上，此刻页面上不该有它
    expect(container.querySelector('#probe')).toBeNull();
  });

  it('⑦ 行内编辑：Enter 提交改写标题，Esc 取消丢弃修改', () => {
    useItemStore.setState({
      items: [makeItem({ id: 'w1', title: '写周报', sectionId: 'work', date: DATE })],
    });
    const container = renderDiary();

    // Enter 提交
    click(buttonByText(container, '写周报')!);
    const editor = container.querySelector<HTMLTextAreaElement>('textarea')!;
    setTextareaValue(editor, '写周报和月报');
    pressEnterOn(editor);
    expect(useItemStore.getState().items[0]?.title).toBe('写周报和月报');

    // Esc 取消：改了但不提交
    click(buttonByText(container, '写周报和月报')!);
    const editor2 = container.querySelector<HTMLTextAreaElement>('textarea')!;
    setTextareaValue(editor2, '不该保存的标题');
    pressEscapeOn(editor2);
    expect(useItemStore.getState().items[0]?.title).toBe('写周报和月报');
  });

  it('⑦ 行内编辑：清空再提交 → 保留原标题（误触全选+删除不丢内容）', () => {
    useItemStore.setState({
      items: [makeItem({ id: 'w1', title: '写周报', sectionId: 'work', date: DATE })],
    });
    const container = renderDiary();

    click(buttonByText(container, '写周报')!);
    const editor = container.querySelector<HTMLTextAreaElement>('textarea')!;
    setTextareaValue(editor, '   ');
    pressEnterOn(editor);
    expect(useItemStore.getState().items[0]?.title).toBe('写周报');
  });
});
