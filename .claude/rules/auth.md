---
paths:
  - "src/lib/auth*.ts"
  - "src/lib/org*.ts"
  - "src/lib/session.ts"
  - "src/app/api/auth/**"
  - "app/api/auth/**"
---

# 认证 / 账号规则(Better Auth)

- Better Auth + Drizzle adapter(`drizzleAdapter(db, { provider: "pg", schema })`)+ `organization()` + `apiKey({ defaultPrefix: "kiosk_live_" })` 插件。
- 导入路径:`better-auth`、`better-auth/adapters/drizzle`、`better-auth/plugins`、`better-auth/next-js`、`better-auth/react`、`better-auth/client/plugins`。(注意:不是 `@better-auth/*`。)
- **登录**:P1 仅 OAuth(GitHub、Google);无邮箱/密码、无 magic link。
- **Session cookie**:`__Host-` 前缀 + `Secure` + `SameSite=Lax`,host-only 绑 `APP_ORIGIN`;**绝不设 `Domain=父域`**。用 `advanced.cookiePrefix` + `useSecureCookies`。
- **个人 org provisioning**:`databaseHooks.user.create.after` → 动态 import 调 `provisionPersonalOrg(userId, displayName)`,建 1 个 org + 1 条 owner `member`。动态 import 避免 auth.ts ↔ org.ts 循环依赖。
- **API token**:apiKey 插件;`auth.api.createApiKey`(返回明文 `key`,只显示一次)、`auth.api.verifyApiKey`。前缀 `kiosk_live_`,落库存 hash + 前缀。
- **授权**:每个动作作用域到 caller user → 其 org;页面校验 `page.organization_id === callerOrgId`。P1 每人恰好一个 org。
- 组织内角色(owner/admin/member)是 **P2**;与"系统/平台管理员"(跨租户 trust & safety)是两个维度。
