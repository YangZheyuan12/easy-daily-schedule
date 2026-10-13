/**
 * 严格验收：逐个测试文件 spawn vitest，防止「静默丢文件」。
 *
 * 为什么要单独做这个脚本：在某些受限执行环境（沙箱 / 只读临时目录）里，
 * Vite 的 SSR 依赖优化缓存需要写 %TEMP% 会被拦截（EPERM），结果是
 * 一次性 `vitest run` 会**静默丢掉某一个测试文件** —— 更糟的是此时
 * vitest 的退出码仍然是 0、控制台整体依旧显绿，验收的人会以为全跑到了。
 *
 * 所以这里改成「一个文件 spawn 一次」，逐个核对：
 * - 这个文件到底有没有被收集执行（Test Files 必须正好是 1）
 * - 用例数是不是 0（收集到了文件却一个用例都没跑，同样是异常）
 * - 退出码是不是 0
 * 任何一条不满足就 exit 1，并明确打印是哪个文件出了问题。
 *
 * 刻意**不**去硬校验「总用例数必须等于某个常量」：每加一个用例就要改一次
 * 常量，反而制造维护负担。这里要拦的是「某个文件根本没跑」这件事。
 *
 * 实现细节：
 * - 直接 spawn `node node_modules/vitest/vitest.mjs`，**不走 shell**。
 *   既避开 Windows 下 cmd.exe 的路径引号坑，也不需要命令注入防护。
 * - 串行执行：并发跑会同时抢写 Vite 的依赖缓存，反而更容易触发 EPERM。
 *
 * 用法：npm run test:strict
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const VITEST_BIN = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
/** 单个文件的超时上限（ms）。正常情况下一个文件 5 秒内就跑完了 */
const FILE_TIMEOUT_MS = 120_000;

/**
 * 遍历 src/ 收集所有 `*.test.ts`（新增的测试文件会被自动纳入，不需要改配置）。
 *
 * ⚠️ 这里的扩展名必须与 `vite.config.ts` 的 `test.include` **保持一致**。
 * 将来若新增 `.test.tsx`（组件渲染测试）而只改了一处，会出现
 * 「`vitest run` 不跑它、本脚本也不收它」的双漏 —— 两边都留了互相点名的注释。
 */
function collectTestFiles(dir) {
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
      out.push(...collectTestFiles(full));
    } else if (/\.test\.ts$/.test(full)) {
      out.push(full);
    }
  }
  return out.sort();
}

/** vitest 在非 TTY 下也可能输出少量控制字符，统一剥掉再解析 */
function stripAnsi(text) {
  return text.replace(/\[[0-9;]*m/g, '');
}

/**
 * 取 vitest 末尾的 summary 行，形如：
 *   Test Files  1 failed (1)
 *   Tests  15 passed (15)
 *
 * ⚠️ 必须锚定行首、**取最后一次匹配**：失败详情区顶部有一行
 * `⎯⎯⎯ Failed Tests 1 ⎯⎯⎯`，宽松的 `/Tests\s+/` 会先命中它，
 * 拿到的内容形如 "1 ⎯⎯⎯⎯⎯"，于是 passed/failed/total 全被算成 0，
 * 真正的失败会被误报成「收集到 0 个用例 / 多半是环境 EPERM」——
 * 与本脚本「给出可执行诊断」的初衷正好相反。
 */
function lastSummaryLine(text, label) {
  const matches = [...text.matchAll(new RegExp(`^\\s*${label}\\s+(.+)$`, 'gm'))];
  return matches.length > 0 ? matches[matches.length - 1][1] : '';
}

function parseOutput(raw) {
  const text = stripAnsi(raw ?? '');
  const filesLine = lastSummaryLine(text, 'Test Files');
  const testsLine = lastSummaryLine(text, 'Tests');
  const num = (line, unit) => {
    if (!line) return 0;
    const match = new RegExp(`(\\d+)\\s+${unit}`).exec(line);
    return match ? Number(match[1]) : 0;
  };
  return {
    filesPassed: num(filesLine, 'passed'),
    filesFailed: num(filesLine, 'failed'),
    filesSkipped: num(filesLine, 'skipped'),
    testsPassed: num(testsLine, 'passed'),
    testsFailed: num(testsLine, 'failed'),
    testsSkipped: num(testsLine, 'skipped'),
    total: Number(/\((\d+)\)/.exec(testsLine)?.[1] ?? '0'),
  };
}

/** 跑单个测试文件，返回退出码与解析结果 */
function runOne(rel) {
  return new Promise((resolve) => {
    const useBin = existsSync(VITEST_BIN);
    const command = useBin ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = useBin ? [VITEST_BIN, 'run', rel] : ['vitest', 'run', rel];

    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      buffer += String(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, FILE_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ rel, ...parseOutput(''), exitCode: 1, spawnError: error.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ rel, ...parseOutput(buffer), exitCode: timedOut ? 1 : (code ?? 1), timedOut });
    });
  });
}

