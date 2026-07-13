# Kiosk

给 AI 编码工具(Claude Code / Codex 等)用的发布 skill:AI 生成**自包含 HTML** → 一键发布成可分享链接(**默认组织私有,可显式设为公开**),支持同 URL 更新。补 Claude artifact「只能组织内看、无法公开分享」的短板。最终形态是多租户 SaaS(P1→P4)。

## 当前状态
- **P1 代码完成(6 份计划 + 4b′ oidc 登录重构全部落地)**:1 Foundation · 2 Publish API · 3 Serving · 4 CLI · 4b′ CLI oidc 登录(Better Auth oidcProvider,取代自定义 cli-auth)· 5 Skill 打包 · 6 Console+i18n。**77 测试通过,build 干净。**
- 全链路:AI 装 skill → 生成自包含 HTML → `kiosk publish`(`kiosk login` = oidcProvider 授权码+PKCE+loopback,登录后换发长效 `kiosk_live_` token;或 `KIOSK_TOKEN`)→ REST v1 存 Neon → `/p/<id>` 严格 CSP serving;控制台管理页面/token(EN/ZH)。
- **端到端已跑通(真人真机验证)**:`kiosk login`(oidc + Google)→ `kiosk publish` → 浏览器访问 `SERVE_ORIGIN/p/<id>`(严格 CSP)全链路 OK。部署你自管。
- **P2 代码完成(5 份计划全部落地)**:组织与权限 —— 多成员 org + active org 切换、链接式邀请(`/invite/[id]`)、角色鉴权(owner/admin/member;member 只能删/改自己建的页)、**页面可见性**(默认 `org` 私有 / 显式 `public`;org 页经 **serve 源签名令牌门**鉴权,serve 仍 0 cookie)、页面版本快照(只读历史)。CLI 加 `--public`/`share`/whoami role;控制台加成员页/可见性开关/历史。**102 测试通过,build + cli tsc 干净。** P2 手动 e2e(邀请、org 页登录门)需浏览器 + 第二账号,未跑。
- **Serving v2(品牌外壳)代码完成**:分享链接改为 app 域品牌外壳 **`/v/<id>`**,内嵌 `sandbox` iframe 指向独立 serve 域的裸 `/p/<id>`(照 Claude artifacts 同构:独立域 + sandbox 双层隔离)。org 页由外壳现签 serve-token;发布返回 `url`=外壳 + `rawUrl`=裸(`pageShellUrl`/`pageRawUrl`)。`/serve-auth` 降级为直连兜底。**103 测试通过。**
- **P3 导出:app 侧完成(P3-1),渲染服务待做(P3-2)**:`GET /api/v1/pages/:id/export?format=md|html|pdf|png|jpeg`(token)+ 控制台 `/pages/:id/export`(session)+ Export▾ + CLI `kiosk export`;成员+归属鉴权。**MD/HTML 已可用**(本地 turndown);**PDF/PNG/JPEG 需 `render/` 微服务(P3-2,未建)** —— 缺它时优雅降级 502。口子在 `src/lib/export.ts` `renderRemote` + `render/README.md`(契约)。**117 测试通过。**
- **P4 组织主题/品牌代码完成**:`org_settings` 表(主题色 + 导出水印,hex 校验);`/settings` owner/admin 配置(`can("org.update")`);`/v` 外壳按所属 org 显品牌名(=`organization.name`)+ 主题色;导出水印 HTML 页脚即时生效、PDF/图透传渲染服务(待 P3-2)。文字+颜色,无 logo/blob。**测试通过。**
- **路线图 P1–P4 全部设计+落地**(仅 **P3-2 渲染微服务**未建=PDF/图暂 502,+ 上线两项按需)。
- Spec:P1 `docs/specs/2026-07-08-kiosk-p1-publish-core-design.md`、P2 `docs/specs/2026-07-10-kiosk-p2-orgs-permissions-design.md`、Serving v2 `docs/specs/2026-07-12-kiosk-serving-v2-branded-shell-design.md`、P3 `docs/specs/2026-07-13-kiosk-p3-export-design.md`、P4 `docs/specs/2026-07-13-kiosk-p4-org-themes-design.md` —— **动非平凡代码前先读**。实现计划见 `docs/plans/`。

## 上线待办
- **CLI `DEFAULT_API_BASE`**(`cli/src/config.ts`):现为占位 `http://localhost:3000/api/v1`(既非本地 58671 也非线上域名)。正式发布前改成线上 API 域名 `https://<域名>/api/v1`,用户装完 CLI 不设 env、`kiosk login` 即直连生产。覆盖优先级 `KIOSK_API_BASE`(env)> `~/.config/kiosk/config.json` 的 `apiBase`(login 时持久化)> 该默认值;本地调试用前两者。域名待定。

## 技术栈
TypeScript · pnpm · Next.js(App Router,单应用)· Drizzle ORM · Neon Postgres(`drizzle-orm/neon-serverless`)· Better Auth(organization 插件)+ 自定义 API token · Vitest。部署 Vercel + Neon(可移植 Docker)。

## 命令
- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm test`(Vitest,`*.test.ts`)/ `pnpm test:watch`
- `pnpm db:generate` + `pnpm db:migrate`(Drizzle) / `pnpm auth:generate`(Better Auth schema)
- CLI 本地跑:`node cli/bin/kiosk.mjs <cmd>`(需先 `pnpm -C cli build`)或免构建 `pnpm exec tsx cli/src/cli.ts <cmd>`。

## 本地 dev serving(两源同端口)
app 与 serving 是两个 origin(cookie 隔离),本地用**同端口不同 hostname**,一个 dev server 全包:
- `.env`:`SERVE_ORIGIN=http://serve.kiosk.test:58671`(APP 仍 `localhost:58671`,故 OAuth 回调/CLI apiBase 不变)。
- `/etc/hosts` 加 `127.0.0.1  serve.kiosk.test`(用 `.test`,别用 `.local`——macOS mDNS 会拦)。
- 页面看 `http://serve.kiosk.test:58671/p/<id>`;app 的 `/p/*` 会 302 到该域。

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
