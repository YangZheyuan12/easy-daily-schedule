/**
 * 分层红线检查。
 *
 * 架构约定（ARCHITECTURE.md §3）：
 * - `src/domain/`、`src/services/` **禁止**出现任何浏览器 API，
 *   这是迁移微信小程序时业务内核能 100% 复用的前提。
 * - `src/repositories/` 是唯一允许触碰存储 API 的目录。
 * - UI 层禁止直接 import repositories（必须走 store/services）。
 *
 * 用 node 脚本代替 ESLint 规则，零额外依赖，可在 CI 与构建前执行。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const BROWSER_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator',
  'visualViewport',
  'alert(',
  'confirm(',
];

const RULES = [
  {
    dir: 'src/domain',
    banned: BROWSER_GLOBALS,
    reason: 'domain 层必须零浏览器 API 依赖',
  },
  {
    dir: 'src/services',
    banned: BROWSER_GLOBALS,
    reason: 'services 层必须零浏览器 API 依赖（迁移小程序需 100% 复用）',
  },
  {
    dir: 'src/pages',
    banned: ["from '@/repositories", 'from "../../repositories'],
    reason: 'UI 层禁止直接依赖 repositories，请通过 store / services 访问',
  },
  {
    dir: 'src/components',
    banned: ["from '@/repositories"],
    reason: 'UI 层禁止直接依赖 repositories，请通过 store / services 访问',
  },
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

let violations = 0;

for (const rule of RULES) {
  const absDir = join(ROOT, rule.dir);
  const files = walk(absDir);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      // 跳过注释行与字符串内的说明性文字
      const trimmed = line.trim();
      // 跳过所有注释行：块注释 /* */、JSDoc * 行、行注释 //
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
      for (const banned of rule.banned) {
        if (line.includes(banned)) {
          violations += 1;
          console.error(
            `✗ [${rule.reason}]\n  ${relative(ROOT, file)}:${index + 1}\n  ${trimmed}\n  命中禁用项: ${banned}`,
          );
        }
      }
    });
  }
}

if (violations > 0) {
  console.error(`\n分层红线检查失败：发现 ${violations} 处违规。`);
  process.exit(1);
}

console.log('✓ 分层红线检查通过：domain / services 无浏览器 API，UI 未直连 repositories。');
console.log(`  已扫描 ${walk(SRC).length} 个源文件。`);
