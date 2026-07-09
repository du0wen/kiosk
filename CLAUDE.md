# Kiosk

给 AI 编码工具(Claude Code / Codex 等)用的发布 skill:AI 生成**自包含 HTML** → 一键发布成**公开可分享链接**,支持同 URL 更新。补 Claude artifact「只能组织内看、无法公开分享」的短板。最终形态是多租户 SaaS(P1→P4)。

## 当前状态
- **P1 代码完成(6 份计划 + 4b′ oidc 登录重构全部落地)**:1 Foundation · 2 Publish API · 3 Serving · 4 CLI · 4b′ CLI oidc 登录(Better Auth oidcProvider,取代自定义 cli-auth)· 5 Skill 打包 · 6 Console+i18n。**77 测试通过,build 干净。**
- 全链路:AI 装 skill → 生成自包含 HTML → `kiosk publish`(`kiosk login` = oidcProvider 授权码+PKCE+loopback,登录后换发长效 `kiosk_live_` token;或 `KIOSK_TOKEN`)→ REST v1 存 Neon → `/p/<id>` 严格 CSP serving;控制台管理页面/token(EN/ZH)。
- **端到端未跑通(需手动 + 凭据)**:OAuth 登录、CLI oidc 登录、真实 publish→serving —— 都需 GitHub/Google OAuth 凭据 + 浏览器;服务端 oidc 端点已冒烟(discovery / authorize→/sign-in / mint 401)。部署你自管。
- Spec(定稿):`docs/specs/2026-07-08-kiosk-p1-publish-core-design.md` —— **动非平凡代码前先读它**。实现计划见 `docs/plans/`。

## 技术栈
TypeScript · pnpm · Next.js(App Router,单应用)· Drizzle ORM · Neon Postgres(`drizzle-orm/neon-serverless`)· Better Auth(organization 插件)+ 自定义 API token · Vitest。部署 Vercel + Neon(可移植 Docker)。

## 命令
- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test`(Vitest,`*.test.ts`)/ `pnpm test:watch`
- `pnpm db:generate` + `pnpm db:migrate`(Drizzle) / `pnpm auth:generate`(Better Auth schema)

## 硬约束(始终生效)
- **提交/PR 不带任何 AI 署名**(无 Co-Authored-By、无 "Generated with…")。
- **TDD**:先写失败测试再实现;DRY、YAGNI。
- **模块单一职责**:严守每个文件/模块的功能边界,别来回挪职责。
- **流程**:spec → plan → code。没有已批准的计划,不写实现代码。
- **两个源**:`APP_ORIGIN`(控制台+API)与 `SERVE_ORIGIN`(公开 serving)是**两个独立可注册域名**;app session cookie 用 `__Host-` 前缀绑 `APP_ORIGIN`,**绝不设到父域**。
- **发布单位** = 单个自包含 HTML;serving 用**严格 CSP**(禁一切外部网络)。
- **id**:`pages.id` = uuidv7(应用侧生成);auth 表用 Better Auth 默认 text id(不加表前缀);`public_id` = nanoid base62 12 位(= 公开 URL id = API `:id`)。
- **加密/隐私**:P1 只做基线(TLS + Neon 静态加密);隐私靠**访问控制**;E2E 不做、不预留。

## 模块地图
详细规则在 `.claude/rules/`,按路径**自动按需加载**(碰到对应文件才进上下文),不必在此重复。

| 模块 | 主要路径 | 规则文件 | 计划 |
|---|---|---|---|
| 数据层 | `src/db/**` | `data-model.md` | 1 |
| 认证/账号 | `src/lib/auth*`,`org*`,`src/app/api/auth/**` | `auth.md` | 1 |
| 发布 API | `src/app/api/v1/**` | `api.md` | 2 |
| 公开 serving | serving 路由 + `middleware.ts` | `serving.md` | 3 |
| CLI | `cli/**` | `cli.md` | 4 |
| 控制台 + i18n | `src/app/(console)/**`,`src/i18n/**` | `console.md` | 6 |

<!-- 维护者备注:root 只放"始终生效"的项;模块细节一律进 .claude/rules/ 的 path-scoped 文件,避免 root 膨胀(目标 <100 行)。 -->
