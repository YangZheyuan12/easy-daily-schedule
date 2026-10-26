import type {
  Account,
  AiAnalysisRecord,
  AiAnalysisRequest,
  AiAnalysisResult,
  AiChatRequest,
  AiProviderConfig,
  AuthToken,
  CodeRequestResult,
  DailySelfStatus,
  Day,
  Entitlement,
  Inspiration,
  Item,
  ItemImage,
  PinCompletion,
  Plan,
  Session,
  SignInCredential,
  Task,
  TaskImage,
  TimeSlot,
} from './types';
import type { SectionKey } from './enums';
import type { SyncPullPage, SyncPushAck, SyncRow, SyncState } from './sync';

/**
 * 仓储端口（接口）。
 *
 * 这是**唯一允许触碰存储 API 的层边界**：`src/repositories/` 下的实现负责
 * 适配 IndexedDB（Dexie）；将来迁微信小程序时新增 `WxStorageRepository`，
 * 只需替换 `src/repositories/index.ts` 一个装配点，业务代码零改动。
 *
 * 本文件只定义契约，不含任何实现，也不 import 任何运行时依赖。
 */

export interface ItemRepository {
  /** 取某天某板块的全部条目（含软删，由 mapper 决定过滤策略） */
  listBySection(date: string, sectionId: SectionKey): Promise<Item[]>;
  /** 取某天全部板块的条目 */
  listByDate(date: string): Promise<Item[]>;
  /**
   * 区间批量拉取（日历月视图用）。
   * 实现必须走 `date` 索引的 between 查询，禁止全表 toArray 后再内存过滤。
   */
  listByDateRange(startDate: string, endDate: string): Promise<Item[]>;
  listAll(): Promise<Item[]>;
  get(id: string): Promise<Item | undefined>;
  /** 批量写入（新增或更新），必须在单个事务内完成 */
  upsertMany(items: Item[]): Promise<void>;
  /** 物理删除（仅用于软删记录到期清理） */
  hardDeleteMany(ids: string[]): Promise<void>;
  /** 返回 items 表中全部 id（含软删未到期的），用于清理孤儿图片附件 */
  listAllIds(): Promise<string[]>;
}

export interface TaskRepository {
  listByDate(date: string): Promise<Task[]>;
  /** 区间批量拉取（日历月视图用），走 `date` 索引 */
  listByDateRange(startDate: string, endDate: string): Promise<Task[]>;
  listAll(): Promise<Task[]>;
  upsertMany(tasks: Task[]): Promise<void>;
  hardDeleteMany(ids: string[]): Promise<void>;
}

/**
 * 定住任务的每日完成态仓储（按 taskId + date 维度）。
 *
 * 完成态按 `taskId@date` 存 `pinCompletions` 表，投影任务勾选时直接 upsert，
 * 天然幂等；模板被删后其完成记录成孤儿，由 `purgeOrphans` 清理。
 */
export interface PinCompletionRepository {
  /** 某天的全部完成记录 */
  listByDate(date: string): Promise<PinCompletion[]>;
  /** 若干模板的完成记录（清理用） */
  listByTaskIds(taskIds: string[]): Promise<PinCompletion[]>;
  /** 全表拉取（清理用） */
  listAll(): Promise<PinCompletion[]>;
  /** 批量写入（新增或更新），单事务 */
  upsertMany(rows: PinCompletion[]): Promise<void>;
  /** 物理删除 */
  hardDeleteMany(ids: string[]): Promise<void>;
  /** 清理孤儿：所属模板已不存在的完成记录一并删除，返回清理条数 */
  purgeOrphans(existingTaskIds: Set<string>): Promise<number>;
}

export interface DayRepository {
  /** 确保该日记录存在（惰性创建），返回已有或新建的 Day */
  ensure(date: string): Promise<Day>;
  listAll(): Promise<Day[]>;
  /** 批量写入（备份导入用） */
  upsertMany(days: Day[]): Promise<void>;
  /** 清空整表。仅备份「覆盖导入」使用，日常业务禁止调用 */
  clearAll(): Promise<void>;
}

