import { describe, expect, it } from 'vitest';
import {
  autoMapColumns,
  buildCourses,
  detectDelimiter,
  expandCourses,
  parseClock,
  parseWeekday,
  parseWeeks,
  splitTable,
} from '@/services/courseImportService';
import { shiftDateKey, weekKeys } from '@/utils/date';

/** 2026-10-15 是周四，取那一周的周一作为「学期第一周周一」 */
const MONDAY = weekKeys('2026-10-15')[0];

describe('splitTable', () => {
  it('从 Excel / 网页表格复制出来的是 Tab 分隔', () => {
    const table = splitTable('课程名\t星期\t开始\n高等数学\t周一\t8:00');
    expect(table).toEqual([
      ['课程名', '星期', '开始'],
      ['高等数学', '周一', '8:00'],
    ]);
  });

  it('CSV 支持双引号包裹含分隔符的字段', () => {
    const table = splitTable('课程名,地点\n"体育, 篮球",操场');
    expect(table[1]).toEqual(['体育, 篮球', '操场']);
  });

  it('处理 CRLF 与 BOM，并丢掉空行', () => {
    const table = splitTable('﻿a,b\r\n\r\n1,2\r\n');
    expect(table).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('按首行出现次数最多的候选来选', () => {
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('a;b;c')).toBe(';');
  });
});

describe('parseWeekday', () => {
  it('认中文与数字的多种写法', () => {
    expect(parseWeekday('周一')).toBe(1);
    expect(parseWeekday('星期一')).toBe(1);
    expect(parseWeekday('1')).toBe(1);
    expect(parseWeekday('五')).toBe(5);
    expect(parseWeekday('Mon')).toBe(1);
    expect(parseWeekday('Friday')).toBe(5);
  });

  it('周日接受 0 与 7', () => {
    expect(parseWeekday('周日')).toBe(7);
    expect(parseWeekday('星期日')).toBe(7);
    expect(parseWeekday('0')).toBe(7);
    expect(parseWeekday('7')).toBe(7);
  });

  it('认不出来返回 null', () => {
    expect(parseWeekday('')).toBeNull();
    expect(parseWeekday('不知道')).toBeNull();
    expect(parseWeekday('9')).toBeNull();
  });
});

describe('parseClock', () => {
  it('常见写法都能解析成分钟数', () => {
    expect(parseClock('8:00')).toBe(480);
    expect(parseClock('08:00')).toBe(480);
    expect(parseClock('8:00:00')).toBe(480);
    expect(parseClock('8点00')).toBe(480);
    expect(parseClock('0800')).toBe(480);
    expect(parseClock('14:30')).toBe(870);
  });

  it('只有小时时按整点', () => {
    expect(parseClock('8')).toBe(480);
  });

  it('非法值返回 null', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('8:70')).toBeNull();
    expect(parseClock('上午')).toBeNull();
  });
});

describe('parseWeeks', () => {
  it('留空等于每周都上', () => {
    expect(parseWeeks('', 16)).toHaveLength(16);
    expect(parseWeeks('-', 4)).toEqual([1, 2, 3, 4]);
  });

  it('支持区间与枚举', () => {
    expect(parseWeeks('1-3', 16)).toEqual([1, 2, 3]);
    expect(parseWeeks('1,3,5', 16)).toEqual([1, 3, 5]);
    expect(parseWeeks('2-4,9', 16)).toEqual([2, 3, 4, 9]);
  });

  it('支持单周 / 双周', () => {
    expect(parseWeeks('单周', 6)).toEqual([1, 3, 5]);
    expect(parseWeeks('双周', 6)).toEqual([2, 4, 6]);
    expect(parseWeeks('1-6(双)', 6)).toEqual([2, 4, 6]);
  });

  it('超出学期总周数的被裁掉', () => {
    expect(parseWeeks('1-20', 4)).toEqual([1, 2, 3, 4]);
  });

  it('一个都解析不出时兜底成每周，避免静默丢课', () => {
    expect(parseWeeks('单周', 0)).toEqual([1]);
    expect(parseWeeks('第99周', 16)).toHaveLength(16);
  });
});

