import type { SectionKey } from '@/domain/enums';
import type { TimeSlotDraft } from '@/domain/types';
import { shiftDateKey } from '@/utils/date';

/**
 * 课表导入的**纯逻辑**：表格文本 → 课程行 → 展开成具体日期的时间段。
 *
 * 这一层刻意不碰任何浏览器 API（读文件与字符解码在 `src/platform/`），
 * 迁微信小程序时可直接复用。
 *
 * 关于「教务系统导入」为什么是**粘贴**而不是爬虫：
 * 各校教务系统没有统一 API、有统一身份认证和验证码，且 WebView 里直接
 * fetch 会被 CORS 拦（原生 HTTP 插件能绕 CORS，但绕不过验证码与合规风险——
 * 保存学号密码属于个人信息处理）。而「用户自己在浏览器里登录 → 选中课表 →
 * 复制 → 粘贴进来」绕开了全部这些问题，且从 Excel / 网页表格复制出来的
 * 就是 Tab 分隔，解析路径与 CSV 完全一致。
 */

/** 一列可以被解释成的含义 */
export type CourseField =
  | 'ignore'
  | 'name'
  | 'weekday'
  | 'start'
  | 'end'
  | 'location'
  | 'teacher'
  | 'weeks';

export interface CourseFieldMeta {
  key: CourseField;
  label: string;
  /** 缺了这一列就无法导入 */
  required: boolean;
}

export const COURSE_FIELDS: readonly CourseFieldMeta[] = [
  { key: 'ignore', label: '不使用', required: false },
  { key: 'name', label: '课程名', required: true },
  { key: 'weekday', label: '星期', required: true },
  { key: 'start', label: '开始时间', required: true },
  { key: 'end', label: '结束时间', required: true },
  { key: 'location', label: '上课地点', required: false },
  { key: 'teacher', label: '教师', required: false },
  { key: 'weeks', label: '周次', required: false },
];

/** 列序号 → 含义。未出现的列按「不使用」处理 */
export type ColumnMapping = Record<number, CourseField>;

/** 解析出来的一门课（还没展开成具体日期） */
export interface CourseRow {
  name: string;
  /** 1=周一 … 7=周日 */
  weekday: number;
  startMin: number;
  endMin: number;
  location: string;
  teacher: string;
  /** 上课的周序号（1-based，已按学期总周数裁剪）；空数组视为「每周都上」 */
  weeks: number[];
}

export interface CourseParseIssue {
  /** 表格里第几行（1-based，含表头行，方便用户对号入座） */
  line: number;
  message: string;
}

export interface CourseParseResult {
  courses: CourseRow[];
  issues: CourseParseIssue[];
}

/** 候选分隔符，按优先级排列（从 Excel / 网页表格复制出来是 Tab） */
const DELIMITERS = ['\t', ',', ';', '|'] as const;

/** 表头关键字：命中即认为该列是这个含义。顺序很重要，长的优先 */
const HEADER_KEYWORDS: { field: CourseField; words: string[] }[] = [
  { field: 'weeks', words: ['周次', '上课周', '起止周', 'week'] },
  { field: 'weekday', words: ['星期', '礼拜', '星期几', 'weekday', 'day'] },
  { field: 'start', words: ['开始', '起始', '上课时间', 'start', 'begin', 'from'] },
  { field: 'end', words: ['结束', '下课', 'end', 'finish', 'to'] },
  { field: 'name', words: ['课程', '课名', '科目', '名称', 'course', 'subject', 'title', 'name'] },
  { field: 'location', words: ['地点', '教室', '位置', 'location', 'room', 'place'] },
  { field: 'teacher', words: ['教师', '老师', '任课', 'teacher', 'instructor'] },
];

/** 拆分一行，支持双引号包裹（引号内的分隔符不拆） */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        // 两个连续引号 = 转义成一个字面引号
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
    i += 1;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** 猜分隔符：在首行里哪个候选出现得最多就用哪个 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  let best: string = DELIMITERS[0];
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    for (const ch of firstLine) if (ch === delimiter) count += 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 把表格文本切成二维数组。已处理：BOM、CRLF、空行、引号包裹。
 */
export function splitTable(text: string): string[][] {
  // 去掉 UTF-8 BOM（Excel 导出的 CSV 常带），统一换行符
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const clean = normalized.replace(/\r\n?/g, '\n');
  const delimiter = detectDelimiter(clean);
  return clean
    .split('\n')
    .map((line) => splitLine(line, delimiter))
    .filter((cells) => cells.some((cell) => cell.length > 0));
}

