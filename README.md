# 成长蓝图 · Android 本地版

按照 [V1.0 产品设计](docs/产品设计-V1.0.md)实现的个人与家庭成长管理应用。首版提供多人档案、目标规划、行动与习惯、成果记录、周期复盘和加密备份。**用户已确认先交付本地版；阿里云盘未申请准入，自动同步未开放。** 应用不会上传成长数据。

**验证状态：** 36 项领域/备份、9 项浏览器流程、4 项 Android 加密存储测试通过；云模拟器中 2 项独立 WebView 引擎测试失败，完整 APK 界面及重启流程尚未验收。详见 [验证限制](docs/交付与测试.md)。

## 安装

下载本地签名试用包 [成长蓝图-v1.0.0.apk](releases/成长蓝图-v1.0.0.apk)，在 Android 系统中允许安装该来源的应用后打开。最低 Android 8.0（API 26），需要 Android System WebView / Chrome 110 或更新版本。APK 支持各 CPU 架构，无网络运行依赖，不申请通讯录、定位或通用文件存储权限。

这是使用独立本地签名证书打包的可安装 release 版本，未上传应用商店。证书摘要和 APK 校验值见 [交付说明](docs/交付与测试.md)及 [SHA256SUMS](releases/SHA256SUMS)。私钥和口令保存在构建环境的 `/workspace/.tools/signing/`，不进入 Git；后续覆盖安装必须使用同一证书。正式渠道发布应接入产品方保管的签名密钥。

## 本地功能

- **多人首页**：独立人物 ID、昵称/关系/时区/关注点、搜索、置顶与排序、年度进度、今日行动、近期记录、复盘提示；档案归档、回收站、恢复及彻底删除。
- **规划**：长期、年度、季度及近期目标；同人物父子关联、防循环与周期约束；增长、降低、里程碑、频次和五级量表；权重与覆盖率、时间预算、基础/挑战目标、草稿激活、人工验收、暂停与终止。
- **可追溯调整**：调整原因、前后影响预览、目标版本及历史；年度统计范围显式修订，暂停与终止不自动移除目标。
- **行动**：一次性任务、每日、每周指定星期、每周 N 次、每月指定日和间隔习惯；幂等完成、撤销、保留原计划的改期、习惯暂停、按人物或全部人物查看。
- **记录**：成果与行动分开计量；最新状态或累计增量、补录、同一观察时点冲突确认；PNG/JPEG/PDF 证据附件。单文件 ≤5MB，全部附件 ≤10MB；文件类型、归属和摘要校验。
- **复盘**：周/月/季/年复盘，草稿与发布、冻结快照与修订、下周期重点转行动；Markdown、CSV 明文导出及 Android 打印/PDF 阅读版。
- **安全**：Android Keystore、AES-256-GCM 加密 SQLite 载荷，业务快照与 outbox 在同一事务写入；关闭系统备份，可开启截图保护；设备本地每日提醒，尊重通知权限与安静时段。
- **备份**：独立 256 位随机恢复码、认证加密导出、错误密钥/密文/新格式拒绝、附件 SHA-256 校验、预览后显式切换空间。

首次启动没有演示人物或虚构进度。添加家人档案需确认有记录与管理授权。复盘中的数字不会因后续补录和目标调整而改变。没有有效指标时显示待补充，部分指标缺失时单独展示已知进度与覆盖率。

## 开发与构建

界面采用 React 19 + TypeScript + Vite；Android Java 外壳负责受限 WebView、系统安全密钥、加密 SQLite、系统文件选择/保存、通知和 PDF。采用这一 Android 优先实现以交付离线 APK；没有采用设计中建议但非强制的 Flutter，当前不包含 iOS 工程。

需要 Node 22+、Python 3.12+、JDK 21、Android SDK 35 / Build Tools 35.0.0。Linux 云环境的初始化命令：

```bash
cd /workspace/ChengzhangLT
python3 scripts/setup-cloud.py
source scripts/cloud-env.sh
npm ci --cache /workspace/.tools/npm-cache
npm test
npm run android:debug
```

已有本机 Android SDK 时设置 `JAVA_HOME`、`ANDROID_HOME`，使用 `android/gradlew` 即可。Gradle wrapper 固定 8.13 并校验官方 SHA-256。初始化脚本保留 TLS 和下载校验，Java 下载器使用当前环境的代理与受信证书。

```bash
npm run dev               # 浏览器开发；浏览器存储使用 WebCrypto 加密 IndexedDB
npm run build             # TypeScript 检查与离线资源构建
npm test                  # 领域和备份测试
npm run test:e2e           # UI 自动化；默认 /usr/bin/chromium，可设置 CHROMIUM_PATH
npm run android:test       # 已启动的专用 Android 模拟器上的平台测试（存储 + WebView）
npm run android:smoke      # 安装 debug APK，验证界面和强制重启持久化；仅用于空白测试模拟器
npm run android:release    # 构建并签名 release APK，输出到 releases/
```

`android:test` 会清空测试安装的数据库，`android:smoke` 会清空专用模拟器中的本应用数据；勿在有真实数据的设备上运行。Android 实机签名通过环境变量 `BLUEPRINT_KEYSTORE`、`BLUEPRINT_STORE_PASSWORD`、`BLUEPRINT_KEY_ALIAS`、`BLUEPRINT_KEY_PASSWORD` 注入，不将私钥或口令写入源码。

每个云任务已经隔离，使用现有 checkout，无需建立额外 Git worktree。编译结果、SDK 与签名材料为保留文件；模拟器、开发服务器、adb 等进程需在新任务中重新启动。

## 使用与数据边界

当前没有云备份或跨设备自动同步；手动加密备份是独立功能。恢复时会替换当前空间，不静默合并，请先备份当前空间。恢复码丢失无法由运营方找回；卸载应用会丢失本机数据与设备密钥。

彻底删除只覆盖当前应用管理的本机实体、附件和日志；已导出或复制的文件需要自行清理。应用层删除不承诺对存储介质残留进行取证级抹除。

设计中的完整云协议、设备撤销/密钥轮换、云快照保留、真实双设备故障注入，以及 50 人物/10 万记录的中端机性能验收，均不在本地版已验证能力中。具体交付范围与未验收项见 [交付与测试](docs/交付与测试.md)。
