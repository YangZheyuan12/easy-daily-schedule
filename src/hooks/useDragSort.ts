/**
 * 列表拖拽排序（纯 Pointer Events，零第三方依赖）。
 *
 * 为什么自己写而不引 dnd-kit / sortablejs：
 * - 这是一个移动端优先的项目，**触摸才是主场景**：指针序列的接管、`touch-action: none`、
 *   边缘自动滚动、安卓 WebView 的手势冲突，都得攥在自己手里才好调；
 * - 只需要「一维纵向列表 + 手柄拖拽」一种能力，通用库带来的是包体与心智负担。
 *
 * 三条刻意的行为约定：
 * 1. **必须抓手柄才拖**。行主体是输入框，整行可拖会让「点一下想把光标落在字中间」
 *    变成一次拖拽；手柄是唯一入口，语义清楚。
 * 2. **移动 4px 才算起手**（或按住 220ms）。手指落到手柄上多少带点抖动，
 *    不以阈值为界就会「点一下也拖走」。
 * 3. **让位动画只做 transform**，不做 FLIP 重排。
 *    被拖起的卡做 float（translateY 跟手），其余行按「被抽走的卡占了多高」
 *    整体让位 —— 行高不一致也不会留缝（推导见 `shiftOf`）。
 *
 * 实现上的三个坑（都踩过才有这些注释）：
 * - 🔴 位移必须用**文档坐标**（`clientY + scrollY`）：页面滚动时 clientY 不变但内容在动，
 *   不补 scrollY 卡片就会「脱手」，拖到一半突然跟手指错位。
 * - 🔴 **必须 `setPointerCapture`**：移动端 WebView 里手指快速滑出手柄 / 被浏览器当滚动手势
 *   接管时，pointermove 会丢帧甚至中断，「卡片突然跳一下」就是这么来的。锁住指针后，
 *   事件仍冒泡到 window（全局 move/up 监听照常工作），但不再丢。
 * - 🔴 **「抓哪跟哪」用 grabOffset，而不是「整体位移」**：单纯用 `clientY - startClientY`
 *   跟随，手指抓在卡片中下部时卡片顶部会瞬间跳到手指上方，视觉上就是一次乱跳。
 *   grabOffset = 手指按下时的文档 Y − 卡片顶部的文档 Y，之后卡片顶 = 手指文档 Y − grabOffset，
 *   抓点永远粘在指尖。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

/** 移动超过这个距离才算真正开始拖（小于此距离视为点击 / 误触） */
const START_THRESHOLD_PX = 4;
/** 按住不动超过这个时长也可以起手（有些人习惯先按住再拖） */
const HOLD_MS = 220;
/** 靠近屏幕上 / 下边缘多少像素开始自动滚动 */
const EDGE_PX = 72;
/** 自动滚动速度（px / 帧，按接近程度线性缩放） */
const EDGE_SPEED_PX = 10;
/** 松手后卡片归位的时长（JS 与 CSS 各写一份 —— CSS 变量读不回来） */
const SETTLE_MS = 180;
/** 让位过渡 */
const SHIFT_TRANSITION = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
/**
 * 目标判定的**滞回带**：被拖卡片中心必须越过相邻中心这么多像素，才允许
 * `to` 再多 / 再少一格。没有它，手指在两根卡片的交界处轻微抖动就会让 `to`
 * 在 N 与 N+1 之间反复横跳 —— 这正是「拖动时其他卡片乱动」的元凶。
 */
const TARGET_HYSTERESIS_PX = 6;

interface DragOptions {
  /** 当前参与排序的 id 序列（必须是**渲染顺序**） */
  ids: readonly string[];
  /** 松手且位置变化时回调：把 from 位置的元素挪到 to 位置 */
  onReorder: (from: number, to: number) => void;
}

interface DragState {
  activeId: string;
  from: number;
  to: number;
  /** 跟手的纵向位移（文档坐标，相对被拖卡原始顶部） */
  dy: number;
}

/** 拖拽开始时测好的几何：全部是**文档坐标**（含 scrollY），滚动也不失效 */
interface Metrics {
  ids: readonly string[];
  tops: number[];
  heights: number[];
  startClientY: number;
  startScrollY: number;
  activeHeight: number;
}

