# 安卓「覆盖安装」问题与固定签名方案

## 症状

装了旧版之后，再装新版会失败，提示「未安装应用」/「与已安装的版本签名不同」，
只能**先卸载旧版**才能装上。

## 根因

这不是 bug，是 Android 的规则。覆盖安装（保住数据）必须同时满足三条：

| # | 条件 | 默认状态 |
|---|------|----------|
| 1 | `applicationId` 一致 | ✅ 满足（`com.yangzheyuan.dailyschedule`） |
| 2 | **签名一致** | ❌ **不满足** ← 就是这里 |
| 3 | `versionCode` 不低于已装版本 | ⚠️ 默认一直是 1，忘了递增就会挂 |

第 2 条为什么必挂：

- `npx cap run android` / Android Studio 直接 Run → 装的是 **debug 包**，
  用**本机** `debug.keystore` 签名（每台机器、每次重装系统都不同）；
- 自己 `gradlew assembleRelease` 打的 release 包 → 之前**根本没配签名**。

两者签名不同 → 系统判定「这不是同一个开发者的升级包」→ 拒绝覆盖 → 只能卸载。

### 为什么这件事特别致命

**卸载 = 删除整个 App 沙盒 = IndexedDB 里的全部记录消失。**

本项目数据 100% 存在本机（Dexie / IndexedDB），没有账号同步。所以
「必须先卸载」直接等价于「必须先删掉你所有的记录」。

> 顺带：iOS 还有个独立风险——系统会在存储吃紧时回收 WKWebView 的网站数据，
> IndexedDB 也可能被清。所以它也需要备份，不只是安卓的问题。

## 解决方案：固定签名（一次性配置，永久生效）

思路：**让 debug 和 release 共用同一把钥匙**。这样无论你之后怎么打包，
签名永远一致，覆盖安装永远成功，数据永远保住。

`android/app/build.gradle` 已经改好：它会读取 `android/app/keystore.properties`，
有这个文件就让 `debug` 与 `release` 都用它签名；没有就退回默认 debug 签名（本地构建不受影响）。

### 第 1 步：生成 keystore（只做一次）

```bat
REM Windows（Git Bash 用正斜杠亦可）
"%JAVA_HOME%\bin\keytool" -genkeypair -v ^
  -keystore android\dailyschedule.keystore ^
  -alias dailyschedule ^
  -keyalg RSA -keysize 2048 -validity 10000
```

会问你一串问题（名字、组织等），随便填即可；关键是**记住两个密码**
（keystore 密码和 key 密码，可以设成一样）。

> 🔴 `validity 10000` ≈ 27 年。别设太短：证书过期后**无法**作为升级包发布，
> 只能换包名或让用户卸载。

### 第 2 步：写 `android/app/keystore.properties`

```
storeFile=../dailyschedule.keystore
storePassword=你的keystore密码
keyAlias=dailyschedule
keyPassword=你的key密码
```

路径 `../dailyschedule.keystore` 是相对于 `android/app/` 的，
即 `android/dailyschedule.keystore`。

> 🔴 **这两个文件绝不能提交**：本仓库是公开的，keystore 泄露 = 任何人都能打出
> 「同名同签名」的包，用户手机会把它当成官方升级直接覆盖安装。
> `.gitignore` 已排除 `*.keystore` / `keystore.properties`，提交前用
> `git status --short` 再确认一次。

### 第 3 步：打包

```bat
npm run build
npx cap sync android
cd android
gradlew.bat assembleRelease
```

产物：`android\app\build\outputs\apk\release\app-release.apk`

### 第 4 步：验证覆盖安装

