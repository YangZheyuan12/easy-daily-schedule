/**
 * 图片编辑的纯几何工具（不依赖任何浏览器 API，便于单元测试与小程序内核复用）。
 *
 * 坐标约定：
 * - `Rect` / `Size` 以「左上角原点 + 宽高」表示，单位为像素（或任意一致的单位）。
 * - 裁剪框（crop rect）在 `ImageEditor` 里存于**显示盒（display box）局部坐标**：
 *   即相对「旋转 + 缩放后图片在画布上的外接矩形」左上角的偏移。因此裁剪框永远轴对齐、
 *   不会随图片旋转而歪，夹取也只需在矩形范围内做，无需做逆变换。
 */

export interface Size {
  /** 宽（像素 / 单位） */
  width: number;
  /** 高（像素 / 单位） */
  height: number;
}

export interface Rect {
  /** 左上角 x */
  x: number;
  /** 左上角 y */
  y: number;
  /** 宽（允许临时为负，见 normalizeRect） */
  width: number;
  /** 高（允许临时为负） */
  height: number;
}

/** 裁剪预设比例；`free` 表示不锁定比例 */
export type AspectPreset = 'free' | '1:1' | '4:3' | '16:9';

/** 各预设对应的宽高比（width / height）；`free` 不在表内 */
export const ASPECT_RATIOS: Record<Exclude<AspectPreset, 'free'>, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
};

/** 把数值夹在 [min, max] 之间（min > max 时退化为返回两者中较近者） */
export function clampNumber(value: number, min: number, max: number): number {
  if (min > max) return Math.min(Math.max(value, max), min);
  return Math.min(Math.max(value, min), max);
}

/**
 * 归一化矩形：保证宽高非负。
 * 若 width < 0，则把 x 左移到真正左上角并取正宽；height 同理。
 * 归一化不改变矩形实际覆盖的区域。
 */
export function normalizeRect(rect: Rect): Rect {
  let { x, y, width, height } = rect;
  if (width < 0) {
    x = x + width;
    width = -width;
  }
  if (height < 0) {
    y = y + height;
    height = -height;
  }
  return { x, y, width, height };
}

/**
 * 计算一个 `width × height` 的矩形绕中心旋转 `degrees` 度后的轴对齐外接矩形尺寸。
 * 纯几何：与渲染无关，负角度、任意倍数角度都成立。
 */
export function rotatedBoundingBox(width: number, height: number, degrees: number): Size {
  const rad = (degrees * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(rad));
  const absSin = Math.abs(Math.sin(rad));
  return {
    width: width * absCos + height * absSin,
    height: width * absSin + height * absCos,
  };
}

/**
 * 把裁剪框夹在 bounds 内。
 * - 当裁剪框比 bounds 小：x / y 各自夹到 [0, bounds - size]；
 * - 当裁剪框比 bounds 还大（理论上不该发生，但防御性处理）：让对应边与 bounds 对齐
 *   （x 取负、右边缘贴齐 bounds 右缘），保证「框不溢出 bounds 太多」。
 * 返回新对象，不修改入参。
 */
export function clampCropRect(rect: Rect, bounds: Size): Rect {
  const maxX = bounds.width - rect.width;
  const maxY = bounds.height - rect.height;
  // 放得下：夹到 [0, 范围 - 宽]
  // 放不下（比范围还宽）：居中（必然两侧溢出，但中心对齐范围中心，最不偏）
  const x = bounds.width >= rect.width ? clampNumber(rect.x, 0, maxX) : (bounds.width - rect.width) / 2;
  const y =
    bounds.height >= rect.height ? clampNumber(rect.y, 0, maxY) : (bounds.height - rect.height) / 2;
  return { x, y, width: rect.width, height: rect.height };
}

/**
 * 按给定宽高比在 bounds 内生成一个**居中**的裁剪框。
 * - `aspect` 为 null（即 `free`）：返回整块 bounds（默认全图裁剪）；
 * - 否则在「宽优先」与「高优先」中取能完整放进 bounds 的较大者，居中放置。
 * 返回的矩形必然落在 bounds 内（且为正宽高）。
 */
export function createAspectCrop(aspect: number | null, bounds: Size): Rect {
  if (aspect == null || aspect <= 0) {
    return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  }
  let width = bounds.width;
  let height = width / aspect;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * aspect;
  }
  return {
    x: (bounds.width - width) / 2,
    y: (bounds.height - height) / 2,
    width,
    height,
  };
}
