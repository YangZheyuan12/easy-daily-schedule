import type { Rating, SectionKey } from './enums';


/**
 * 核心领域实体。
 *
 * 设计约定（与 ARCHITECTURE.md §5.1 一致）：
 * - 树用**邻接表**表达：`parentId` 指向父条目，`parentId === null` 为顶层条目。
 *   不使用嵌套 JSON / 物化路径，因为改层级只需写单条记录，契合 IndexedDB 的 KV 特性。
 * - `level` 是冗余字段（0 = 顶层），仅用于渲染缩进与「深度上限」提示，
 *   任何时候都以 `parentId` 推导结果为准，二者冲突时以 parentId 为准。
 * - `deletedAt` 为软删标记。**软删只允许改这个字段，其余字段一律不动**，
 *   这是「撤销」能完整恢复层级 / 顺序 / 折叠态的根本前提。
 * - 描述、评分、评价**内联**在 Item 上，不单独建表（避免每次开抽屉都做一次 join）。
 */

/** 板块下的树形条目。 */
export interface Item {
  id: string;
  /** 所属日期键，格式 YYYY-MM-DD（本地时区） */
  date: string;
  sectionId: SectionKey;
  /** 父条目 id，null 表示顶层 */
  parentId: string | null;
  title: string;
  /** 层级深度，0 = 顶层 */
  level: number;
  /** 同层排序值，步长 1000，支持中点插入 */
  order: number;
  done: boolean;
  collapsed: boolean;
  /** 任务描述（长文本） */
  description: string;
  /** 个人评价星级 0–5 */
  rating: Rating;
  /** 个人评价文字 */
  review: string;
  createdAt: number;
  updatedAt: number;
  /** 软删时间戳；null 表示未删除 */
  deletedAt: number | null;
}

/** 每日任务（独立于四大板块） */
export interface Task {
  id: string;
  date: string;
  content: string;
  done: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** 「继承昨日」时记录的来源任务 id，用于幂等去重 */
  inheritedFrom: string | null;
}

/** 一天（惰性创建，仅在首次访问时落库） */
export interface Day {
  date: string;
  createdAt: number;
}

/** 当日自我状态（心情 + 身体） */
export interface DailySelfStatus {
  /** 主键即日期键 */
  date: string;
  /** 心情星级 0–5，0 表示未记录 */
  mood: Rating;
  /** 心情文字（可选备注） */
  moodText: string;
  /** 身体星级 0–5，0 表示未记录 */
  body: Rating;
  /** 身体文字（可选备注） */
  bodyText: string;
  updatedAt: number;
}

/**
 * 时间轴时间段。
 *
 * 与 Item / Task 一样走软删：`deletedAt` 一旦被设置就视为已删除，
 * 「撤销」能完整恢复。区间查询统一走 `date` 索引，避免全表扫描。
 */
export interface TimeSlot {
  id: string;
  /** 所属日期键，格式 YYYY-MM-DD（本地时区） */
  date: string;
  /** 开始时间，距当天 00:00 的分钟数（0–1439） */
  startMin: number;
  /** 结束时间，距当天 00:00 的分钟数（0–1439）；0 表示「未设定结束」 */
  endMin: number;
  /** 实际开始时间（记录用，可与计划不同）；null = 尚未记录。
   *  老数据缺该字段，仓储读取时统一归一化为 null */
  actualStartMin: number | null;
  /** 实际结束时间（记录用）；null = 尚未记录 */
  actualEndMin: number | null;
  /** 内容描述 */
  content: string;
  /** 关联板块（可空：时间轴不强制归类到四大板块） */
  sectionId: SectionKey | null;
  /** 是否已完成 */
  done: boolean;
  /** 同天排序值，步长 1000，支持中点插入 */
  order: number;
  createdAt: number;
  updatedAt: number;
  /** 软删时间戳；null 表示未删除 */
  deletedAt: number | null;
}

/** 新建时间段时的必填输入 */
export type TimeSlotDraft = Pick<
  TimeSlot,
  'date' | 'startMin' | 'endMin' | 'content' | 'sectionId'
