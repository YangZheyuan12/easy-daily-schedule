import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import {
  ASPECT_RATIOS,
  clampCropRect,
  createAspectCrop,
  normalizeRect,
  rotatedBoundingBox,
  type AspectPreset,
  type Rect,
  type Size,
} from '@/utils/imageTransform';

interface ImageEditorProps {
  /** 待编辑的图片二进制 */
  blob: Blob;
  /** 取消（跳过当前这张） */
  onCancel: () => void;
  /** 确认：回传编辑后的图片二进制 */
  onConfirm: (edited: Blob) => void;
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 3;
const ROTATE_RANGE = 180;
/** 角点命中容差（显示盒局部 px） */
const HANDLE_SIZE = 14;
/** 裁剪框最小边长（显示盒局部 px） */
const MIN_CROP = 24;
/** 导出图最长边上限，超过则按比例缩小 */
const MAX_OUTPUT_SIDE = 1600;
/** 显示盒相对画布的留白系数（0.92 = 留 8%） */
const FIT_PADDING = 0.92;

const ASPECT_OPTIONS: { key: AspectPreset; label: string }[] = [
  { key: 'free', label: '自由' },
  { key: '1:1', label: '1:1' },
  { key: '4:3', label: '4:3' },
  { key: '16:9', label: '16:9' },
];

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** 把任意角度归一化到 (-180, 180]，用于自由旋转滑块的显示值 */
function normalizeDegrees(deg: number): number {
  let r = ((deg % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r;
}

/**
 * 计算旋转 + 缩放后图片在画布上的「显示盒」几何参数（纯函数，依赖入参不依赖浏览器）。
 * 返回显示盒尺寸 (DW, DH) 与左上角在画布坐标系中的位置 (boxX, boxY)，以及综合缩放 s。
 */
function computeView(
  cssW: number,
  cssH: number,
  imgW: number,
  imgH: number,
  rotation: number,
  scale: number,
): { s: number; DW: number; DH: number; boxX: number; boxY: number } {
  const box = rotatedBoundingBox(imgW, imgH, rotation);
  const base = Math.min(cssW / box.width, cssH / box.height) * FIT_PADDING;
  const s = base * scale;
  const DW = box.width * s;
  const DH = box.height * s;
  return { s, DW, DH, boxX: cssW / 2 - DW / 2, boxY: cssH / 2 - DH / 2 };
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type DragMode = 'move' | 'resize';

interface DragState {
  mode: DragMode;
  handle: Corner | null;
  startLx: number;
  startLy: number;
  startCrop: Rect;
}

/** 拖拽缩放时，被拖动角所「固定」的对顶角坐标 */
function oppositeCorner(handle: Corner, c: Rect): [number, number] {
  switch (handle) {
    case 'tl':
      return [c.x + c.width, c.y + c.height];
    case 'tr':
      return [c.x, c.y + c.height];
    case 'bl':
      return [c.x + c.width, c.y];
    case 'br':
      return [c.x, c.y];
  }
}

/** 保证裁剪框至少 MIN_CROP，并重新夹取以免越界 */
function enforceMin(rect: Rect, DW: number, DH: number): Rect {
  const min = Math.min(MIN_CROP, DW, DH);
  const next = { ...rect };
  if (next.width < min) next.width = min;
  if (next.height < min) next.height = min;
  return clampCropRect(next, { width: DW, height: DH });
}

/**
 * 全屏图片编辑器（缩放 / 旋转 / 裁剪），编辑单张图片。
 *
 * 裁剪框存于「显示盒」局部坐标（轴对齐，不随图片旋转而歪），因此指针交互无需做逆变换；
 * 所有渲染走 JSX 里的 `<canvas ref>`。仅导出时为构造离屏画布使用一次
 * `document.createElement('canvas')`（组件层允许）。
 */
export function ImageEditor({ blob, onCancel, onConfirm }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [preset, setPreset] = useState<AspectPreset>('free');
  const [crop, setCrop] = useState<Rect | null>(null);

  // 图片以 ref 持有（不是 state，避免无谓重渲染）；加载完成后记录自然尺寸
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgSizeRef = useRef<Size>({ width: 0, height: 0 });
  const dragRef = useRef<DragState | null>(null);

  const originalMime = blob.type || 'image/jpeg';

  // 把 blob 解码成内存图片
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      imgSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
      // 等浏览器完成本帧布局后，按显示盒初始化裁剪框（默认全图）
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { DW, DH } = computeView(
          canvas.clientWidth,
          canvas.clientHeight,
          img.naturalWidth,
          img.naturalHeight,
          0,
          1,
        );
        setCrop({ x: 0, y: 0, width: DW, height: DH });
      });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // 根据当前状态重绘画布（只依赖显示相关的 state）
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cssW, cssH);

    const { width: imgW, height: imgH } = imgSizeRef.current;
    const img = imgRef.current;
    if (!img || imgW === 0 || imgH === 0) return;

    const view = computeView(cssW, cssH, imgW, imgH, rotation, scale);
    const { s, DW, DH, boxX, boxY } = view;

    // 绘制图片本体
    ctx.save();
    ctx.translate(cssW / 2, cssH / 2);
    ctx.rotate(rad(rotation));
    ctx.scale(s, s);
    ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
    ctx.restore();

    // 裁剪框（显示盒局部坐标 → 画布坐标），缺失时用整盒兜底
    const drawCrop: Rect = crop
      ? clampCropRect(crop, { width: DW, height: DH })
      : { x: 0, y: 0, width: DW, height: DH };
    const cx = boxX + drawCrop.x;
    const cy = boxY + drawCrop.y;
    const cw = drawCrop.width;
    const ch = drawCrop.height;

    // 框外变暗
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(boxX, boxY, DW, Math.max(0, cy - boxY));
    ctx.fillRect(boxX, cy + ch, DW, Math.max(0, boxY + DH - (cy + ch)));
    ctx.fillRect(boxX, cy, Math.max(0, cx - boxX), ch);
    ctx.fillRect(cx + cw, cy, Math.max(0, boxX + DW - (cx + cw)), ch);

    // 边框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cw, ch);

    // 四角手柄
    const handles: [number, number][] = [
      [cx, cy],
      [cx + cw, cy],
      [cx, cy + ch],
      [cx + cw, cy + ch],
    ];
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1.5;
    for (const [hx, hy] of handles) {
      ctx.beginPath();
      ctx.rect(hx - 6, hy - 6, 12, 12);
      ctx.fill();
      ctx.stroke();
    }
  }, [crop, rotation, scale]);

  // 状态变化即重绘
  useEffect(() => {
    render();
  }, [render]);

  // 容器尺寸变化时（旋转屏 / 键盘弹起）重绘
  const renderRef = useRef(render);
  renderRef.current = render;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => renderRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 屏幕坐标 → 显示盒局部坐标 */
  const toLocal = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const { width: imgW, height: imgH } = imgSizeRef.current;
    const view = computeView(cssW, cssH, imgW, imgH, rotation, scale);
    return {
      lx: clientX - rect.left - view.boxX,
      ly: clientY - rect.top - view.boxY,
      view,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!crop) return;
    const { lx, ly } = toLocal(e.clientX, e.clientY);
    const corners: Record<Corner, [number, number]> = {
      tl: [crop.x, crop.y],
      tr: [crop.x + crop.width, crop.y],
      bl: [crop.x, crop.y + crop.height],
      br: [crop.x + crop.width, crop.y + crop.height],
    };
    let handle: Corner | null = null;
    for (const key of Object.keys(corners) as Corner[]) {
      const [px, py] = corners[key];
      if (Math.abs(lx - px) <= HANDLE_SIZE && Math.abs(ly - py) <= HANDLE_SIZE) {
        handle = key;
        break;
      }
    }
    const inside =
      lx > crop.x && lx < crop.x + crop.width && ly > crop.y && ly < crop.y + crop.height;

    if (handle) {
      dragRef.current = { mode: 'resize', handle, startLx: lx, startLy: ly, startCrop: { ...crop } };
    } else if (inside) {
      dragRef.current = { mode: 'move', handle: null, startLx: lx, startLy: ly, startCrop: { ...crop } };
    } else {
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { lx, ly, view } = toLocal(e.clientX, e.clientY);
    const { DW, DH } = view;

    let next: Rect;
    if (drag.mode === 'move') {
      next = {
        ...drag.startCrop,
        x: drag.startCrop.x + (lx - drag.startLx),
        y: drag.startCrop.y + (ly - drag.startLy),
      };
    } else {
      const anchor = oppositeCorner(drag.handle!, drag.startCrop);
      let w = Math.abs(lx - anchor[0]);
      let h = Math.abs(ly - anchor[1]);
      const ratio = preset !== 'free' ? ASPECT_RATIOS[preset] : null;
      if (ratio != null) h = w / ratio; // 锁定比例时由宽驱动高
      const x = Math.min(anchor[0], lx);
      const y = Math.min(anchor[1], ly);
      next = normalizeRect({ x, y, width: w, height: h });
    }
    next = clampCropRect(next, { width: DW, height: DH });
    next = enforceMin(next, DW, DH);
    setCrop(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* 指针已释放则忽略 */
    }
  };

  /** 切换裁剪比例预设：非自由时立即生成居中裁剪框 */
  const changePreset = (key: AspectPreset) => {
    setPreset(key);
    if (key === 'free') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width: imgW, height: imgH } = imgSizeRef.current;
    const view = computeView(canvas.clientWidth, canvas.clientHeight, imgW, imgH, rotation, scale);
    setCrop(createAspectCrop(ASPECT_RATIOS[key], { width: view.DW, height: view.DH }));
  };

  /** 重置：恢复原始变换 + 全图裁剪 */
  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setPreset('free');
    const canvas = canvasRef.current;
    if (canvas) {
      const { width: imgW, height: imgH } = imgSizeRef.current;
      const view = computeView(canvas.clientWidth, canvas.clientHeight, imgW, imgH, 0, 1);
      setCrop({ x: 0, y: 0, width: view.DW, height: view.DH });
    }
  };

  /** 确认：把变换 + 裁剪结果渲染到离屏画布并导出 Blob */
  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const { width: imgW, height: imgH } = imgSizeRef.current;
    const view = computeView(cssW, cssH, imgW, imgH, rotation, scale);
    const safeCrop = crop
      ? clampCropRect(crop, { width: view.DW, height: view.DH })
      : { x: 0, y: 0, width: view.DW, height: view.DH };

    let outW = Math.max(1, Math.round(safeCrop.width));
    let outH = Math.max(1, Math.round(safeCrop.height));
    const longest = Math.max(outW, outH);
    if (longest > MAX_OUTPUT_SIDE) {
      const k = MAX_OUTPUT_SIDE / longest;
      outW = Math.max(1, Math.round(outW * k));
      outH = Math.max(1, Math.round(outH * k));
    }

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    if (!octx) {
      onConfirm(blob);
      return;
    }
    // 白底：旋转后四角留白 / JPEG 不支持透明时更干净
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, outW, outH);

    const scaleX = outW / safeCrop.width;
    const scaleY = outH / safeCrop.height;
    octx.scale(scaleX, scaleY);
    octx.translate(-(view.boxX + safeCrop.x), -(view.boxY + safeCrop.y));
    octx.translate(cssW / 2, cssH / 2);
    octx.rotate(rad(rotation));
    octx.scale(view.s, view.s);
    octx.translate(-imgW / 2, -imgH / 2);
    octx.drawImage(img, 0, 0, imgW, imgH);

    const mime = originalMime.startsWith('image/') ? originalMime : 'image/jpeg';
    const quality = mime === 'image/jpeg' ? 0.9 : undefined;
    out.toBlob(
      (result) => {
        if (result) onConfirm(result);
        else onConfirm(blob);
      },
      mime,
      quality,
    );
  }, [blob, crop, rotation, scale, originalMime, onConfirm]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white select-none">
      {/* 顶部控制面板 */}
      <div className="flex-none px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)]">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 text-white/80 active:opacity-60"
            aria-label="取消"
          >
            <Icon name="close" size={22} strokeWidth={2.2} />
            <span className="text-body">取消</span>
          </button>
          <span className="text-body font-medium">编辑图片</span>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-white/80 active:opacity-60"
            aria-label="重置"
          >
            <Icon name="reset" size={20} />
            <span className="text-body">重置</span>
          </button>
        </div>

        {/* 缩放 */}
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="zoom-out" size={18} className="text-white/70" />
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="flex-1 accent-white"
              aria-label="缩放"
            />
            <Icon name="zoom-in" size={18} className="text-white/70" />
            <span className="w-12 text-right text-caption text-white/70">
              {Math.round(scale * 100)}%
            </span>
          </div>
        </div>

        {/* 旋转 */}
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRotation((r) => r - 90)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
              aria-label="向左旋转90度"
            >
              <Icon name="rotate-ccw" size={18} />
            </button>
            <input
              type="range"
              min={-ROTATE_RANGE}
              max={ROTATE_RANGE}
              step={1}
              value={normalizeDegrees(rotation)}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="flex-1 accent-white"
              aria-label="自由旋转"
            />
            <button
              type="button"
              onClick={() => setRotation((r) => r + 90)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
              aria-label="向右旋转90度"
            >
              <Icon name="rotate-cw" size={18} />
            </button>
            <span className="w-12 text-right text-caption text-white/70">
              {Math.round(normalizeDegrees(rotation))}°
            </span>
          </div>
        </div>

        {/* 裁剪比例预设 */}
        <div className="flex items-center gap-2">
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => changePreset(opt.key)}
              className={clsx(
                'h-8 rounded-full px-3 text-caption active:opacity-70',
                preset === opt.key ? 'bg-white text-black' : 'bg-white/10 text-white/80',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 预览画布（底部留出操作条空间，避免被遮挡） */}
      <div ref={containerRef} className="relative min-h-0 flex-1 pb-[150px]">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* 底部操作条：悬浮在 Tab 胶囊之上（bottom-[100px]） */}
      <div className="fixed inset-x-0 bottom-[100px] z-[61] flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex w-full max-w-[430px] gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-white active:opacity-70"
          >
            <Icon name="close" size={20} strokeWidth={2.2} />
            <span className="text-body font-medium">取消</span>
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-black active:opacity-80"
          >
            <Icon name="check" size={20} strokeWidth={2.4} />
            <span className="text-body font-medium">确认</span>
          </button>
        </div>
      </div>
    </div>
  );
}