export interface SelfStatusRepository {
  /** 取某天的自我状态（主键即日期键） */
  get(date: string): Promise<DailySelfStatus | undefined>;
  /** 写入（主键即日期键，天然幂等） */
  upsert(selfStatus: DailySelfStatus): Promise<void>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listBetween(startDate: string, endDate: string): Promise<DailySelfStatus[]>;
  /** 全表拉取（备份导出用） */
  listAll(): Promise<DailySelfStatus[]>;
  /** 批量写入（备份导入用） */
  upsertMany(rows: DailySelfStatus[]): Promise<void>;
  /** 清空整表。仅备份「覆盖导入」使用，日常业务禁止调用 */
  clearAll(): Promise<void>;
}

export interface TimeSlotRepository {
  /** 取某天的全部时间段（含软删，由调用方决定过滤策略） */
  listByDate(date: string): Promise<TimeSlot[]>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listByDateRange(startDate: string, endDate: string): Promise<TimeSlot[]>;
  /** 全表拉取（备份导出用，含软删，由调用方过滤） */
  listAll(): Promise<TimeSlot[]>;
  /** 批量写入（新增或更新），必须在单个事务内完成 */
  upsertMany(slots: TimeSlot[]): Promise<void>;
  /** 物理删除（仅用于软删记录到期清理） */
  hardDeleteMany(ids: string[]): Promise<void>;
}

export interface InspirationRepository {
  /** 取某天的全部灵感（已过滤软删，按 order 排序） */
  listByDate(date: string): Promise<Inspiration[]>;
  /** 区间批量拉取（日历月 / 年视图用），走 `date` 索引 */
  listByDateRange(startDate: string, endDate: string): Promise<Inspiration[]>;
  /** 全表拉取（备份导出用，含软删，由调用方过滤） */
  listAll(): Promise<Inspiration[]>;
  /** 批量写入（新增或更新），必须在单个事务内完成 */
  upsertMany(rows: Inspiration[]): Promise<void>;
  /** 物理删除（仅用于软删记录到期清理） */
  hardDeleteMany(ids: string[]): Promise<void>;
}

/**
 * 条目图片附件仓储。
 *
 * 图片二进制单独成表，通过 `itemId` 反查；条目删除后由 `purgeOrphans` 清理孤儿附件。
 */
export interface ItemImageRepository {
  /** 批量取若干条目挂的图片（按 createdAt 升序），itemIds 为空返回 [] */
  listByItemIds(itemIds: string[]): Promise<ItemImage[]>;
  /** 全表拉取（备份导出用） */
  listAll(): Promise<ItemImage[]>;
  /** 批量写入（新增或更新），单事务 */
  putMany(images: ItemImage[]): Promise<void>;
  /** 删除单张图片 */
  delete(id: string): Promise<void>;
  /** 覆盖写入单张图片的二进制（保留 id 与 createdAt，仅替换 blob）。用于上传后重新编辑 */
  replace: (id: string, blob: Blob) => Promise<void>;
  /**
   * 清理孤儿附件：图片所属的条目记录已不存在时一并删除。
   * `existingItemIds` 应传入 items 表**全部** id（含软删未到期），
   * 这样「软删窗口内、还能撤销」的条目图片不会被误删。
   */
  purgeOrphans(existingItemIds: Set<string>): Promise<number>;
}

/** 任务图片附件仓储（与条目图片同构，但归属键是 taskId，故独立一张表） */
export interface TaskImageRepository {
  /** 批量取若干任务挂的图片（按 createdAt 升序），taskIds 为空返回 [] */
  listByTaskIds(taskIds: string[]): Promise<TaskImage[]>;
  /** 全表拉取（备份导出用） */
  listAll(): Promise<TaskImage[]>;
  /** 批量写入（新增或更新），单事务 */
  putMany(images: TaskImage[]): Promise<void>;
  /** 删除单张图片 */
  delete(id: string): Promise<void>;
  /** 覆盖写入单张图片的二进制（保留 id 与 createdAt，仅替换 blob）。用于上传后重新编辑 */
  replace: (id: string, blob: Blob) => Promise<void>;
  /** 清理孤儿附件：`existingTaskIds` 传 tasks 表**全部** id（含软删未到期） */
  purgeOrphans(existingTaskIds: Set<string>): Promise<number>;
}

