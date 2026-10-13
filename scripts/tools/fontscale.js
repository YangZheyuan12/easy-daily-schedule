/**
 * 字号刻度 codemod：把散落各处的 `text-[Npx]` 机械替换成语义类名。
 *
 * 映射表刻意「多对一」（16 与 17 都归 heading），因为它们在产品里
 * 本来就是同一个角色（弹窗标题 / 抽屉标题），只是历史遗留差异。
 */
const fs = require('fs');
const path = require('path');

const MAP = {
  10: 'label',
  11: 'micro',
  12: 'caption',
  13: 'meta',
  14: 'body',
  15: 'lead',
  16: 'heading',
  17: 'heading',
  22: 'title',
  30: 'display',
};

const ROOT = path.resolve(__dirname, '../../src');
const files = [];

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) files.push(full);
  }
})(ROOT);

let touched = 0;
let replaced = 0;
const unknown = new Map();

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/text-\[(\d+)px\]/g, (whole, px) => {
    const role = MAP[px];
    if (!role) {
      unknown.set(px, (unknown.get(px) || 0) + 1);
      return whole;
    }
    replaced += 1;
    return `text-${role}`;
  });
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    touched += 1;
  }
}

console.log(`替换 ${replaced} 处，涉及 ${touched} 个文件`);
if (unknown.size > 0) {
  console.log('⚠️ 未映射的字号（需补进 MAP 或手工处理）：');
  for (const [px, n] of [...unknown].sort((a, b) => a[0] - b[0])) console.log(`  ${px}px × ${n}`);
}