const WEEKDAY_WORDS: { word: string; value: number }[] = [
  { word: '一', value: 1 },
  { word: '二', value: 2 },
  { word: '三', value: 3 },
  { word: '四', value: 4 },
  { word: '五', value: 5 },
  { word: '六', value: 6 },
  { word: '日', value: 7 },
  { word: '天', value: 7 },
  { word: 'mon', value: 1 },
  { word: 'tue', value: 2 },
  { word: 'wed', value: 3 },
  { word: 'thu', value: 4 },
  { word: 'fri', value: 5 },
  { word: 'sat', value: 6 },
  { word: 'sun', value: 7 },
];

/**
 * 解析星期，返回 1（周一）… 7（周日），认不出来返 null。
 * 覆盖：周一 / 星期一 / 一 / 1 / Mon / Monday；周日也接受 0 与 7。
 */
export function parseWeekday(raw: string): number | null {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return null;

  // 纯数字：0 与 7 都算周日
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    if (n === 0) return 7;
    if (n >= 1 && n <= 7) return n;
    return null;
  }

  // 去掉「周 / 星期 / 礼拜」这些前缀后再按关键字匹配
  const stripped = value.replace(/^(week|weekday|星期|礼拜|周)/, '');
  for (const { word, value: n } of WEEKDAY_WORDS) {
    if (stripped === word || stripped.startsWith(word)) return n;
  }
  return null;
}

/**
 * 解析时刻 → 距 00:00 的分钟数。
 * 覆盖 8:00 / 08:00 / 8:00:00 / 8点00 / 0800 / 8。
 */
export function parseClock(raw: string): number | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  const withSeparator = value.match(/(\d{1,2})\s*[:：点时\s]\s*(\d{1,2})/);
  if (withSeparator) {
    const hour = Number(withSeparator[1]);
    const minute = Number(withSeparator[2]);
    if (hour <= 23 && minute <= 59) return hour * 60 + minute;
    return null;
  }

  // 紧凑写法：0830
  const compact = value.match(/^(\d{2})(\d{2})$/);
  if (compact) {
    const hour = Number(compact[1]);
    const minute = Number(compact[2]);
    if (hour <= 23 && minute <= 59) return hour * 60 + minute;
    return null;
  }

  // 只有小时：8 → 08:00
  if (/^\d{1,2}$/.test(value)) {
    const hour = Number(value);
    if (hour <= 23) return hour * 60;
  }
  return null;
}

function allWeeks(totalWeeks: number): number[] {
  return Array.from({ length: Math.max(1, totalWeeks) }, (_, i) => i + 1);
}

/**
 * 解析周次表达式 → 周序号数组（1-based，已按总周数裁剪）。
 *
 * 支持：留空（=每周）/ `1-16` / `1,3,5` / `1-16(单)` / `单周` / `双周`。
 * 解析结果为空时兜底成「每周都上」——宁可多导入让用户在时间轴上删，
 * 也不要静默丢掉一门课。
 */
export function parseWeeks(raw: string, totalWeeks: number): number[] {
  const value = raw.trim();
  const total = Math.max(1, totalWeeks);
  if (value.length === 0 || value === '-' || value === '全部') return allWeeks(total);

  const oddOnly = /单/.test(value) && !/双/.test(value);
  const evenOnly = /双/.test(value);

  const weeks = new Set<number>();
  const pattern = /(\d+)\s*(?:[-~至]\s*(\d+))?/g;
  let match = pattern.exec(value);
  let sawDigit = false;
  while (match !== null) {
    sawDigit = true;
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let w = lo; w <= hi; w += 1) {
      if (w < 1 || w > total) continue;
      if (oddOnly && w % 2 === 0) continue;
      if (evenOnly && w % 2 === 1) continue;
      weeks.add(w);
    }
    match = pattern.exec(value);
  }

  // 「单周 / 双周」没写区间时，语义是「整个学期的单/双周」，不是「每周」
  if (!sawDigit && (oddOnly || evenOnly)) {
    return allWeeks(total).filter((week) => (oddOnly ? week % 2 === 1 : week % 2 === 0));
  }

  // 一个都解析不出时兜底成每周，避免静默丢掉一门课
  if (weeks.size === 0) return allWeeks(total);
  return [...weeks].sort((a, b) => a - b);
}

/**
 * 依据表头文字猜列含义。只做「最佳猜测」，用户在界面上可以改。
 * 猜不出必需列时，按位置兜底：第 1 列课程名、第 2 列星期、第 3 列开始、第 4 列结束。
 */
