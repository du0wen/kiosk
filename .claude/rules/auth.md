---
paths:
  - "src/lib/auth*.ts"
  - "src/lib/org*.ts"
  - "src/lib/session.ts"
  - "src/app/api/auth/**"
  - "app/api/auth/**"
---

# 认证 / 账号规则(Better Auth)

- Better Auth + Drizzle adapter(`drizzleAdapter(db, { provider: "pg", schema })`)+ `organization()` 插件。**better-auth 当前版本无 apiKey 插件**,API token 用自定义模块。
- 导入路径:`better-auth`、`better-auth/adapters/drizzle`、`better-auth/plugins`、`better-auth/next-js`、`better-auth/react`、`better-auth/client/plugins`。(注意:不是 `@better-auth/*`。)
- **登录**:P1 仅 OAuth(GitHub、Google);无邮箱/密码、无 magic link。
- **Session cookie**:`__Host-` 前缀 + `Secure` + `SameSite=Lax`,host-only 绑 `APP_ORIGIN`;**绝不设 `Domain=父域`**。用 `advanced.cookiePrefix` + `useSecureCookies`。
- **个人 org provisioning**:`databaseHooks.user.create.after` → 动态 import 调 `provisionPersonalOrg(userId, displayName)`,建 1 个 org + 1 条 owner `member`。动态 import 避免 auth.ts ↔ org.ts 循环依赖。
- **API token(自定义)**:`src/lib/token.ts`(`generateToken`/`hashToken`/`createToken`/`verifyToken`)+ `api_token` 表(app 自有)。`kiosk_live_` + 32B 随机;落库存 SHA-256 hash + 展示前缀;Bearer 校验,撤销置 `revoked_at`。前缀有意保留(密钥扫描可识别 + live/test 预留),勿去。
- **CLI 登录 = `oidcProvider` 标准 OAuth**(授权码 + PKCE + loopback,不自定义端点)。端点在 `/api/auth/oauth2/{authorize,token,userinfo}`;`kiosk-cli` 是 trusted **public** client(`skipConsent`,`loginPage:/sign-in`)。登录拿到 oidc access token 后立即 `POST /api/cli/token`(`src/lib/oidc-token.ts` 查 `oauth_access_token` 表校验)换发长效 `kiosk_live_` token;`/api/v1` 鉴权不变。
  - **oidcProvider 已被 better-auth deprecated**(建议迁 `@better-auth/oauth-provider`),但 1.6.x 仍可用、2.0 才移除;P1 决定继续用,迁移列为技术债(升 2.0 时做)。
  - **两个坑(改 auth 前必读)**:① trusted client 必须带 `clientSecret`(取 `BETTER_AUTH_SECRET`)——token 端点总会签 id_token,jose 对空 HMAC key 抛错;`type:"public"` 下该 secret 不参与 CLI 鉴权(纯 PKCE)。② `oauth_access_token.client_id` 有 FK → `oauth_application.client_id`,而 trusted client 不在库里 → 迁移 `0005` 播一行 `kiosk-cli` 的 `oauth_application`(仅作 FK 锚点,列不被读)。
  - **redirect_uri 精确匹配**(无 RFC 8252 端口豁免):固定候选口 8976/8977/8978,三者都要登记进 `trustedClients.redirectUrls`。
  - `auth:generate` 会重写 `src/db/schema/auth.ts`(含 3 张 oauth 表 + relations);`db:generate` 遇「1 删 + N 建」会交互式问 rename,无 TTY 时用「临时 `git checkout HEAD -- auth.ts` 生成删表迁移 → 还原 → 生成建表迁移」的两步法。
- **授权**:每个动作作用域到 caller user → 其 org;页面校验 `page.organization_id === callerOrgId`。P1 每人恰好一个 org。
- 组织内角色(owner/admin/member)是 **P2**;与"系统/平台管理员"(跨租户 trust & safety)是两个维度。
