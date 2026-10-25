import { describe, expect, it } from 'vitest';
import { detectIdentifier, isValidIdentifier, maskIdentifier } from '@/services/authIdentifier';

describe('authIdentifier', () => {
  it('detectIdentifier：识别手机号 / 邮箱，其余为 null', () => {
    expect(detectIdentifier('13812345678')).toBe('phone');
    expect(detectIdentifier('19912345678')).toBe('phone');
    expect(detectIdentifier('name@qq.com')).toBe('email');
    expect(detectIdentifier('a.b+c@sub.example.co')).toBe('email');
    expect(detectIdentifier('12345')).toBeNull();
    expect(detectIdentifier('138123456789')).toBeNull();
    expect(detectIdentifier('abc@')).toBeNull();
    expect(detectIdentifier('@qq.com')).toBeNull();
    expect(detectIdentifier('')).toBeNull();
  });

  it('detectIdentifier：容忍首尾空白', () => {
    expect(detectIdentifier('  13812345678 ')).toBe('phone');
    expect(detectIdentifier(' name@qq.com ')).toBe('email');
  });

  it('isValidIdentifier：与 detect 同口径', () => {
    expect(isValidIdentifier('13812345678')).toBe(true);
    expect(isValidIdentifier('nope')).toBe(false);
  });

  it('maskIdentifier：手机号打码中间四位，邮箱保留首字母与域名', () => {
    expect(maskIdentifier('13812345678')).toBe('138****5678');
    expect(maskIdentifier('name@qq.com')).toBe('n***@qq.com');
    expect(maskIdentifier('ab@qq.com')).toBe('a*@qq.com');
  });
});