export function autoMapColumns(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const taken = new Set<CourseField>();

  header.forEach((cell, index) => {
    const label = cell.trim().toLowerCase();
    if (label.length === 0) return;
    for (const { field, words } of HEADER_KEYWORDS) {
      if (taken.has(field)) continue;
      if (words.some((word) => label.includes(word))) {
        mapping[index] = field;
        taken.add(field);
        return;
      }
    }
  });

  // 必需列兜底
  const fallback: { field: CourseField; index: number }[] = [
    { field: 'name', index: 0 },
    { field: 'weekday', index: 1 },
    { field: 'start', index: 2 },
    { field: 'end', index: 3 },
  ];
  for (const { field, index } of fallback) {
    if (taken.has(field)) continue;
    if (index < header.length) {
      mapping[index] = field;
      taken.add(field);
    }
  }

  return mapping;
}

export interface BuildCoursesOptions {
  /** 第一行是不是表头（是就跳过不参与解析） */
  hasHeader: boolean;
  /** 学期总周数，用于裁剪周次 */
  totalWeeks: number;
}

/** 按列映射把表格转成课程行，认不出的行进 issues 而不是静默丢弃 */
export function buildCourses(
  table: string[][],
  mapping: ColumnMapping,
  options: BuildCoursesOptions,
): CourseParseResult {
  const courses: CourseRow[] = [];
  const issues: CourseParseIssue[] = [];

  const required: CourseField[] = ['name', 'weekday', 'start', 'end'];
  const missing = required.filter((field) => !Object.values(mapping).includes(field));
  if (missing.length > 0) {
    const labels = missing
      .map((field) => COURSE_FIELDS.find((meta) => meta.key === field)?.label ?? field)
      .join('、');
    return { courses, issues: [{ line: 0, message: `还没有指定这些列：${labels}` }] };
  }

  const body = options.hasHeader ? table.slice(1) : table;
  const offset = options.hasHeader ? 1 : 0;

  body.forEach((cells, rowIndex) => {
    const line = rowIndex + offset + 1;
    const pick = (field: CourseField): string => {
      const index = Object.keys(mapping).find((key) => mapping[Number(key)] === field);
      return index === undefined ? '' : (cells[Number(index)] ?? '');
    };

    const name = pick('name').trim();
    if (name.length === 0) {
      issues.push({ line, message: '课程名为空，已跳过' });
      return;
    }

    const weekday = parseWeekday(pick('weekday'));
    if (weekday === null) {
      issues.push({ line, message: `「${name}」的星期认不出来（${pick('weekday') || '空'}），已跳过` });
      return;
    }

    const startMin = parseClock(pick('start'));
    if (startMin === null) {
      issues.push({ line, message: `「${name}」的开始时间认不出来（${pick('start') || '空'}），已跳过` });
      return;
    }

    const endMin = parseClock(pick('end'));
    if (endMin === null) {
      issues.push({ line, message: `「${name}」的结束时间认不出来（${pick('end') || '空'}），已跳过` });
      return;
    }

    if (endMin <= startMin) {
      issues.push({ line, message: `「${name}」的结束时间不晚于开始时间，已跳过` });
      return;
    }

    courses.push({
      name,
      weekday,
      startMin,
      endMin,
      location: pick('location').trim(),
      teacher: pick('teacher').trim(),
      weeks: parseWeeks(pick('weeks'), options.totalWeeks),
    });
  });

  return { courses, issues };
}

export interface ExpandOptions {
  /** 学期**第一周周一**的日期键（YYYY-MM-DD） */
  mondayKey: string;
  /** 归到哪个板块；null = 不归类 */
  sectionId: SectionKey | null;
}

/** 课程标题：课程名 + 地点（教室比教师更常被看，教师不进标题） */
export function buildCourseTitle(course: CourseRow): string {
  return course.location.length > 0 ? `${course.name} @ ${course.location}` : course.name;
}

/**
 * 把「每周重复」的课铺成具体日期的时间段草稿。
 *
 * 这是**展开式**：第 w 周星期 d 的课 → `mondayKey + (w-1)*7 + (d-1)` 天。
 * 好处是完全复用现有的 TimeSlot 模型，周视图 / 时长统计 / 日历色点立刻可用，
 * 也不用改数据库结构。代价是改课表要重新导入 —— 由 `seriesId` 整批覆盖来弥补。
 */
export function expandCourses(courses: CourseRow[], options: ExpandOptions): TimeSlotDraft[] {
  const drafts: TimeSlotDraft[] = [];
  for (const course of courses) {
    const weeks = course.weeks.length > 0 ? course.weeks : [1];
    for (const week of weeks) {
      const date = shiftDateKey(options.mondayKey, (week - 1) * 7 + (course.weekday - 1));
      drafts.push({
        date,
        startMin: course.startMin,
        endMin: course.endMin,
        content: buildCourseTitle(course),
        sectionId: options.sectionId,
      });
    }
  }
  return drafts.sort(
    (a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin || a.endMin - b.endMin,
  );
}
