# 实时同步（本地优先）

> 状态：**内核已完成并有单测覆盖，尚未接后端**（2026-10-19）。
> 接云时只需实现 `SyncGateway` 接口，`services/syncService.ts` 一个字都不用改。

## 一、定位：平行通道，不是替换仓储

```
UI → store → services → Repositories（IndexedDB，唯一真相源）
                  ↘
                   SyncGateway ←→ 云端镜像（可离线、可失败、可关掉）
```

🔴 曾考虑过「实现一套云端 Repository，在 `createRepositories()` 里切换」——
那是**云端当真相源**的模式，与本项目冲突：离线就用不了、弱网首屏白屏、
本地与云端不一致时无法判定谁对。`repositories/CloudRepository.stub.ts`
里已把这个否决理由写死，别再走回头路。

本地优先意味着：**同步挂了，App 照常用**。断网、超时、云端返回 500，
都只影响「数据搬到对端」，不影响本机增删改查。

## 二、同步范围

| 实体 | 参与 | 说明 |
| --- | --- | --- |
| `item` | ✅ | 记录级 LWW |
| `task` | ✅ | 同上 |
| `timeSlot` | ✅ | 同上 |
| `inspiration` | ✅ | 同上 |
| `selfStatus` | ✅ | 主键是日期键，不可删（`deletedAt` 恒 null） |
| `day` | ❌ | 无 `updatedAt`，只是「这天被访问过」的惰性标记，对端 `ensure()` 即可重建 |
| `itemImage` / `taskImage` | ❌ | 二进制 Blob，走**内容 hash 去重 + 懒加载**，第二阶段做 |

不做字段级合并（那要给每个字段记时间戳，复杂度高一个量级）。
已知取舍：两端同时重排顺序时 `order` 以后写为准，可能跳变 —— 重排是单端低频操作，接受。

## 三、时间轴：为什么要有服务端轴

手机时钟不准是常态。若各设备把本地时间戳直接当排序键，
**谁的钟快谁说了算**，慢的设备的改动永远被压掉。

约定：

- 推送前：发送方把 `updatedAt` / `deletedAt`（含 `record` 内部的）统一换算到服务端轴；
- 云端：一律存服务端轴；
- 落库前：接收方按自己的 `serverTimeOffset` 平移回本地轴。

```
toServer(t) = t + offset        toLocal(t) = t - offset
offset = serverTime - 本地当前时间（每轮 pull / push 后重新校准）
```

两条游标（`lastPulledAt` / `lastPushedAt`）也记服务端轴。
**绝不用本地 `Date.now()` 当游标**。

## 四、排序键：为什么是 `syncStamp` 而不是 `updatedAt`

软删**只改 `deletedAt`，`updatedAt` 不动** —— 这是「撤销」能完整恢复的前提。
若以 `updatedAt` 为游标，一次删除的排序键不会前进，
**这条删除永远推不上去，对端那条记录就会被复活**。

```ts
syncStamp(row) = Math.max(row.updatedAt, row.deletedAt ?? 0)
```

本地优先同步最经典的翻车点，就在这里。

## 五、冲突裁决：记录级 LWW

`resolveSyncConflict()` 在 `domain/sync.ts`，**本地端与云端共用同一份** ——
规则只写一遍，才谈得上收敛。

| 优先级 | 情形 | 结果 |
| --- | --- | --- |
| 1 | 一方的删除时刻 ≥ 对方的最后修改时刻 | 删除胜 |
| 1' | 双方都删 | **早的那个**删胜（它是原始删除） |
| 2 | 一方在对方删除**之后**又编辑了 | 修改胜（视为「我要找回来」） |
| 3 | 都没有压倒性删除 | `updatedAt` 大者胜 |
| 4 | 时间戳完全相同 | `deviceId` 字典序小者胜（保证两端独立计算得到同一赢家） |
| 5 | 时间戳与设备都相同 | `same`，不落库 |

## 六、一轮同步

```
1. pull（可多页，每页 500，最多 50 页）
   since = max(0, lastPulledAt − 5s)   ← 重叠窗口，兜云端提交延迟
   逐行裁决 → 落库 → 抬 lastPulledAt
   落库行的 stamp 同时抬 lastPushedAt  ← 防止「刚拉下来又推回去」的回环
2. push（分批 500）
   筛 syncStamp > lastPushedAt 的行 → 换算到服务端轴 → 推送 → 抬 lastPushedAt
3. 落盘游标
```

**先 pull 再 push**，顺序不能反：先 pull 才能校准时钟偏移、
才能把对端改动并进本地，否则推上去的是未合并的旧值。

任何一步失败都返回 `ok: false` 而不抛出，且**已成功的游标照常落盘** ——
中断只是让下一轮重放一小段，不会丢数据。

## 七、软删清理的守卫

`purgeExpiredSoftDeletes()` 在开启同步后多一条约束：
**只清理「删除动作已经推上云」的 tombstone**。

物理删掉一条还没同步出去的删除记录，云端永远不知道它删过，
下一轮对端那条「还活着」的行会被当成新数据推回来 —— **删除被复活**。
代价是清理最多推迟到下一次成功同步，这比复活数据划算得多。

## 八、接云时要做的事（尚未开始）

1. **云端表**（建议）：
   ```sql
   ds_rows(user_id, entity, id, payload jsonb, updated_at, deleted_at, device_id)
   primary key (user_id, entity, id)
   index (user_id, entity, updated_at)
   ```
   `payload` 存整行 jsonb，后续加字段不用动表结构。RLS 按 `user_id` 隔离。
2. **认证**：邮箱 / 手机验证码 / 微信登录。
   ⚠️ iOS 上架硬规则：提供任何第三方登录就必须**同时提供 Sign in with Apple**；
   只要有账号创建，就必须有账号删除入口 + 隐私政策页。
3. **`store/syncStore`**：登录态、自动触发时机（启动 / 切前台 / 改动后防抖）、冲突提示。
4. **首次登录归属**：云端空 + 本地有 → 全量 push；两边都有 → 默认 pull 后 merge，
   另给一个「以本地为准」的出口。nanoid 跨设备唯一，行级 upsert 天然去重。
5. **图片同步**（第二阶段）：按内容 hash 去重、懒加载、引用计数归零才删。

## 九、已知未验证项

- 真机网络下的表现（目前只有 `MemorySyncGateway` 假云端）；
- 大批量（几千行）首次全量同步的耗时；
- 云端 `done` 分页语义与真实后端的一致性。
