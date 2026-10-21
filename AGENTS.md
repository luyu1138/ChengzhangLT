# 发布约定

- 用户要求：每次更新迭代仅递增版本号最后一位，例如 `1.1.1 → 1.1.2 → 1.1.3`，不自动升级主版本或次版本。除非用户明确更改要求，后续迭代继续遵循。
- 同步修改 `package.json`、`package-lock.json`、Android `versionName` 与关于页面；Android `versionCode` 每次递增，保证可以覆盖升级。
- 交付时更新当前版本文档，运行相关测试，生成对应版本 APK，更新 `releases/SHA256SUMS`，使用原证书签名以保留升级能力。
- 不将签名私钥、口令、真实 OSS 凭据或恢复码写入 Git、APK、日志或聊天。