export interface DragSortResult {
  /** 当前被拖起的元素 id；没有拖拽时为 null */
  activeId: string | null;
  /** 每一行的 ref 收集器（拖拽时要它的真实高度与位置） */
  registerItem: (id: string) => (el: HTMLElement | null) => void;
  /** 传给行尾手柄的一组 props（含 `touch-action: none`） */
  handleProps: (id: string, index: number) => {
    onPointerDown: (event: ReactPointerEvent) => void;
    style: CSSProperties;
  };
  /** 每一行的动效样式 */
  itemStyle: (id: string, index: number) => CSSProperties;
}

/**
 * 一行要让开多少像素。
 *
 * 高度 `h` 的卡被抽走后，它下面 / 上面的行依次填补这段空间：
 * 目标在下面时，中间所有行整体上移 `h`；目标在上面时，中间所有行整体下移 `h`。
 * 「抽走」腾出的空间与「插回」占掉的空间恒等 —— 所以行高不一致也不会漏缝或重叠。
 */
export function shiftOf(index: number, from: number, to: number, h: number): number {
  if (from === to) return 0;
  if (from < to && index > from && index <= to) return -h;
  if (from > to && index >= to && index < from) return h;
  return 0;
}

/** 落到 to 位时，这张卡相对原始位置的纵向位移（用于松手后的归位动画） */
export function settleDyOf(heights: number[], from: number, to: number): number {
  if (from === to) return 0;
  if (to > from) {
    let sum = 0;
    for (let i = from + 1; i <= to; i += 1) sum += heights[i] ?? 0;
    return sum;
  }
  let sum = 0;
  for (let i = to; i < from; i += 1) sum -= heights[i] ?? 0;
  return sum;
}

/**
 * 被拖卡片中心落在哪里 → 它应该插到第几个位置（数组下标）。
 *
 * 目标下标 = 被拖卡片中心「之上」还有多少个**其它**行（不含被拖行本身）。
 * 这个计数天然等于插入下标，且**与 `from` 在哪无关** —— 拖第一项还是拖中间项
 * 都按同一套几何，行高不一致也成立。之前那个「`from ±`」式写法在 `from > 0` 时
 * 会让下标一上来就跳到 0（中后段条目拖一下就乱窜），就是「拖动乱动」的元凶。
 *
 * 最后一段是**滞回**：`to` 一旦落定，必须被拖卡片中心明显越过相邻中心
 * （见 `TARGET_HYSTERESIS_PX`）才允许再变一格，否则维持 `prevTo` ——
 * 这把「手指在交界点轻微抖动会让其他卡片反复横跳」直接掐死。
 */
export function computeTargetIndex(
  tops: number[],
  heights: number[],
  from: number,
  draggedCenter: number,
  prevTo: number,
): number {
  let raw = 0;
  for (let i = 0; i < tops.length; i += 1) {
    if (i === from) continue;
    const center = (tops[i] ?? 0) + (heights[i] ?? 0) / 2;
    if (center < draggedCenter) raw += 1;
  }
  if (raw === prevTo) return raw;
  const diff = raw - prevTo;
  // 明显跨过整张卡（相差 >1 格）→ 直接接受，不滞回（快速拖动本就该快）
  if (Math.abs(diff) > 1) return raw;
  /*
    只相差一格时加滞回：必须被拖卡片中心**明显**越过相邻边界卡的中心，
    才允许再变一格。边界卡 = 这一步 A 实际跨越的那张（与 from / prevTo 的相对位置有关）：
    - 前进（k+1）：若 prevTo 已 ≥ from（A 在自身下方区）边界是 prevTo+1，否则是 prevTo；
    - 回退（k-1）：若 prevTo > from（A 在自身下方区）边界是 prevTo，否则是 prevTo-1。
  */
  const step = diff > 0 ? 1 : -1;
  const boundary =
    step > 0 ? prevTo + (prevTo >= from ? 1 : 0) : prevTo - (prevTo > from ? 0 : 1);
  if (boundary < 0 || boundary >= tops.length) return prevTo;
  const boundaryCenter = (tops[boundary] ?? 0) + (heights[boundary] ?? 0) / 2;
  const crossed =
    step > 0
      ? draggedCenter >= boundaryCenter + TARGET_HYSTERESIS_PX
      : draggedCenter <= boundaryCenter - TARGET_HYSTERESIS_PX;
  return crossed ? raw : prevTo;
}

