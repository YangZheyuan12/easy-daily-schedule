import { describe, expect, it } from 'vitest';
import {
  ASPECT_RATIOS,
  clampCropRect,
  clampNumber,
  createAspectCrop,
  normalizeRect,
  rotatedBoundingBox,
  type Rect,
  type Size,
} from '@/utils/imageTransform';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('clampNumber', () => {
  it('正常夹取', () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(11, 0, 10)).toBe(10);
  });

  it('min > max 时退化为取较近者', () => {
    expect(clampNumber(5, 10, 0)).toBe(5);
    expect(clampNumber(-5, 10, 0)).toBe(0);
    expect(clampNumber(15, 10, 0)).toBe(10);
  });
});

describe('normalizeRect', () => {
  it('正宽高原样返回', () => {
    const r: Rect = { x: 1, y: 2, width: 3, height: 4 };
    expect(normalizeRect(r)).toEqual(r);
  });

  it('负宽：把 x 左移到真正左上角', () => {
    expect(normalizeRect({ x: 5, y: 2, width: -3, height: 4 })).toEqual({
      x: 2,
      y: 2,
      width: 3,
      height: 4,
    });
  });

  it('负高：把 y 上移到真正左上角', () => {
    expect(normalizeRect({ x: 1, y: 5, width: 3, height: -4 })).toEqual({
      x: 1,
      y: 1,
      width: 3,
      height: 4,
    });
  });

  it('宽高皆负：两个方向都翻转', () => {
    expect(normalizeRect({ x: 5, y: 5, width: -3, height: -4 })).toEqual({
      x: 2,
      y: 1,
      width: 3,
      height: 4,
    });
  });

  it('零宽高不改变', () => {
    expect(normalizeRect({ x: 0, y: 0, width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe('rotatedBoundingBox', () => {
  it('0° 等于原尺寸', () => {
    const box = rotatedBoundingBox(100, 50, 0);
    expect(box.width).toBeCloseTo(100, 6);
    expect(box.height).toBeCloseTo(50, 6);
  });

  it('90° 宽高互换', () => {
    const box = rotatedBoundingBox(100, 50, 90);
    expect(box.width).toBeCloseTo(50, 6);
    expect(box.height).toBeCloseTo(100, 6);
  });

  it('180° 回到原尺寸', () => {
    const box = rotatedBoundingBox(100, 50, 180);
    expect(box.width).toBeCloseTo(100, 6);
    expect(box.height).toBeCloseTo(50, 6);
  });

  it('270° 宽高互换', () => {
    const box = rotatedBoundingBox(100, 50, 270);
    expect(box.width).toBeCloseTo(50, 6);
    expect(box.height).toBeCloseTo(100, 6);
  });

  it('360° 等于原尺寸', () => {
    const box = rotatedBoundingBox(100, 50, 360);
    expect(box.width).toBeCloseTo(100, 6);
    expect(box.height).toBeCloseTo(50, 6);
  });

  it('45° 外接正方形（公式正确）', () => {
    const box = rotatedBoundingBox(100, 50, 45);
    const c = Math.SQRT1_2;
    expect(close(box.width, 100 * c + 50 * c)).toBe(true);
    expect(close(box.height, 100 * c + 50 * c)).toBe(true);
    expect(box.width).toBeCloseTo(106.066017, 4);
  });

  it('负角度与正角度对称', () => {
    expect(rotatedBoundingBox(100, 50, -45)).toEqual(rotatedBoundingBox(100, 50, 45));
  });
});

describe('clampCropRect', () => {
  const bounds: Size = { width: 100, height: 100 };

  it('完全在范围内时原样返回', () => {
    const r: Rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(clampCropRect(r, bounds)).toEqual(r);
  });

  it('x 为负时夹到 0', () => {
    expect(clampCropRect({ x: -5, y: 10, width: 20, height: 20 }, bounds)).toEqual({
      x: 0,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it('x 溢出右边界时贴齐右缘', () => {
    expect(clampCropRect({ x: 90, y: 10, width: 20, height: 20 }, bounds)).toEqual({
      x: 80,
      y: 10,
      width: 20,
      height: 20,
    });
  });

  it('y 为负时夹到 0', () => {
    expect(clampCropRect({ x: 10, y: -5, width: 20, height: 20 }, bounds)).toEqual({
      x: 10,
      y: 0,
      width: 20,
      height: 20,
    });
  });

  it('y 溢出下边界时贴齐下缘', () => {
    expect(clampCropRect({ x: 10, y: 90, width: 20, height: 20 }, bounds)).toEqual({
      x: 10,
      y: 80,
      width: 20,
      height: 20,
    });
  });

  it('裁剪框比范围还宽：居中（两侧均溢出，中心对齐范围中心）', () => {
    const r = clampCropRect({ x: 0, y: 0, width: 120, height: 20 }, bounds);
    expect(r.x).toBe(-10);
    expect(r.width).toBe(120);
    expect(r.x + r.width / 2).toBe(50);
  });

  it('完全在范围外（右下角远处）：夹到最近的可行位置', () => {
    const r = clampCropRect({ x: 200, y: 200, width: 20, height: 20 }, bounds);
    expect(r).toEqual({ x: 80, y: 80, width: 20, height: 20 });
  });

  it('不修改入参', () => {
    const r: Rect = { x: -5, y: 10, width: 20, height: 20 };
    const copy = { ...r };
    clampCropRect(r, bounds);
    expect(r).toEqual(copy);
  });
});

describe('createAspectCrop', () => {
  it('free 返回整块范围', () => {
    expect(createAspectCrop(null, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it('1:1 在横向范围内生成居中正方形', () => {
    const r = createAspectCrop(ASPECT_RATIOS['1:1'], { width: 200, height: 100 });
    expect(r).toEqual({ x: 50, y: 0, width: 100, height: 100 });
  });

  it('16:9 在正方形范围内按宽优先生成居中矩形', () => {
    const r = createAspectCrop(ASPECT_RATIOS['16:9'], { width: 160, height: 160 });
    const h = 160 / (16 / 9);
    expect(r.width).toBe(160);
    expect(close(r.height, h)).toBe(true);
    expect(r.x).toBe(0);
    expect(close(r.y, (160 - h) / 2)).toBe(true);
  });

  it('4:3 在竖长范围内按高优先生成居中矩形', () => {
    const r = createAspectCrop(ASPECT_RATIOS['4:3'], { width: 100, height: 200 });
    expect(r.width).toBe(100);
    expect(close(r.height, 100 / (4 / 3))).toBe(true);
    expect(r.x).toBe(0);
    expect(close(r.y, (200 - r.height) / 2)).toBe(true);
  });
});
