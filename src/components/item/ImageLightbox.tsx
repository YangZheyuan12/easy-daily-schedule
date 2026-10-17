import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { Icon } from '@/components/ui/Icon';

interface ImageLightboxProps {
  blob: Blob | null;
  onClose: () => void;
  /** 是否显示「编辑」按钮（仅在有归属、可覆盖写入的上下文传 true） */
  editable?: boolean;
  /** 点击「编辑」：由外层负责打开编辑器并调用 replace，本组件只负责触发 */
  onEdit?: () => void;
}

/**
 * 全屏看图 + 查看细节。
 *
 * - 双指捏合 / 滚轮缩放、单指或鼠标拖拽平移、双击或双指轻点复位；
 * - 底部工具条提供放大 / 缩小 / 左右旋转 90° / 复位，并显示当前缩放百分比；
 * - 顶部「编辑」按钮（仅 `editable` 时显示）把当前图交给外层做裁剪旋转后覆盖写回。
 *
 * 变换模型：以容器中心 O 为锚，屏幕点 P 与平移 t、缩放 s 的关系
 *   S(p) = O + t + R(rot)·(s·p)
 * 捏合 / 拖拽时按「起始锚点内容跟随当前手指中点」求解新平移，旋转存在时同样成立。
 */
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

interface Gesture {
  mode: 'pan' | 'pinch';
  startMidX: number;
  startMidY: number;
  startDist: number;
  startScale: number;
  startTx: number;
  startTy: number;
  moved: boolean;
}