/** 轻量键值偏好（板块改名 / 折叠态等），一期落在 localStorage */
export interface SettingsRepository {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* 账号与权益（独立于业务仓储，但同样走 repositories 这一层）            */
/* ------------------------------------------------------------------ */

/**
 * 账号画像仓储（缓存当前登录用户的非敏感信息）。
 *
 * 与业务仓储同处 `repositories/`：它也是 IndexedDB 的一张表，只是存的不是业务数据。
 * token 不在这里 —— 见 `TokenStore`（安全存储）。
 */
export interface AccountRepository {
  /** 读取当前账号（无则 undefined） */
  get(): Promise<Account | undefined>;
  /** 写入 / 覆盖（主键固定 'current'） */
  upsert(account: Account): Promise<void>;
  /** 退出登录时清除 */
  clear(): Promise<void>;
}

/** 权益快照仓储（服务端权益的本地缓存） */
export interface EntitlementRepository {
  get(): Promise<Entitlement | undefined>;
  upsert(entitlement: Entitlement): Promise<void>;
  clear(): Promise<void>;
}

/**
 * 鉴权网关（唯一允许打网络的地方，与 SyncGateway 同级的第二条通道）。
 *
 * 业务层不直接认识它 —— 只有 `services/authService` 调用。
 * 当前为本地实现（platform/auth/localAuthGateway.ts：验证码登录 + 本机账号）；
 * 接 WorkBuddy 云服务 / 微信 / Apple 时仅替换该实现，业务零改动。
 */
export interface AuthGateway {
  /**
   * 请求登录验证码。
   * 本地实现是「模拟短信/邮件」：生成 6 位码并通过 `devCode` 回传供 UI 展示；
   * 真实后端把码发给用户，不回传。
   */
  requestCode(identifier: string): Promise<CodeRequestResult>;
  /** 凭验证码登录（首次登录自动建号），返回完整会话 */
  signIn(credential: SignInCredential): Promise<Session>;
  /** 退出登录（清掉对端会话，由调用方负责清本地） */
  signOut(): Promise<void>;
  /** 取已存储的会话（冷启动 hydrate 用）；无则返回 null */
  getStoredSession(): Promise<Session | null>;
  /** 用 refreshToken 换新的 accessToken */
  refreshToken(token: AuthToken): Promise<AuthToken>;
}

/** 登录方式。iOS 若上了第三方登录（如微信），必须同时提供 'apple'（App Store 审核红线） */
export type AuthProvider = 'apple' | 'email' | 'phone' | 'wechat';

/**
 * 权益网关：拿着 userId + token 去服务端拉最新权益。
 * 服务端是真相源；客户端缓存见 `EntitlementRepository`。
 */
export interface EntitlementGateway {
  fetch(userId: string, token: AuthToken): Promise<Entitlement>;
}

/**
 * 购买网关：开通 / 续费 / 恢复购买。
 *
 * 与 `EntitlementGateway`（只读）分开：一个是「查」，一个是「买」。
 * 真实实现里购买要走支付渠道（iOS App Store / 微信支付）并由服务端校验回执；
 * 当前为本地模拟实现（platform/auth/localPurchaseGateway.ts），
 * 换真实支付时只替换这一个文件，上层 store / UI 零改动。
 */
export interface PurchaseGateway {
  /** 购买 / 续费某套餐，返回新的权益快照（调用方负责落库） */
  purchase(plan: Plan): Promise<Entitlement>;
  /** 恢复购买：重放本机已购权益；无购买记录返回免费态 */
  restore(): Promise<Entitlement>;
}

/**
 * 鉴权令牌安全存储。
 *
 * 🔴 敏感信息**绝不进 IndexedDB / localStorage 明文**：走平台安全存储
 *（Capacitor → iOS Keychain / Android EncryptedSharedPreferences）。
 * 当前 mock 实现用内存 + 可选兜底（platform/auth/secureTokenStore.ts）。
 * 这一端口本身在 domain 层定义，实现落在 platform 层（只有那里能碰浏览器 / 原生 API）。
 */
export interface TokenStore {
  save(token: AuthToken): Promise<void>;
  load(): Promise<AuthToken | null>;
  clear(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* 同步端口（平行于 Repositories 的**第二条**通道）                     */
/* ------------------------------------------------------------------ */

/**
 * 云端同步网关。
 *
 * 与上面的仓储端口**不是一回事**：仓储回答「本地数据怎么存」，
 * 网关回答「差异怎么搬到对端」。它是本地优先架构里唯一需要网络的地方，
 * 业务层永远不认识它 —— 只有 `services/syncService` 会调用。
 *
 * 所有时间参数/返回值均为**服务端时间轴**（见 `domain/sync.ts` 的时间轴约定）。
 */
export interface SyncGateway {
  /**
   * 拉取 `since`（服务端轴，**不含**）之后发生变更的行。
   * 一次最多 `limit` 行；`done` 为 false 时调用方应继续拉下一页。
   */
  pull(since: number, limit: number): Promise<SyncPullPage>;
  /** 推送一批行；云端按记录级 LWW 落库，返回服务端时间与接受条数 */
  push(rows: SyncRow[]): Promise<SyncPushAck>;
}

/**
 * 本地同步状态仓储（deviceId / 双游标 / 时钟偏移）。
 *
 * 单独成表而不是塞进 `SettingsRepository`：它是**同步正确性的一部分**
 * （游标错了会漏数据），不该跟「板块折叠态」这种可丢的偏好混在一起。
 */
export interface SyncStateRepository {
  /** 读取；不存在时返回带新 deviceId 的默认状态 */
  get(): Promise<SyncState>;
  /** 局部更新并返回合并后的状态 */
  patch(patch: Partial<SyncState>): Promise<SyncState>;
  /** 清空（退出登录时用：设备 id 保留，游标归零） */
  reset(): Promise<SyncState>;
}

/* ------------------------------------------------------------------ */
/* AI 模块（用户自带 API，本地优先）                                    */
/* ------------------------------------------------------------------ */

/**
 * AI 网关：唯一允许打网络的地方（与 AuthGateway / SyncGateway 同级）。
 *
 * 业务层不认识具体实现 —— 只有 `services/aiService` 调用。
 * 当前为占位实现（platform/ai/index.ts 返回未就绪网关），第二阶段接入
 * OpenAI 兼容 / Anthropic / Gemini 的具体实现，业务零改动。
 */
export interface AiGateway {
  /**
   * 把聚合统计发给模型，返回结构化分析。
   * 密钥不进 config：由网关自行从安全存储取，避免明文在内存里满天飞。
   */
  analyze(
    request: AiAnalysisRequest,
    config: AiProviderConfig,
    apiKey: string,
  ): Promise<AiAnalysisResult>;
  /**
   * 对话式问答：把快照 + 用户消息 + 历史发给模型，返回纯文本回答。
   * 与 analyze 的区别：回答是自然语言而非结构化 JSON，用于「我的」页 AI 对话。
   */
  chat(
    request: AiChatRequest,
    config: AiProviderConfig,
    apiKey: string,
  ): Promise<string>;
  /**
   * 连通性自检：发一个最小请求确认 Base URL / 密钥可用。
   * 网络不通抛「无法连接」；能连但鉴权失败抛「密钥或地址可能不正确」。
   */
  testConnection(config: AiProviderConfig, apiKey: string): Promise<void>;
}

/** API Key 安全存储（与 TokenStore 同等级，AES-GCM 信封） */
export interface AiKeyStore {
  save(key: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;
}

/** AI 分析历史缓存仓储 */
export interface AiAnalysisRepository {
  /** 写入 / 覆盖一条分析记录（主键 id） */
  put(record: AiAnalysisRecord): Promise<void>;
  /** 最近 N 条（按 generatedAt 降序） */
  listRecent(limit?: number): Promise<AiAnalysisRecord[]>;
  /** 取单条；不存在返回 undefined */
  get(id: string): Promise<AiAnalysisRecord | undefined>;
}

/** 全部仓储的集合，由 repositories/index.ts 装配后注入 */
export interface Repositories {
  items: ItemRepository;
  tasks: TaskRepository;
  pinCompletions: PinCompletionRepository;
  days: DayRepository;
  selfStatus: SelfStatusRepository;
  timeSlots: TimeSlotRepository;
  inspirations: InspirationRepository;
  itemImages: ItemImageRepository;
  taskImages: TaskImageRepository;
  account: AccountRepository;
  entitlements: EntitlementRepository;
  settings: SettingsRepository;
  /**
   * AI 分析历史缓存（落本地，便于复查；不参与同步，属纯本机数据）。
   */
  aiAnalyses: AiAnalysisRepository;
  /**
   * 同步状态（deviceId / 双游标 / 时钟偏移）。
   *
   * 它跟上面这些**不是一类东西**（不存业务数据，存的是同步自身的进度），
   * 但放在同一个集合里最省心：装配点仍然只有 `createRepositories()` 一个，
   * 上层拿到的始终是一整套接口。
   */
  syncState: SyncStateRepository;
}