describe('autoMapColumns', () => {
  it('按表头关键字猜列含义', () => {
    const mapping = autoMapColumns(['课程名称', '星期', '开始时间', '结束时间', '上课地点']);
    expect(mapping[0]).toBe('name');
    expect(mapping[1]).toBe('weekday');
    expect(mapping[2]).toBe('start');
    expect(mapping[3]).toBe('end');
    expect(mapping[4]).toBe('location');
  });

  it('「周次」不会被误判成「星期」', () => {
    const mapping = autoMapColumns(['课程名', '周次', '星期', '开始', '结束']);
    expect(mapping[1]).toBe('weeks');
    expect(mapping[2]).toBe('weekday');
  });

  it('表头认不出时按位置兜底', () => {
    const mapping = autoMapColumns(['A', 'B', 'C', 'D']);
    expect(mapping[0]).toBe('name');
    expect(mapping[1]).toBe('weekday');
    expect(mapping[2]).toBe('start');
    expect(mapping[3]).toBe('end');
  });
});

describe('buildCourses', () => {
  it('缺必需列时直接报错，不逐行解析', () => {
    const result = buildCourses([['高数', '周一']], { 0: 'name', 1: 'weekday' }, {
      hasHeader: false,
      totalWeeks: 16,
    });
    expect(result.courses).toHaveLength(0);
    expect(result.issues[0].message).toContain('开始时间');
  });

  it('正常行进 courses，坏行进 issues 且不中断', () => {
    const table = [
      ['课程名', '星期', '开始', '结束', '地点'],
      ['高等数学', '周一', '8:00', '9:40', '教三-301'],
      ['体育', '星期八', '10:00', '11:40', '操场'],
      ['英语', '周三', '早上', '11:40', '教四'],
    ];
    const result = buildCourses(
      table,
      { 0: 'name', 1: 'weekday', 2: 'start', 3: 'end', 4: 'location' },
      { hasHeader: true, totalWeeks: 16 },
    );

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].name).toBe('高等数学');
    expect(result.courses[0].location).toBe('教三-301');
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].line).toBe(3);
    expect(result.issues[1].line).toBe(4);
  });

  it('结束时间不晚于开始时间会被拦下', () => {
    const result = buildCourses(
      [['高数', '周一', '10:00', '8:00']],
      { 0: 'name', 1: 'weekday', 2: 'start', 3: 'end' },
      { hasHeader: false, totalWeeks: 16 },
    );
    expect(result.courses).toHaveLength(0);
    expect(result.issues[0].message).toContain('结束时间');
  });
});

describe('expandCourses', () => {
  it('按周次铺成具体日期，标题带地点', () => {
    const drafts = expandCourses(
      [
        {
          name: '高等数学',
          weekday: 1,
          startMin: 480,
          endMin: 580,
          location: '教三-301',
          teacher: '',
          weeks: [1, 2],
        },
      ],
      { mondayKey: MONDAY, sectionId: 'study' },
    );

    expect(drafts).toHaveLength(2);
    expect(drafts[0].date).toBe(MONDAY);
    // 第 2 周的周一 = 第一周周一 + 7 天
    expect(drafts[1].date).toBe(shiftDateKey(MONDAY, 7));
    expect(drafts[0].content).toBe('高等数学 @ 教三-301');
    expect(drafts[0].sectionId).toBe('study');
  });

  it('星期几决定在一周内的第几天', () => {
    const drafts = expandCourses(
      [
        {
          name: '英语',
          weekday: 3,
          startMin: 600,
          endMin: 680,
          location: '',
          teacher: '',
          weeks: [1],
        },
      ],
      { mondayKey: MONDAY, sectionId: null },
    );
    // 周三 = 周一 + 2 天
    expect(drafts[0].date).toBe(shiftDateKey(MONDAY, 2));
    expect(drafts[0].content).toBe('英语');
  });

  it('结果按日期与时间排序', () => {
    const drafts = expandCourses(
      [
        {
          name: '晚课',
          weekday: 5,
          startMin: 1140,
          endMin: 1200,
          location: '',
          teacher: '',
          weeks: [1],
        },
        {
          name: '早课',
          weekday: 1,
          startMin: 480,
          endMin: 540,
          location: '',
          teacher: '',
          weeks: [1],
        },
      ],
      { mondayKey: MONDAY, sectionId: null },
    );
    expect(drafts.map((draft) => draft.content)).toEqual(['早课', '晚课']);
  });
});
