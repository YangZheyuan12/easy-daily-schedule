import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 日期控件的「看得见」回归防线（2026-10-17 第十轮）。
 *
 * 症状：期限任务的日期选择渲染成**一条空白**。根因在全局样式 ——
 * `input, textarea, button { appearance: none }` 把所有原生控件的外观都抹掉了，
 * 而 `<input type="date">` 的日期字段与日历图标住在 UA shadow DOM 里，
 * 依赖原生 appearance 绘制；被抹掉之后只剩我们给的那圈边框，中间是空的。
 *
 * 这条防线盯的是「以后有人图省事把 date/time 也并回统一规则里」——
 * 那种改动不会报错，只会让某个遥远的抽屉里又出现一条空白。
 */
const css = readFileSync(new URL('../../../src/styles/index.css', import.meta.url), 'utf8');

describe('日期 / 时间类原生控件必须保留 UA 外观', () => {
  it('全局有「表单控件去外观」的统一规则（这就是空白的来源）', () => {
    expect(css).toMatch(/input,\s*\n\s*textarea,\s*\n\s*button\s*\{[^}]*appearance-none/s);
  });

  it('并为 date / time 等类型显式加回来了', () => {
    for (const type of ['date', 'time', 'datetime-local']) {
      const block = new RegExp(
        // 找到包含该选择器的规则块，块内必须出现 appearance: auto
        `input\\[type='${type}'\\][^{]*\\{[^}]*appearance:\\s*auto`,
        's',
      );
      expect(css, `缺少 input[type='${type}'] 的 appearance 例外`).toMatch(block);
    }
  });

  it('日历指示图标有可见度与点击余量的补偿样式', () => {
    expect(css).toContain('::-webkit-calendar-picker-indicator');
  });
});