/** 判定一个文件是否「没正常执行」——本脚本真正要抓的就是这个 */
function evaluate(result) {
  // skipped 也算被收集：否则 `describe.skip` 的文件会被误判成环境丢文件
  const collected = result.filesPassed + result.filesFailed + result.filesSkipped === 1;
  // 整文件跳过时 vitest 退出码仍是 0，必须单独按“未真正验证”处理
  const allSkipped = collected && result.filesSkipped === 1;
  const failed =
    result.exitCode !== 0 ||
    !collected ||
    allSkipped ||
    result.testsFailed > 0 ||
    result.total === 0 ||
    Boolean(result.spawnError);
  return { collected, failed };
}

function reasonOf(result, collected) {
  if (result.spawnError) return `无法启动 vitest（${result.spawnError}）`;
  if (result.timedOut) return '执行超时，已强制终止';
  if (!collected) {
    return '该文件未被 vitest 收集（多半是环境 EPERM 导致的静默丢文件，请重跑本脚本）';
  }
  if (result.testsFailed > 0) return `有 ${result.testsFailed} 个用例失败`;
  if (result.filesSkipped > 0) {
    return `该文件的用例全部被跳过（describe.skip / it.skip），无法确认对错，请检查是否有意为之`;
  }
  if (result.total === 0) return '收集到 0 个用例，文件可能没被真正执行';
  return `vitest 退出码 ${result.exitCode}`;
}

const files = collectTestFiles(SRC);

if (files.length === 0) {
  console.error('✗ 未在 src/ 下找到任何 *.test.ts 文件。');
  process.exit(1);
}

console.log(`严格验收：逐个文件执行 vitest（共 ${files.length} 个测试文件）\n`);

const rows = [];
for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const result = await runOne(rel);
  const { collected, failed } = evaluate(result);
  const row = { ...result, collected, failed };
  rows.push(row);

  const mark = failed ? '✗' : '✓';
  const detail = failed
    ? reasonOf(result, collected)
    : `${result.testsPassed} 个用例`;
  console.log(`  ${mark} ${rel.padEnd(48)} ${detail}`);
}

const totalTests = rows.reduce((sum, r) => sum + r.total, 0);
const broken = rows.filter((r) => r.failed);

console.log(`\n${'─'.repeat(72)}`);
console.log('文件'.padEnd(50) + '用例数   结果');
console.log('─'.repeat(72));
for (const row of rows) {
  console.log(row.rel.padEnd(50) + String(row.total).padEnd(9) + (row.failed ? '✗ 失败/未收集' : '✓ 通过'));
}
console.log('─'.repeat(72));
console.log(`用例总数：${totalTests}（${rows.length} 个文件，失败 ${broken.length} 个）`);

if (broken.length > 0) {
  console.error('\n✗ 严格验收未通过，以下测试文件未正常执行：');
  for (const row of broken) {
    console.error(`  - ${row.rel}：${reasonOf(row, row.collected)}`);
  }
  console.error('\n提示：本脚本一次只跑一个文件，可规避一次性 vitest run 的静默丢文件问题。');
  process.exit(1);
}

console.log('\n✓ 严格验收通过：所有测试文件均已单独执行且无遗漏。');