export function useDragSort({ ids, onReorder }: DragOptions): DragSortResult {
  const elements: MutableRefObject<Map<string, HTMLElement>> = useRef(new Map());
  const metrics = useRef<Metrics | null>(null);
  /** state 的 ref 镜像：全局指针回调读它，避免闭包拿到过期的 from / to */
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** 归位动画中的那一帧（DOM 顺序还没变，只把卡片滑进让出来的坑里） */
  const [settling, setSettling] = useState<{ id: string; dy: number } | null>(null);
  /**
   * 归位动画结束、数据真正重排的那一帧：被拖卡片的 DOM 槽位瞬间变化，但它的 transform
   * 还停在归位值上。若此时让 CSS transition 从「归位值 → 0」动画，卡片会被误推回旧槽位
   * 再滑回来 = 一次闪烁。这里用 `justSettled` 标一帧 `transition: none`，让 transform
   * 瞬切到 0（视觉上已停在目标槽，零位移），下一帧再恢复，闪烁即消。
   */
  const [justSettled, setJustSettled] = useState<string | null>(null);

  const pointerId = useRef<number | null>(null);
  const startInfo = useRef<{ id: string; index: number; x: number; y: number } | null>(null);
  const started = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);
  const lastClientY = useRef(0);
  /** 手指相对被拖卡片顶部的文档坐标偏移（用于「抓哪跟哪」） */
  const grabOffset = useRef(0);

  // 数据与回调会随渲染刷新；拖拽期间统一读 ref，避免闭包过期
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const updateDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  /**
   * 目标下标：数一数当前被拖卡片的中心越过了多少个其它行的中心。
   *
   * 按「中心」而不是按「高度累加」比较，天然兼容**行高不一致**的列表 ——
   * 任务行有的带第二行描述（更高），累加高度在这种列表上会算偏。
   *
   * `hysteresis` 让 `to` 一旦落定，必须被拖卡片中心**明显**越过相邻中心才会再变一格，
   * 消除手指在交界处的临界抖动（见 `TARGET_HYSTERESIS_PX`）。
   */
  const targetIndexOf = useCallback(
    (snapshot: Metrics, from: number, draggedCenter: number, prevTo: number) =>
      computeTargetIndex(snapshot.tops, snapshot.heights, from, draggedCenter, prevTo),
    [],
  );

  const stopAutoScroll = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  /** 拖到屏幕上 / 下边缘时自动滚页面（列表比屏幕长时是刚需） */
  const autoScroll = useCallback(() => {
    const y = lastClientY.current;
    const viewport = window.innerHeight;
    let delta = 0;
    if (y < EDGE_PX) delta = -EDGE_SPEED_PX * (1 - Math.max(0, y) / EDGE_PX);
    else if (y > viewport - EDGE_PX) {
      delta = EDGE_SPEED_PX * (1 - Math.max(0, viewport - y) / EDGE_PX);
    }
    if (delta !== 0) {
      window.scrollBy(0, delta);
      const snapshot = metrics.current;
      const prev = dragRef.current;
      if (snapshot && prev) {
        const pointerDocY = lastClientY.current + window.scrollY;
        const dy = pointerDocY - grabOffset.current - (snapshot.tops[prev.from] ?? 0);
        const draggedCenter =
          (snapshot.tops[prev.from] ?? 0) + (snapshot.heights[prev.from] ?? 0) / 2 + dy;
        const to = targetIndexOf(snapshot, prev.from, draggedCenter, prev.to);
        if (dy !== prev.dy || to !== prev.to) {
          updateDrag({ ...prev, dy, to });
        }
      }
    }
    rafId.current = requestAnimationFrame(autoScroll);
  }, [targetIndexOf, updateDrag]);

  const detach = useRef<(() => void) | null>(null);

  const releasePointer = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    stopAutoScroll();
    detach.current?.();
    detach.current = null;
    pointerId.current = null;
    startInfo.current = null;
    started.current = false;
    metrics.current = null;
  }, [stopAutoScroll]);

  const finish = useCallback(
    (commit: boolean) => {
      const snapshot = metrics.current;
      const state = dragRef.current;
      releasePointer();

      if (!snapshot || !state || !commit || state.from === state.to) {
        updateDrag(null);
        setSettling(null);
        return;
      }

      /*
        松手后先播一次归位：卡片滑到刚刚让出来的那个坑里，动画结束才真的改数据。
        直接改数据的话顺序是「瞬变」的 —— 刚才还在指尖上的卡，下一帧就跳到别处去了。
      */
      updateDrag(null);
      setSettling({
        id: state.activeId,
        dy: settleDyOf(snapshot.heights, state.from, state.to),
      });
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        // 数据真正重排的这一帧：把被拖卡标成 justSettled，瞬切 transform 到 0（已在目标槽，
        // 视觉零位移），避免「归位值被 CSS transition 推回旧槽再滑回」的闪烁
        setSettling(null);
        setJustSettled(state.activeId);
        onReorderRef.current(state.from, state.to);
        requestAnimationFrame(() => setJustSettled(null));
      }, SETTLE_MS);
    },
    [releasePointer, updateDrag],
  );

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      stopAutoScroll();
      detach.current?.();
    },
    [stopAutoScroll],
  );

  const measure = useCallback((): Metrics => {
    const currentIds = idsRef.current;
    const tops: number[] = [];
    const heights: number[] = [];
    let lastBottom = 0;
    for (const id of currentIds) {
      const el = elements.current.get(id);
      if (!el) {
        tops.push(lastBottom);
        heights.push(0);
        continue;
      }
      const rect = el.getBoundingClientRect();
      tops.push(rect.top + window.scrollY);
      heights.push(rect.height);
      lastBottom = rect.bottom + window.scrollY;
    }
    return {
      ids: currentIds,
      tops,
      heights,
      startClientY: lastClientY.current,
      startScrollY: window.scrollY,
      activeHeight: 0,
    };
  }, []);

  /** 真·起手：量一遍几何，之后交给全局指针监听驱动 */
  const begin = useCallback(
    (index: number) => {
      const start = startInfo.current;
      if (!start || started.current) return;
      started.current = true;
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      const snapshot = measure();
      snapshot.activeHeight = snapshot.heights[index] ?? 0;
      metrics.current = snapshot;
      /*
        grabOffset：手指按下时相对被拖卡片顶部的文档偏移。
        之后卡片顶 = 手指文档 Y − grabOffset，于是「抓在哪、卡片哪点就粘在指尖」，
        不会因为起始点不在卡片顶部而猛地跳一下。
      */
      grabOffset.current = lastClientY.current + window.scrollY - (snapshot.tops[index] ?? 0);
      updateDrag({ activeId: start.id, from: index, to: index, dy: 0 });
      stopAutoScroll();
      rafId.current = requestAnimationFrame(autoScroll);
    },
    [autoScroll, measure, stopAutoScroll, updateDrag],
  );

  const refSetters = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const registerItem = useCallback(
    (id: string) => {
      /*
        🔴 按 id 缓存 setter：直接返回新闭包会让 React 每次渲染都解挂再挂一次 ref
        （同一帧内 Map 里元素先 delete 再 set），偏偏丢掉的经常就是手指按着的那一行
        —— 表现为「拖到一半突然跳回原位」。
      */
      const cached = refSetters.current.get(id);
      if (cached) return cached;
      const setter = (el: HTMLElement | null) => {
        if (el) elements.current.set(id, el);
        else elements.current.delete(id);
      };
      refSetters.current.set(id, setter);
      return setter;
    },
    [],
  );

  /** 挂全局 pointermove / up / cancel（手指可能滑出手柄，甚至在键盘上松开） */
  const attach = useCallback(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      if (pointerId.current === null || event.pointerId !== pointerId.current) return;
      const start = startInfo.current;
      if (!start) return;
      lastClientY.current = event.clientY;

      if (!started.current) {
        const dx = Math.abs(event.clientX - start.x);
        const dyAbs = Math.abs(event.clientY - start.y);
        if (dx < START_THRESHOLD_PX && dyAbs < START_THRESHOLD_PX) return;
        begin(start.index);
        return;
      }

      const snapshot = metrics.current;
      const prev = dragRef.current;
      if (!snapshot || !prev) return;
      const pointerDocY = event.clientY + window.scrollY;
      // 「抓哪跟哪」：卡片顶 = 手指文档 Y − grabOffset → 相对原始顶的位移
      const dy = pointerDocY - grabOffset.current - (snapshot.tops[prev.from] ?? 0);
      const draggedCenter =
        (snapshot.tops[prev.from] ?? 0) + (snapshot.heights[prev.from] ?? 0) / 2 + dy;
      const to = targetIndexOf(snapshot, prev.from, draggedCenter, prev.to);
      if (prev.dy === dy && prev.to === to) return;
      updateDrag({ ...prev, dy, to });
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    const options = { passive: false } as AddEventListenerOptions;
    window.addEventListener('pointermove', onMove, options);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    detach.current = () => {
      window.removeEventListener('pointermove', onMove, options);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [begin, finish, targetIndexOf, updateDrag]);

  const handleProps = useCallback(
    (id: string, index: number) => ({
      /*
        🔴 `touch-action: none` 是必需的：安卓 / iOS 会把在元素上的纵向手势判成「滚页面」，
        页面一滚拖拽就跟手性全失。有了它，这一串指针事件从头到尾留在这里，
        再配合 window 级监听 + setPointerCapture，手指滑出元素也不丢。
      */
      style: { touchAction: 'none', cursor: 'grab' } as CSSProperties,
      onPointerDown: (event: ReactPointerEvent) => {
        if (dragRef.current || settling) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        pointerId.current = event.pointerId;
        startInfo.current = { id, index, x: event.clientX, y: event.clientY };
        lastClientY.current = event.clientY;
        started.current = false;
        // 🔴 锁住指针：之后所有 move / up 都定向到手柄，window 监听照常收到，但不再丢帧
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* 某些老旧 WebView 不支持，忽略 —— window 监听仍能兜住大部分场景 */
        }
        attach();
        if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(() => begin(index), HOLD_MS);
      },
    }),
    [attach, begin, settling],
  );

  const itemStyle = useCallback(
    (id: string, index: number): CSSProperties => {
      // 数据重排的那一帧：瞬切到 0，消除「归位值被 transition 推回旧槽」的闪烁
      if (justSettled && justSettled === id) {
        return { transition: 'none', transform: 'none', position: 'relative' };
      }
      if (settling && settling.id === id) {
        return {
          transform: `translateY(${settling.dy}px)`,
          transition: `transform ${SETTLE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          zIndex: 20,
          position: 'relative',
        };
      }
      if (drag && drag.activeId === id) {
        return {
          transform: `translateY(${drag.dy}px)`,
          /*
            🔴 用「已定义但 0ms」的 transition，而不是 `none`。
            松手进入归位动画时要从 `none` 切到 `180ms` —— 部分浏览器在「同一帧把
            transition 从 none 改成有值 + 改 transform」时不会启动过渡，结果卡片瞬间
            从手指位置跳到目标位 = 松手「闪一下」。0ms 是一个「已生效的过渡」，
            切到 180ms 时一定能平滑启动，且 0ms 本身跟手零延迟。
          */
          transition: 'transform 0ms',
          zIndex: 30,
          position: 'relative',
        };
      }
      if (drag) {
        return {
          transform: `translateY(${shiftOf(index, drag.from, drag.to, metrics.current?.activeHeight ?? 0)}px)`,
          transition: SHIFT_TRANSITION,
          position: 'relative',
        };
      }
      return { transition: SHIFT_TRANSITION, position: 'relative' };
    },
    [drag, settling, justSettled],
  );

  return { activeId: drag?.activeId ?? null, registerItem, handleProps, itemStyle };
}
