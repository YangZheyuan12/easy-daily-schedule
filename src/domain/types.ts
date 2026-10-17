import type {
  Rating,
  SectionKey,
  TaskSectionKey,
  TaskKind,
  RelativeDeadline,
} from './enums';


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
  /**
   * 来源任务 id：由「任务页 → 同步到今日页」产生时记录，null 表示手建的条目。
   * 用途只有一个 —— 幂等去重（同一个任务不会被同步成两条条目）。
   * 老数据缺该字段，仓储读取时归一化为 null。
   */
  sourceTaskId: string | null;
  /**
   * 来源时间段 id：由「时间轴 → 同步到今日页」产生时记录，null 表示非时间段同步。
   * 与 `sourceTaskId` 同构 —— 只做幂等去重（同一个时间段不会被同步成两条条目）。
   * 老数据缺该字段，仓储读取时归一化为 null。
   */
  sourceSlotId: string | null;
  /** 软删时间戳；null 表示未删除 */
  deletedAt: number | null;
}

/** 每日任务（默认独立于四大板块，可归入五个分组之一） */
export interface Task {
  id: string;
  date: string;
  content: string;
  /**
   * 所属分组：四大板块之一，或「其他」。
   *
   * 🔴 只有四大板块的会参与「同步到今日页」（R-043）；「其他」是任务的默认归宿 ——
   * 它代表「这件事不属于任何板块」，同步过去没有落点。
   * 老数据缺该字段，仓储读取时统一归一化为 `'other'`。
   */
  sectionId: TaskSectionKey;
  /**
   * 任务种类：每日任务 / 期限任务 / 长时目标。
   * 老数据缺该字段，仓储读取时统一归一化为 `'daily'`。
   */
  kind?: TaskKind;
  /** 任务描述（长文本，添加时可填，可选） */
  description?: string;
  /**
   * 期限任务的截止日期（YYYY-MM-DD 本地时区）。与 `dueRelative` 二选一。
   * 仅 `kind === 'deadline'` 时有意义。
   */
  dueDate?: string;
  /** 期限任务的抽象期限（三天内 / 一周内 / 两周内）。与 `dueDate` 二选一 */
  dueRelative?: RelativeDeadline;
  done: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** 「继承昨日」时记录的来源任务 id，用于幂等去重 */
  inheritedFrom: string | null;
}

/**
 * 同步任务到今日页时，一条待建条目的草稿。
 *
 * 同步是**一次性复制**（快照），不是持续关联：点「同步」的那一刻把任务内容
 * 复制成今日页的条目，之后两边各自独立。`taskId` 只用于去重
 * （避免同一个任务被同步两次，在今日页留下两条一样的条目）。
 */
export interface TaskSyncDraft {
  /** 来源任务 id —— 去重的唯一依据 */
  taskId: string;
  date: string;
  sectionId: SectionKey;
  title: string;
  /** 跟随任务的完成情况：已完成的任务同步过去也是已完成 */
  done: boolean;
}

/**
 * 同步时间段到今日页时，一条待建条目的草稿。
 *
 * 与 `TaskSyncDraft` 同构（一次性复制 + `slotId` 去重），区别只在来源：
 * 时间段本身**已经**按板块归好类（`sectionId` 非空才可同步），
 * 所以不需要「其他分组」那种排除规则。
 */
export interface SlotSyncDraft {
  /** 来源时间段 id —— 去重的唯一依据 */
  slotId: string;
  date: string;
  sectionId: SectionKey;
  title: string;
  /** 跟随时间段的完成情况：已完成的时间段同步过去也是已完成 */
  done: boolean;
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
  /**
   * 课表导入批次号。**非索引字段**，因此不需要改 Dexie schema 版本。
   *
   * 课表本质上是「每周重复」，但本表按具体日期存（导入时展开），一次会铺出几百条。
   * 有了批次号才能整批删除 / 覆盖 —— 否则改一次课表就得手工删几百条记录。
   * 手工添加的时间段一律为 null，不受课表管理影响。
   */
  seriesId?: string | null;
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

/**
 * 条目图片附件。
 *
 * 单独成表存 Blob（不塞进 Item 记录，否则 `listByDate` 会把图片二进制一起捞上来，
 * 单日几百条记录的加载会瞬间膨胀）。通过 `itemId` 索引反查，渲染时按需加载。
 * 图片随条目物理删除而清理：`purgeExpiredSoftDeletes` 会清掉「所属条目已不存在」的孤儿附件。
 */
export interface ItemImage {
  id: string;
  /** 所属条目 id */
  itemId: string;
  /** 图片二进制（File 即 Blob 的子类，可直接结构化克隆入库） */
  blob: Blob;
  /** 上传时间（用于排序，先传的排在前面） */
  createdAt: number;
}

/**
 * 任务图片附件（期限任务 / 长时目标 / 每日任务共用）。
 *
 * 与 `ItemImage` 同构但**必须是独立的一张表**：图片的归属键是 taskId 而不是 itemId，
 * 强行复用 itemImages 会让「孤儿清理」失去依据（`purgeOrphans` 按 items 表判定存活，
 * 任务图会被当成孤儿删掉）。干净的数据模型省下的永远是 debug 的时间。
 */
export interface TaskImage {
  id: string;
  /** 所属任务 id */
  taskId: string;
  /** 图片二进制 */
  blob: Blob;
  /** 上传时间（用于排序，先传的排在前面） */
  createdAt: number;
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
  /**
   * 直系子项的完成情况，形如 { done: 2, total: 5 }；无子项时为 null。
   * 🔴 2026-10-16 起 UI 不再展示它（用户要求去掉「x/y」这类进度显示）——
   * 字段保留：口径由 treeService 的测试锁住，树行模型不随展示决策反复变形。
   */
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

/** 主页日记体列表里的一行（顶层条目 / 子项 / 灵感 / 时间轴时间段） */
export interface DiaryEntry {
  /**
   * 展示编号：四板块的**顶层条目**与**归类到该板块的时间段**跨组连续 1~N；
   * 子项与灵感恒为 null。
   *
   * 时间段也编号，是因为它既然计入该板块的完成率（`DaySummary.sections` 已如此），
   * 就等价于该板块的一件「顶层要做的事」；若不给编号，会出现组头写着 3 项、
   * 列表里却只有 2 个编号的错位。
   */
  displayNo: number | null;
  kind: 'item' | 'child' | 'inspiration' | 'timeSlot';
  item?: Item;
  inspiration?: Inspiration;
  /**
   * `kind === 'timeSlot'` 时的源时间段。
   *
   * 🔴 这是**只读投影**，不是复制出来的 Item：今日页展示的是时间轴那条数据的
   * 一个视图，勾选直接写回 `TimeSlot.done`。不落第二条记录，就不存在
   * 「改了标题这边、那边没跟着变」的双向同步问题，撤销语义也保持单一。
   */
  timeSlot?: TimeSlot;
  /** 缩进深度（item/child/timeSlot），0 = 顶层 */
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