export function ImageLightbox({ blob, onClose, editable = false, onEdit }: ImageLightboxProps) {
  const url = useObjectUrl(blob);

  // 渲染态（驱动 <img> 的 transform）
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  // 高频手势用的镜像 ref（避免闭包拿到过期值，也避免每次 move 重建监听）
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<Gesture | null>(null);
  const justPanned = useRef(false);
  const tapTime = useRef(0);

  const apply = (nextScale: number, nextTx: number, nextTy: number) => {
    scaleRef.current = nextScale;
    txRef.current = nextTx;
    tyRef.current = nextTy;
    setScale(nextScale);
    setTx(nextTx);
    setTy(nextTy);
  };

  const reset = () => apply(1, 0, 0);

  // 换图复位（同时清掉上一次的手势 / 平移状态）
  useEffect(() => {
    pointers.current.clear();
    gesture.current = null;
    reset();
  }, [blob]);

  // Esc 退出
  useEffect(() => {
    if (!blob) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [blob, onClose]);

  // 滚轮缩放（非 passive 监听，才能 preventDefault 阻止页面滚动）
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !blob) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const prev = scaleRef.current;
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE);
      if (next === prev) return;
      const rect = el.getBoundingClientRect();
      const ox = rect.left + rect.width / 2;
      const oy = rect.top + rect.height / 2;
      const f = next / prev;
      const px = event.clientX;
      const py = event.clientY;
      apply(next, px - ox - f * (px - ox - txRef.current), py - oy - f * (py - oy - tyRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [blob]);

  const getCenter = () => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {
      /* 个别浏览器在已释放后调用会抛错，忽略 */
    }
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current = {
        mode: 'pan',
        startMidX: event.clientX,
        startMidY: event.clientY,
        startDist: 0,
        startScale: scaleRef.current,
        startTx: txRef.current,
        startTy: tyRef.current,
        moved: false,
      };
    } else if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = {
        mode: 'pinch',
        startMidX: (a.x + b.x) / 2,
        startMidY: (a.y + b.y) / 2,
        startDist: dist(a, b),
        startScale: scaleRef.current,
        startTx: txRef.current,
        startTy: tyRef.current,
        moved: false,
      };
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pts = [...pointers.current.values()];
    let px: number;
    let py: number;
    let f: number;
    if (g.mode === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const d = dist(a, b);
      if (g.startDist === 0) return;
      const next = clamp(g.startScale * (d / g.startDist), MIN_SCALE, MAX_SCALE);
      px = (a.x + b.x) / 2;
      py = (a.y + b.y) / 2;
      f = next / g.startScale;
      if (next !== scaleRef.current) setScale(next);
    } else {
      px = event.clientX;
      py = event.clientY;
      f = 1;
    }
    const o = getCenter();
    const nx = px - o.x - f * (g.startMidX - o.x - g.startTx);
    const ny = py - o.y - f * (g.startMidY - o.y - g.startTy);
    g.moved = true;
    justPanned.current = true;
    txRef.current = nx;
    tyRef.current = ny;
    setTx(nx);
    setTy(ny);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    try {
      (event.target as Element).releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const g = gesture.current;
    if (g && g.mode === 'pan' && !g.moved) {
      // 单指轻点：双触复位（与双击等效），便于触屏快速还原
      const now = Date.now();
      if (tapTime.current && now - tapTime.current < 300) {
        reset();
        tapTime.current = 0;
      } else {
        tapTime.current = now;
      }
    }
    if (pointers.current.size === 0) {
      gesture.current = null;
      window.setTimeout(() => {
        justPanned.current = false;
      }, 350);
    } else if (pointers.current.size === 1) {
      // 双指松一根 → 以剩余那根重置基线，避免跳变
      const [p] = [...pointers.current.values()];
      gesture.current = {
        mode: 'pan',
        startMidX: p.x,
        startMidY: p.y,
        startDist: 0,
        startScale: scaleRef.current,
        startTx: txRef.current,
        startTy: tyRef.current,
        moved: false,
      };
    }
  };

  // 按钮缩放：以容器中心为锚（P = O ⇒ 平移按 f 缩放即可）
  const zoomByButton = (factor: number) => {
    const prev = scaleRef.current;
    const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE);
    const f = next / prev;
    apply(next, txRef.current * f, tyRef.current * f);
  };

  const transform = `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(${scale})`;

  if (!blob) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 flex flex-col m-fade"
      onClick={() => {
        if (justPanned.current) {
          justPanned.current = false;
          return;
        }
        onClose();
      }}
    >
      {/* 顶部栏：左「编辑」（可选），右关闭 */}
      <div
        className="absolute top-0 inset-x-0 z-[1] flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        {editable ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 text-white/90 active:opacity-60"
            aria-label="编辑图片"
          >
            <Icon name="edit" size={20} />
            <span className="text-body">编辑</span>
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center text-white/90 active:opacity-60"
        >
          <Icon name="close" size={24} strokeWidth={2.2} />
        </button>
      </div>

      {/* 看图舞台：手势缩放 / 平移的承载层 */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
      >
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain select-none"
            style={{ transform, transformOrigin: 'center center', willChange: 'transform' }}
          />
        ) : (
          <div className="w-40 h-40 rounded-lg bg-white/10" />
        )}
      </div>

      {/* 底部工具条：放大 / 缩小 / 旋转 / 复位 */}
      <div
        className="absolute bottom-0 inset-x-0 z-[1] flex items-center justify-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 bg-gradient-to-t from-black/70 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={() => zoomByButton(1 / 1.3)} aria-label="缩小" className="w-10 h-10 flex items-center justify-center text-white/90 active:opacity-60">
          <Icon name="zoom-out" size={22} />
        </button>
        <span className="w-12 text-center text-caption text-white/80">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomByButton(1.3)} aria-label="放大" className="w-10 h-10 flex items-center justify-center text-white/90 active:opacity-60">
          <Icon name="zoom-in" size={22} />
        </button>
        <button type="button" onClick={() => setRotation((r) => r - 90)} aria-label="向左旋转90度" className="w-10 h-10 flex items-center justify-center text-white/90 active:opacity-60">
          <Icon name="rotate-ccw" size={22} />
        </button>
        <button type="button" onClick={() => setRotation((r) => r + 90)} aria-label="向右旋转90度" className="w-10 h-10 flex items-center justify-center text-white/90 active:opacity-60">
          <Icon name="rotate-cw" size={22} />
        </button>
        <button type="button" onClick={reset} aria-label="复位" className="w-10 h-10 flex items-center justify-center text-white/90 active:opacity-60">
          <Icon name="reset" size={22} />
        </button>
      </div>
    </div>
  );
}
