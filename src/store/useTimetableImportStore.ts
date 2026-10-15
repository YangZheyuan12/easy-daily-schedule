import { create } from 'zustand';
import type { SectionKey } from '@/domain/enums';
import type { TimeSlot } from '@/domain/types';
import { ORDER_STEP } from '@/domain/constants';
import { clock, repos } from './bootstrap';
import { newId } from '@/services/idService';
import {
  autoMapColumns,
  buildCourses,
  expandCourses,
  splitTable,
  type ColumnMapping,
  type CourseField,
  type CourseParseResult,
} from '@/services/courseImportService';
import { toDateKey, weekKeys } from '@/utils/date';
import { useTimeSlotStore } from './useTimeSlotStore';
import { useDayStore } from './useDayStore';

export interface TimetableCommitResult {
  /** 新写入多少条时间段 */
  count: number;
  /** 覆盖掉了多少条旧课表记录 */
  removed: number;
  seriesId: string;
}

interface TimetableImportState {
  /** 原始表格文本（粘贴或文件解码后） */
  text: string;
  table: string[][];
  mapping: ColumnMapping;
  /** 第一行是不是表头 */
  hasHeader: boolean;

  /** 学期第一周周一的日期键 */
  mondayKey: string;
  totalWeeks: number;
  sectionId: SectionKey | null;
  /** 导入前是否先清掉上一批课表 */
  clearPrevious: boolean;

  result: CourseParseResult | null;
  /** 按当前设置会生成多少条时间段 */
  draftCount: number;
  busy: boolean;

  loadText: (text: string) => void;
  setMapping: (index: number, field: CourseField) => void;
  setHasHeader: (value: boolean) => void;
  patchOptions: (patch: Partial<Pick<TimetableImportState, 'mondayKey' | 'totalWeeks' | 'sectionId' | 'clearPrevious'>>) => void;
  reset: () => void;
  commit: () => Promise<TimetableCommitResult | null>;
}

/** 默认学期第一周周一 = 本周周一 */
function defaultMondayKey(): string {
  return weekKeys(toDateKey(new Date()))[0];
}

export const useTimetableImportStore = create<TimetableImportState>((set, get) => {
  /** 文本 / 映射 / 选项任一变化后重算解析结果与预览条数 */
  const recompute = () => {
    const { table, mapping, hasHeader, totalWeeks, mondayKey, sectionId } = get();
    if (table.length === 0) {
      set({ result: null, draftCount: 0 });
      return;
    }
    const result = buildCourses(table, mapping, { hasHeader, totalWeeks });
    const draftCount = expandCourses(result.courses, { mondayKey, sectionId }).length;
    set({ result, draftCount });
  };

  return {
    text: '',
    table: [],
    mapping: {},
    hasHeader: true,
    mondayKey: defaultMondayKey(),
    totalWeeks: 16,
    sectionId: 'study',
    clearPrevious: true,

    result: null,
    draftCount: 0,
    busy: false,

    loadText(text) {
      const table = splitTable(text);
      // 不管有没有表头都拿第一行去猜：表头命中关键字最好，
      // 命中不了（比如无表头的纯数据）会走「第1列课程名、第2列星期…」的位置兜底
      const mapping = autoMapColumns(table[0] ?? []);
      set({ text, table, mapping });
      recompute();
    },

    setMapping(index, field) {
      const mapping = { ...get().mapping, [index]: field };
      set({ mapping });
      recompute();
    },

    setHasHeader(value) {
      set({ hasHeader: value });
      recompute();
    },

    patchOptions(patch) {
      set(patch);
      recompute();
    },

    reset() {
      set({
        text: '',
        table: [],
        mapping: {},
        result: null,
        draftCount: 0,
        busy: false,
      });
    },

    async commit() {
      const { result, mondayKey, sectionId, clearPrevious } = get();
      if (!result || result.courses.length === 0) return null;

      const drafts = expandCourses(result.courses, { mondayKey, sectionId });
      if (drafts.length === 0) return null;

      set({ busy: true });
      try {
        const now = clock.now();
        let removed = 0;

        // 覆盖旧的课表批次：软删而不是物理删，保持与其它实体一致的撤销语义
        if (clearPrevious) {
          const all = await repos.timeSlots.listAll();
          const stale = all.filter((slot) => slot.seriesId && slot.deletedAt === null);
          if (stale.length > 0) {
            await repos.timeSlots.upsertMany(
              stale.map((slot) => ({ ...slot, deletedAt: now, updatedAt: now })),
            );
            removed = stale.length;
          }
        }

        const seriesId = newId('cs');
        // order 按「同一天内」递增即可：sortSlots 先按 startMin 排，order 只做同级兜底
        let lastDate = '';
        let cursor = 0;
        const slots: TimeSlot[] = drafts.map((draft) => {
          if (draft.date !== lastDate) {
            lastDate = draft.date;
            cursor = 0;
          }
          cursor += 1;
          return {
            id: newId('ts'),
            date: draft.date,
            startMin: draft.startMin,
            endMin: draft.endMin,
            actualStartMin: null,
            actualEndMin: null,
            content: draft.content,
            sectionId: draft.sectionId,
            done: false,
            order: cursor * ORDER_STEP,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            seriesId,
          };
        });

        await repos.timeSlots.upsertMany(slots);

        // 让当天视图立刻读到新数据（周视图会在重新进入页面时按区间重拉）
        await useTimeSlotStore.getState().loadDate(useDayStore.getState().date || mondayKey);

        return { count: slots.length, removed, seriesId };
      } catch {
        return null;
      } finally {
        set({ busy: false });
      }
    },
  };
});