```bat
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

`-r` 表示**重装并保留数据**——这正是我们要的行为。看已装版本：

```bat
adb shell dumpsys package com.yangzheyuan.dailyschedule | findstr /i "versionCode versionName"
```

## 报错对照表

| 报错 | 含义 | 怎么办 |
|------|------|--------|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 签名不一致，或 `applicationId` 变了 | 检查 keystore.properties 是否生效 / 包名是否改过 |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | `versionCode` 比已装的低 | 递增 `build.gradle` 里的 `versionCode` |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | 这个包压根没签名 | 确认 keystore.properties 存在且密码正确 |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | 打的 APK 不含手机的 CPU 架构 | 打 universal APK，或确认设备 ABI |
| 手机弹「纯净模式 / 未知来源」拦截 | 厂商限制 | 小米关「纯净模式」；给文件管理器开「安装未知应用」权限 |

## 第一次怎么办（旧签名残留）

已经装在手机上的那个包是**旧签名**的，新签名包对它来说依然是「不同的开发者」，
所以**最后一次卸载是躲不掉的**。正确顺序：

1. 打开旧版 App → 「我的」→ **导出备份**（需要图片就勾上「备份包含图片」）；
2. 卸载旧版；
3. 装新签名的包；
4. 打开 → 「我的」→ **导入备份** → 选「合并导入」。

之后就再也不用卸载了。

## 每次发版 Checklist

- [ ] `android/app/build.gradle` 的 `versionCode` **+1**
- [ ] `npm run build && npx cap sync android`
- [ ] `gradlew.bat assembleRelease`
- [ ] `adb install -r <apk>` 在真机上验证数据还在
- [ ] `git status --short` 确认没有把 keystore / properties 带上车

## CI 配置（GitHub Actions，2026-10-16 补）

**为什么必须有这一节**：`.github/workflows/mobile.yml` 的 Android job 在 GitHub
runner 上跑，而 keystore 不提交 → runner 上没有 `keystore.properties` →
debug 包用**每次随机生成**的 debug 钥匙签名。用户从 Actions 下载的包与本地包的
签名对不上 → 覆盖安装被拒 → 只能卸载 → **IndexedDB 全丢**。
（2026-10-16 实际踩中：本地包与 CI 包签名不同，用户报告「每次更新都要卸载重装」。）

修法：把**本地同一把钥匙**配成 GitHub Secrets，CI 构建时还原。
`mobile.yml` 已加好「Restore keystore from secrets」步骤；未配置时 job **直接失败**
（红叉提醒），不再默默产出随机签名包。

### 配置步骤（一次性）

仓库网页 → **Settings → Secrets and variables → Actions → New repository secret**，
加这 4 个（名字必须一字不差）：

| Secret 名 | 值 | 怎么来 |
| --- | --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 base64 | 见下方命令 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 | 生成 keystore 时设的 |
| `ANDROID_KEY_ALIAS` | `dailyschedule` | 生成时的 `-alias` |
| `ANDROID_KEY_PASSWORD` | key 密码 | 生成时设的 |

生成 base64（在仓库根目录的 Git Bash）：

```bash
base64 -w 0 android/dailyschedule.keystore
```

（若 `base64` 不支持 `-w`，用 `openssl base64 -A -in android/dailyschedule.keystore`）
把输出的**一整行**粘进 secret 值里。文件名无所谓，CI 里统一叫 `release.keystore`——
关键是**同一把钥匙**（同一份 base64 内容）。

### 验证

推送后看 Mobile workflow 的 Android job：

- 「Restore keystore from secrets」步骤变绿；
- 「Print APK signing certificate」打印出证书 **SHA-256 指纹**，
  和本地包的指纹一致即签名对齐：

```bash
keytool -printcert -jarfile android/app/build/outputs/apk/debug/app-debug.apk | grep -i SHA256
```

手机上已装包的指纹：`adb shell dumpsys package com.yangzheyuan.dailyschedule | grep -i signatures`。
两个指纹相同 → 覆盖安装可行；不同 → 先走上面的「第一次怎么办」。

> ⚠️ **已经装过旧签名包（含此前 CI 随机签名包）的手机，仍需卸载一次**——
> 这是签名切换的代价，躲不掉。卸载前务必在 App 里「我的 → 导出备份」，
> 装新包后「导入备份 → 合并导入」。之后再也不用卸载。

## 红线

- **不要改 `applicationId`**（= `capacitor.config.ts` 里的 `appId`）。
  改了包名，系统会当成另一个 App → 新沙盒 → 旧数据即使没卸载也读不到。
- **不要提交 keystore**。
- **不要丢 keystore**。丢了它，你就再也发不出能被识别为「官方升级」的包了，
  届时的唯一出路就是让用户卸载重装（数据全丢）。请单独备份到密码管理器或离线介质。