>;

/** 灵感：主页日记体第 5 组的纯文字条目（无勾选 / 无评分 / 无子项层级） */
export interface Inspiration {
  id: string;
  /** 所属日期键，格式 YYYY-MM-DD（本地时区） */
  date: string;
  content: string;
  /** 同天排序值，步长 1000，支持中点插入 */
  order: number;
  createdAt: number;
  updatedAt: number;
  /** 软删时间戳；null 表示未删除 */
  deletedAt: number | null;
}

/** 创建条目时的必填输入 */
export type ItemDraft = Pick<Item, 'date' | 'sectionId' | 'parentId' | 'title'>;

/** 创建任务时的必填输入 */
export type TaskDraft = Pick<Task, 'date' | 'content'>;

/* ------------------------------------------------------------------ */
/* 视图模型（由 services 计算，供 UI 直接渲染）                          */
/* ------------------------------------------------------------------ */

/** 一条可见的树行（扁平化后的渲染单元） */
export interface VisibleRow {
  item: Item;
  /** 缩进深度，0 起 */
  depth: number;
  /** 是否有子条目 */
  hasChildren: boolean;
  /** 子条目数量（含所有后代） */
  descendantCount: number;
  /** 直系子项的完成情况，形如 { done: 2, total: 5 }；无子项时为 null */
  childrenProgress: { done: number; total: number } | null;
  /** 祖先链上的 id 列表，由浅到深，用于折叠判断 */
  ancestorIds: string[];
}

/** 单个板块的完成度汇总 */
export interface SectionProgress {
  sectionId: SectionKey;
  /** 顶层条目完成数 */
  done: number;
  /** 顶层条目总数 */
  total: number;
  /** 完成率 0–1；total 为 0 时返回 0 */
  ratio: number;
  /** 预览条目（顶层前 N 条） */
  preview: Item[];
}

/** 环形图的一段 */
export interface RingSegment {
  sectionId: SectionKey;
  name: string;
  color: string;
  ratio: number;
  done: number;
  total: number;
}

/** 环形图整体数据 */
export interface RingData {
  /** 加权总完成率 0–1 */
  overall: number;
  segments: RingSegment[];
  /** 没有任何条目时为 true，用于渲染空状态 */
  isEmpty: boolean;
}

/**
 * 一天的摘要（日历格子打点 + 选中日卡片共用）。
 *
 * 口径与首页环形图完全一致：四板块只统计**顶层条目**，子项不进分母；
 * `overall` 为加权总完成率 Σ(顶层完成) ÷ Σ(顶层总数)，任务不计入
 * （与 `RingData.overall` 同源，避免两处口径打架）。
 */
/** 主页日记体分组（工作/学习/健身/生活/灵感 固定顺序） */
export interface DiaryGroup {
  key: SectionKey | 'inspiration';
  /** 工作 / 学习 / 健身 / 生活 / 灵感 */
  name: string;
  entries: DiaryEntry[];
}

/** 主页日记体列表里的一行（顶层条目 / 子项 / 灵感） */
export interface DiaryEntry {
  /** 展示编号：仅四板块顶层条目跨组连续 1~N；子项与灵感恒为 null */
  displayNo: number | null;
  kind: 'item' | 'child' | 'inspiration';
  item?: Item;
  inspiration?: Inspiration;
  /** 缩进深度（item/child），0 = 顶层 */
  depth: number;
}

export interface DaySummary {
  /** 所属日期键 YYYY-MM-DD */
  date: string;
  /** 当天是否有任何记录（条目 / 任务 / 总评任一） */
  hasData: boolean;
  /** 四板块的顶层条目完成情况 */
  sections: Record<SectionKey, { done: number; total: number }>;
  /** 当日任务完成数 */
  taskDone: number;
  /** 当日任务总数 */
  taskTotal: number;
  /** 心情星级，0 = 未记录 */
  mood: Rating;
  /** 身体星级，0 = 未记录 */
  body: Rating;
  /** 加权完成率 0–1；四板块无条目时为 0（不会是 NaN） */
  overall: number;
}
