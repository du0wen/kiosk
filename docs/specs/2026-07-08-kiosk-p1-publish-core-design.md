# Kiosk P1 — 发布内核 + 账号 · 设计 spec

- 状态:待 review
- 日期:2026-07-08
- 范围:P1(MVP)。P2/P3/P4 仅作上下文,不在本 spec 实现范围内。

---

## 0. 背景与目标

### 0.1 动机
Claude Code 的 artifact 只能在**组织内**查看,无法对外**公开分享**。Kiosk 补这个短板:让 AI 编码工具(Claude Code / Codex 等)生成 HTML 后**一键发布成公开可分享链接**。

### 0.2 一句话
Kiosk = AI 生成自包含 HTML → 发布 → 拿到一个"知道链接就能看"的公开 URL,支持**同 URL 更新**。

### 0.3 整体阶段拆分(上下文,不推翻)
- **P1(本 spec)**:发布内核 + 账号。账号/登录 + API token、Claude Code & Codex skill(POST HTML → 公开链接)、存储 + 公开 serving + 同 URL 更新、页面列表;数据模型从一开始按多租户预留。
- **P2**:组织 & 权限(建组织、邀请、成员角色、页面 read/write/share、对非成员可见性)。
- **P3**:导出(MD/HTML 从源生成 + PDF/PNG/JPEG 走无头浏览器渲染服务)。
- **P4**:批注 & 组织主题。

### 0.4 P1 目标 / 非目标
**目标**:跑通完整发布闭环 + 账号体系;数据结构按多租户全量预留,使 P2 变成纯增量。
**非目标**:组织 UI、页面级权限、导出、批注、主题、计费、自定义 slug/域名、多文件/外链、版本历史。见 §7.7。

---

## 1. 系统架构

### 1.1 组件
一个 Next.js(App Router)应用 + 一个独立发布的 CLI:

| # | 组件 | 落点 | 职责 |
|---|---|---|---|
| 1 | 控制台 Web | `APP_ORIGIN` | OAuth 登录、API token 管理、页面列表 |
| 2 | REST API | 同应用 Route Handlers `/api/v1/*` | 发布 / 更新 / 列表 / 删除;CLI 与 curl 共用 |
| 3 | 公开 serving | `SERVE_ORIGIN`(独立域名) | 按 `public_id` 渲染用户 HTML,注入严格 CSP + noindex |
| 4 | `@kiosk/cli`(占位包名),bin=`kiosk` | npm | skill 主路径:读文件 → 调 API → 打印链接;管理本地 `.kiosk/pages.json` |
| 5 | skill 说明 | Claude Code `SKILL.md` + Codex 等价说明 | 指挥 AI"写文件 → 跑 `kiosk publish` → 把链接给用户" |

### 1.2 存储与部署
- **存储**:Neon Postgres 单库。`pages` 表 + Better Auth 托管表同库。HTML 直接存 `pages.content_html`(P1)。
- **部署**:Vercel。选用 Next.js 意味着 `next start`/standalone 产物可移植到 Docker,不锁死 Vercel。
- **边界预留**:P3 的无头浏览器导出服务是独立 Docker 服务,不在 P1;未来它通过抓取 `SERVE_ORIGIN/p/<id>` 渲染,本 serving 设计已能满足。

### 1.3 域名 / 源约束(硬约束)
- 控制台/API = `APP_ORIGIN`;公开 serving = `SERVE_ORIGIN`。
- **`SERVE_ORIGIN` 必须是与 `APP_ORIGIN` 不同的、独立可注册域名**(类比 `github.com` + `githubusercontent.com`)。原因:若共用父域(`app.x.com` + `k.x.com`),被服务的恶意页面即便有严格 CSP,仍可 `document.cookie="...; domain=.x.com"` 向父域塞 cookie(cookie-tossing)污染控制台;两个独立可注册域名从根上杜绝这条路径。
- 弱化兜底(不推荐):若只用一个域名的两个子域,必须把 session cookie 设为 host-only(`__Host-` 前缀),并接受上述残余风险。
- 具体域名归运维决定,spec 内一律用占位符 `APP_ORIGIN` / `SERVE_ORIGIN`(env 配置项)。

### 1.4 数据流
**发布**:
```
AI 写出 page.html
  → kiosk publish page.html
  → CLI 读 token + .kiosk/pages.json 里的 id 映射
  → POST /api/v1/pages(新建) 或 PUT /api/v1/pages/:id(更新)
  → 写 Neon,返回 { public_id, url }
  → CLI 打印 https://SERVE_ORIGIN/p/<public_id>
  → AI 把链接转达用户
```
**查看**:
```
访客打开链接 → SERVE_ORIGIN 按 public_id 取活跃页
  → 加 CSP + X-Robots-Tag: noindex 等响应头 → 返回 HTML
```

---

## 2. 发布闭环(skill / CLI ↔ API)

### 2.1 发布单位
**一个自包含 HTML 文件**(CSS/JS/图片/字体全部内联,与 Claude artifact 产物一致)。多文件/外部资源不在 P1(见 §5.3 CSP 与此一致)。

### 2.2 CLI 命令面(`kiosk`)

| 命令 | 作用 |
|---|---|
| `kiosk login` | 交互粘贴 token → 打 `GET /api/v1/me` 校验 → 存 `~/.config/kiosk/config.json`(权限 600)。`KIOSK_TOKEN` 环境变量优先 |
| `kiosk publish <file>` | **核心**。读 token → 解析页面身份 → 传 HTML → 打印公开 URL |
| `kiosk list` | 列出我的页面(id / title / url / 更新时间),`--json` |
| `kiosk open <id\|file>` | 浏览器打开公开链接 |
| `kiosk delete <id\|file>` | 下架(软删)并移除本地映射;非 `--yes` 时二次确认 |
| `kiosk install-skill [--claude] [--codex]` | 把 skill 文件写进对应工具(§2.5) |
| `kiosk whoami` / `kiosk logout` | 辅助 |

**`publish` 身份解析顺序**:
1. `--id <id>` → 更新该页(PUT)
2. `--new` → 强制新建(POST),然后写回映射
3. 否则查 `.kiosk/pages.json`(从文件所在目录向上找最近的 `.kiosk/`),命中 → 更新;未命中 → 新建并写回映射

**输出**:默认**只打印 URL 一行**(便于 AI 抓取);`--json` 给结构化;可选 `--title`、`--open`。

**配置文件** `~/.config/kiosk/config.json`:`{ token, apiBase }`;`apiBase` 可被 `KIOSK_API_BASE` 覆盖(自托管/本地开发)。

**本地映射** `.kiosk/pages.json`:`{ version: 1, pages: { "<相对路径>": { id, url } } }`。P1 不自动改 `.gitignore`;文档说明:提交它 = 任何 checkout 都能更新同一页,忽略它 = 仅本地。

**meta 标签(opt-in)**:若 HTML 内含 `<meta name="kiosk-id" content="...">`,`publish` 优先按它更新(power user 把身份钉进文件用)。默认路径仍是状态文件。

### 2.3 REST API(`/api/v1/*`,CLI 与 curl 共用)
鉴权:`Authorization: Bearer kiosk_live_xxx`(自定义 `verifyToken()` 校验),每请求作用域 = token 所属 user → 其 org。

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/v1/pages` | 新建。body = 原始 `text/html`;标题可选 `X-Kiosk-Title` 头,缺省服务端从 `<title>` 或文件名推断。→ `201 { id, url, createdAt }`;超 2MB → `413` |
| `PUT` | `/api/v1/pages/:id` | 覆盖更新(须属调用者 org)。→ `200 { id, url, updatedAt }`;不存在/无权 → `404` |
| `GET` | `/api/v1/pages` | 列表(游标分页) |
| `GET` | `/api/v1/pages/:id` | 单页元数据 |
| `DELETE` | `/api/v1/pages/:id` | 软删下架 → `204` |
| `GET` | `/api/v1/me` | 校验 token + 返回 user/org(供 `kiosk login`) |

**关键简化**:API 里的 `:id` 就是 URL 里那串 `public_id`——链接里看到的 id 就是 API 用的 id,内部 uuid 主键不外露。
**错误**:统一 `{ error: { code, message } }` + 正确 HTTP 状态;CLI 转成友好提示 + 非零退出码。

### 2.4 curl 兜底(API 自带,非主路径)
```
# 新建
curl -sS -X POST https://APP_ORIGIN/api/v1/pages \
  -H "Authorization: Bearer $KIOSK_TOKEN" -H "Content-Type: text/html" \
  --data-binary @./page.html
# 更新
curl -sS -X PUT https://APP_ORIGIN/api/v1/pages/<id> \
  -H "Authorization: Bearer $KIOSK_TOKEN" -H "Content-Type: text/html" \
  --data-binary @./page.html
```
`--data-binary @file` 从文件直读,无 shell 转义问题。curl 路径下"同 URL 更新"需调用方自行记住 id(这正是 CLI 主路径要替代的部分)。

### 2.5 skill 打包(产品本体)
两份产物,均由 `kiosk install-skill` 落地:
- **Claude Code**:写 `.claude/skills/kiosk/SKILL.md`(name=`kiosk`,desc="publish an HTML page to a public shareable URL")。内容指挥 AI:确认 CLI 可用且已鉴权(否则提示用户 `kiosk login` 或设 `KIOSK_TOKEN`)→ 把自包含 HTML 写文件 → 跑 `kiosk publish <file>` → 把打印出的 URL 交给用户。
- **Codex**:写其等价说明文件(Codex 的 AGENTS.md / 配置那套),同样指挥用 `kiosk` CLI。
- skill 文档 P1 保持**英文**(见 §6.5 i18n 范围)。

### 2.6 端到端 onboarding
1. 控制台 OAuth 登录 → 2. 建 token 复制 → 3. `npm i -g @kiosk/cli`(或 npx)→ 4. `kiosk login` → 5. `kiosk install-skill` → 6. 在 Claude Code/Codex 里说"发布这个页面",AI 跑 `kiosk publish` 拿回公开链接。

---

## 3. 数据模型

单库 Neon Postgres。Better Auth 托管表 + App 自有表,同库、走同一套 Drizzle 迁移(Better Auth 有 Drizzle adapter,其生成 schema 纳入我们的 Drizzle schema 文件统一迁移)。

### 3.1 Better Auth 托管表(不手写,由其 schema 生成)
- 核心:`user` / `session` / `account` / `verification`
- (注:better-auth 当前版本**无 apiKey 插件**;API token 改为 App 自有表 `api_token`,见 §4.2)
- organization 插件:`organization` / `member`(userId, organizationId, role)/ `invitation`

**id 策略**:auth 表**保持 Better Auth 默认 text id**(nanoid 风格)。这些表写入率低,text id 无性能问题;不为统一而折腾。`user.id`、`organization.id` 均为 text,故下方外键为 text。

### 3.2 App 自有表 `pages`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK,**uuidv7,应用侧生成**(Drizzle `$defaultFn` + uuidv7 库,不用 `gen_random_uuid()`) | 内部主键;pages 是我们掌控的高写入表,用时间有序 id 保插入局部性 |
| `public_id` | text UNIQUE NOT NULL | URL 里那串 id;app 侧 nanoid base62 ~12 位;API 的 `:id` 即它 |
| `organization_id` | text NOT NULL → `organization.id` | 归属组织(P1 = 个人 org) |
| `created_by` | text NOT NULL → `user.id` | 创建者 |
| `title` | text NULL | 取自 `<title>` 或文件名 |
| `content_html` | text NOT NULL | 正文(≤2MB;Postgres TOAST 扛大文本) |
| `size_bytes` | integer NOT NULL | 字节数,做上限校验 + 列表展示 |
| `content_hash` | text NULL | 可选:内容 sha256,用于跳过"内容没变的重复发布"(no-op 短路) |
| `view_count` | integer NOT NULL default 0 | best-effort 总浏览计数(§6.4) |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | |
| `deleted_at` | timestamptz NULL | 软删/下架;serving 与列表均过滤它 |

**索引**:`public_id` 唯一;`organization_id`;`(organization_id) where deleted_at is null` 部分索引。
**public_id 生成**:app 侧 nanoid base62 ~12 位(≈ 62¹² 量级,防枚举 + 几乎不撞);唯一冲突时重试。

### 3.3 个人 org provisioning(org-first 关键)
- 注册后钩子:建一个 `organization`(名如 "<用户>'s workspace")+ 一条 `member`(该用户,role=owner),设为其 active org。
- **token → org 解析**:P1 一个用户恰好一个 org,发布时按调用者的(唯一)membership 解析 `organization_id` 写进 `pages`。P2 用户可多 org 时,再引入"按 token 指定 org / active org";`pages` 表结构此刻已就位,不改表。

### 3.4 多租户预留结论
P2 的组织/成员/邀请/角色在表层已全部就位(`organization`/`member`/`invitation` + `pages.organization_id`),P2 = 开 UI + 邀请流 + 角色鉴权,**零数据迁移、不动 ownership 语义**。

---

## 4. 账号 / 认证 / token

### 4.1 控制台登录
- Better Auth + OAuth:**GitHub、Google** 两个 provider。流程:OAuth 跳转 → callback → 建 `user`/`account`/`session` → 注册钩子建 personal org(§3.3)。
- **Session cookie**:host-only 绑死 `APP_ORIGIN`,`__Host-` 前缀 + `Secure` + `SameSite=Lax`,**绝不设 `Domain=父域`**。
- P1 不做邮箱/密码;magic link / 密码登录以后加配置即可,不阻塞。
- **CSRF**:API 用 bearer token(非 cookie),CSRF 不适用;控制台变更操作用 session cookie,依赖 Better Auth 的 CSRF 防护 + `SameSite=Lax`。

### 4.2 API token(自定义模块:`src/lib/token.ts` + `api_token` 表)
- 控制台"新建 token":起名 → 生成 `kiosk_live_<random>`,**明文只显示一次**;落库存 hash + 前缀(展示成 `kiosk_live_abc…`)。前缀留 `live` 为以后可能的 `kiosk_test_` 沙箱 token。
- **scope**:P1 一律账号全权限(发布/列表/更新/删自己 org 的页),不做细粒度 scope。
- **撤销**:控制台列出所有 token(名字/创建/最后使用),可逐个撤销;撤销后立即 401。
- **校验**:`Authorization: Bearer kiosk_live_xxx` → `verifyToken()` 查 hash → 解析 user → 解析 org。落库存 SHA-256 hash + 展示前缀;撤销置 `revoked_at`。

### 4.3 授权模型(P1)
- 每个 API/控制台动作作用域到 **调用者 user → 其 org**。
- 页面访问校验:`page.organization_id` 必须等于调用者 org(P1 = 其唯一 org);`created_by` 记录创建者。
- P2 再叠**组织内**角色(owner/admin/member)与页面级 read/write/share——`member.role` 列已就位。注:组织内角色是**租户内部**维度,与 §5.5 的**系统/平台管理员**(跨租户、Kiosk 运营方)是两回事。

### 4.4 CLI 鉴权握手(Better Auth 标准 OAuth + 长效 api_token)
- **`kiosk login`(交互默认)= Better Auth `oidcProvider` 标准授权码 + PKCE + loopback**(对齐 Claude Code,零自定义 OAuth 路由):CLI 是 trusted 一方 **public client**(`kiosk-cli`,`token_endpoint_auth_method: none`,`skipConsent: true`),生成 PKCE(S256)+ state,起本地 loopback server,开浏览器到 `APP_ORIGIN/oauth2/authorize?…`;未登录经插件 `loginPage=/sign-in` 走 OAuth,**登录后插件自动续授权流、免同意页** → 302 回 loopback 带 `code` → CLI `POST /oauth2/token`(带 code_verifier)拿 oidc access token。
- **登录尾换长效凭据**:CLI 拿到 oidc token 后**立即用它调一个已认证的"建 token"接口,铸一个长效 `kiosk_live_` api_token**,存 config;**后续所有 `/api/v1` 调用一律用 api_token**(`verifyToken` 不改)。oidc 只负责登录/证明身份,不进 API 热路径(其 access token 不透明、只能 userinfo 往返校验,不适合逐调用鉴权;且会过期)。
- **loopback 端口 = 固定候选**:Better Auth oidcProvider 的 redirect_uri **精确匹配**(源码 `url === redirect_uri`,不遵守 RFC 8252 忽略端口),故 trusted client 的 `redirectUrls` 注册一组候选(`http://127.0.0.1:{8976,8977,8978}/callback`),CLI 绑第一个空闲端口、用对应 URL。SSH/容器无 loopback 时的 paste 兜底留作后续。
- **`KIOSK_TOKEN` / `kiosk login --token <t>` = headless/agent/CI 兜底**(长效 api_token,控制台或本流程生成);优先级 env > config。二者叠加:浏览器流是人机交互默认,token env/config 供无头。

### 4.5 serving 与鉴权解耦
公开 serving(`SERVE_ORIGIN`)**完全不碰**这套鉴权——只按 `public_id` 读活跃页返回 HTML,无 cookie、无 session。

---

## 5. 公开 serving 与安全

### 5.1 host 分离(一套部署、两个源)
Next.js middleware 按 `Host` 分流,互不越界:
- **`SERVE_ORIGIN`**:只放 `/p/*`、`/report`、健康检查、favicon;其余 404。
- **`APP_ORIGIN`**:控制台 + `/api/*`;`/p/*` 若被访问 → 302 到 `SERVE_ORIGIN`。

### 5.2 渲染响应 `GET /p/<public_id>`
按 `public_id` 查活跃页(`deleted_at is null`),命中回存的 `content_html` + 下列头;查不到/已删/超限 → 统一 404 页。
```
Content-Type: text/html; charset=utf-8
Content-Security-Policy: <见 5.3>
X-Robots-Tag: noindex, nofollow
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```
**不设** `X-Frame-Options`、CSP 不限 `frame-ancestors` → 页面可被别处 `<iframe>` 嵌入(分享正向用法)。
> 对比:**控制台**(`APP_ORIGIN`)响应设 `frame-ancestors 'none'`(或 `X-Frame-Options: DENY`)防被嵌入点击劫持。只有 serving 是可嵌入的。

### 5.3 严格 CSP(核心)
```
default-src 'none';
script-src 'unsafe-inline' 'unsafe-eval' blob:;
style-src  'unsafe-inline';
img-src    data: blob:;
font-src   data:;
media-src  data: blob:;
connect-src 'none';
form-action 'none';
base-uri   'none';
frame-src  'none';
```
- 允许**内联 JS/CSS、`data:`/`blob:` 资源** → 页面照常有交互、内联图片/字体/音视频。
- `connect-src 'none'` + `form-action 'none'` = **打不出外部网络、表单也提交不出去** → 挡掉数据外泄、外部 API、表单钓鱼。
- `img/font/media` 仅 `data:`/`blob:` → 无外链追踪像素。与"自包含 HTML"同一套要求。
- `'unsafe-eval'` 为兼容框架/eval 的页面保留;因 `connect-src 'none'` 数据发不出去,残余风险有限。
- **已知残余风险**:内联 JS 仍可跑,理论上 CPU 挖矿或纯前端假页面(但无法提交/外发)→ 靠举报 + 下架兜底,运行时限额列为以后硬化项。

### 5.4 缓存与更新一致性
正文在 Postgres,每次服务是一次 DB 读。用 **CDN 缓存 + 缓存标签**:以 `public_id` 为 tag;`publish/更新/删除` 时 `revalidateTag(public_id)` → 读走缓存快,更新后立即新鲜。(Vercel/Next.js 原生;将来搬 Docker 换等价 Cache-Control + 主动 purge。)

### 5.5 滥用处置
- 默认 `noindex`,降低被拿去做 SEO/钓鱼的价值。
- **举报**:带外入口 `/report?id=<public_id>`(控制台侧表单)+ abuse 邮箱;**不往用户页面注入任何 UI**(免改坏布局、免与 CSP 冲突)。
- **系统/平台管理员下架**(≠ 组织内角色):此处 admin 指 **Kiosk 运营方**——**跨租户**的 trust & safety 角色,可对**任意 org 的任意页**置 `deleted_at`、必要时封用户,因为滥用处置必须无视归属。P1 用 **env 白名单**指定平台 admin + 一个受保护的内部路由即可;更完整的平台 admin(Better Auth admin 插件)以后需要再上。组织内的 owner/admin/member 是另一维度(见 §4.3),属 P2。
- **恶意内容扫描**(Safe Browsing / 钓鱼识别):以后,非 MVP。
- 单页 2MB 上限在 API 层拦;限流见 §7.1。

### 5.6 加密与隐私
- **传输**:全程 HTTPS/TLS(Vercel 自带)。
- **静态**:数据库存储层加密(Neon 默认),P1 不额外做应用层加密。
- **隐私模型 = 访问控制(非内容加密)**:
  - P1:页面为 unlisted 公开链接,**链接即访问凭证**("知道链接就能看")。
  - P2:认证式访问控制(组织成员 / 页面级 read/share ACL / 对非成员可见性)——**主力隐私能力**;凭证是**身份**而非链接,链接泄漏 ≠ 内容泄漏。
- **端到端 / 零知识内容加密(E2E):P1 明确不做,且暂不预留 schema**。备忘(免重复纠结):① 与"公开 serving / P3 服务端导出 / P2 多人共享 / P4 批注"冲突;② 零知识 = 丢密钥/链接即永久不可恢复的数据悬崖;③ `#fragment` 带密钥只挡服务器、挡不住"链接本身泄漏",而多数隐私诉求恰恰要防链接泄漏 → 由上面的认证访问控制覆盖更对。若未来确有零知识需求,再作为 opt-in 模式单独设计(密钥绑链接不绑机器 + 明确不可找回 UX)。

### 5.7 前瞻:P4 组织主题兼容性(非 P1 实现项,仅备忘)
"管理员配置组织内统一样式"属 **P4**(依赖 P2 组织,进不了 P1)。此处仅记录 P1 已为其留好路、现在无需改动:
- **实现方向**:推荐 **serving 时注入** org 主题(内联 `<style>` + 可选页眉/页脚 chrome),主题契约 = CSS 变量(`--brand-*` 等)+ 框架/内容槽 + 作用域隔离;改主题**即时全量生效**。"发布时烘焙进 HTML"为备选(不回溯,不推荐)。
- **CSP 兼容**:`style-src 'unsafe-inline'` 已允许内联主题,P4 无需改 CSP。
- **serving 兼容**:P1 serving 已是"服务端可控响应",P4 扩成"注入变换"是自然延伸。
- **缓存**:届时缓存键/标签需加 **org 主题版本**维度,改主题按 org 批量 `revalidate`。
- **数据模型**:`organization` 表已就位,P4 仅加 org 主题表/列,纯增量。
- **生成约定**:P4 起在 skill 引导 AI 用 CSS 变量、勿写死品牌值,使页面"可主题化"。

---

## 6. 控制台

控制台在 `APP_ORIGIN`,P1 只做支撑发布闭环所必需。

### 6.1 路由
| 路由 | 内容 |
|---|---|
| `/` | 未登录 → 落地/登录页(GitHub、Google 两个 OAuth 按钮);已登录 → 跳 `/pages` |
| `/pages` | 页面列表(主界面) |
| `/settings/tokens` | API token 管理 |
| `/settings` | 账号(资料、登出),极简 |
| `/report` | 带外举报表单 |

### 6.2 页面列表 `/pages`
- 每行:标题、公开链接(**一键复制**)、更新时间、大小、**浏览量**、`↗ 打开`(跳 `SERVE_ORIGIN`)、**重命名**(内联改 title)、**删除/下架**(软删,二次确认)。
- **空状态 = onboarding 指引**:装 CLI → `kiosk login` → `kiosk install-skill` → 在 Claude Code/Codex 里发布。
- 游标分页。
> P1 页面**只从 CLI/API 产生**,控制台不做在线新建/编辑 HTML。控制台是"管理 + 分发链接 + 拿 token"的地方。

### 6.3 token 管理 `/settings/tokens`
列出 token(名字/前缀/创建/最后使用),新建(起名 → 明文只显示一次 → 复制),撤销。(承 §4.2)

### 6.4 浏览量
- `pages.view_count`,在 middleware(缓存前也会执行)里 best-effort 自增,列表显示"N 次浏览"。
- 因 CDN 缓存 + 边缘计数,为**近似值**,非精确 UV;热页可 debounce/批量写以控写入成本。
- 正经分析(UV/来源/时间序列)以后单独做。

### 6.5 i18n(仅控制台 UI)
- **范围**:控制台 UI + 落地/404/举报页。**CLI 输出与 skill 文档 P1 保持英文**;被服务的用户页面天然不涉及。
- **库**:**next-intl**(App Router 事实标准,RSC + 类型安全 messages)。
- **语言集**:P1 **英文 + 中文**(英文为主);加语言 = 加一份翻译文件。
- **检测/切换**:默认读 `Accept-Language` → UI 手动切换器 → 记住偏好(cookie + 登录后写入用户资料)。
- **路由**:**URL 不带 locale 前缀**(app 在登录后、serving 为 noindex,无 SEO 诉求)。

---

## 7. 非功能 / 配置 / 边界

### 7.1 限流
- **API**:按 token 限流(自实现),如 `publish` 60/min;读类更宽。未鉴权按 IP。
- **serving**:主要靠 CDN;源站对未命中缓存的请求按 IP 兜底限流。
- **/report**:按 IP 限流防刷。

### 7.2 大小 / 配额
- 单页 **2MB**(API 层拦,超 → 413)。
- 每 org 页面数设宽松上限(如 1000)作**滥用护栏**,非商业化配额;P1 不做计费/分层。

### 7.3 错误处理
- API:统一 `{ error: { code, message } }` + 正确状态码(400/401/403/404/413/429/500)。
- CLI:友好提示 + **非零退出码**,`--json` 供机器解析,网络错误给重试提示。
- serving:缺失/已删 → 404 页;其余 → 通用 500。

### 7.4 可观测性
结构化日志 + 请求日志;错误追踪(Sentry 可选)。MVP 从简,先用 Vercel 内置。

### 7.5 测试策略(为后续 TDD 铺垫)
- **单元**:public_id 生成、CSP 头构造、大小/校验、token→org 解析、CLI 的 create-vs-update 判定。
- **集成**:API 各端点打测试库(带 token 鉴权)。
- **E2E**:完整发布闭环(CLI → API → 从 `SERVE_ORIGIN` 取回 HTML 且头/CSP 正确)、host 分离(serving 域名拒绝控制台路由)。
- OAuth 难 E2E,用种子数据测 session/token 中间件。

### 7.6 配置 / env 前置(一次性列清,归运维管)
- 服务端:`APP_ORIGIN`、`SERVE_ORIGIN`(两个独立可注册域名)、`DATABASE_URL`(Neon)、`BETTER_AUTH_SECRET`、GitHub/Google 各自 OAuth `client_id`/`secret`、CDN/重验证相关(Vercel 上基本零配)。
- CLI 侧:`KIOSK_TOKEN`、`KIOSK_API_BASE`(可选)。

### 7.7 P1 范围边界
**做(In)**:OAuth 登录 + 个人 org 自动建 · API token(建/撤/hash)· CLI(login/publish/list/open/delete/install-skill/whoami/logout)· Claude Code SKILL.md + Codex 说明 · REST API v1(pages CRUD)· Neon 存储 · serving(host 分离/严格 CSP/noindex/缓存+重验证)· 控制台(页面列表:重命名/删除/复制/打开/浏览量 + token 管理 + 举报表单 + 最小 admin 下架)· 最小浏览量 · 控制台 i18n(EN+ZH)· **多租户 schema 全量预留**(org 表就位、无 org UI)。

**不做(Out,留后续阶段)**:
- 组织 UI:建组织 / 邀请 / 角色 / 成员管理 —— **P2**
- 页面级 read/write/share 权限、对非成员可见性控制 —— **P2**
- 导出 MD/HTML/PDF/PNG/JPEG —— **P3**
- 批注、组织主题 —— **P4**
- 自定义 slug、自定义域名;多文件/外链(opt-in);版本历史/回滚;邮箱密码/magic link 登录;计费分层;正经分析(UV/来源);恶意扫描;每页独立子域隔离;CLI/skill 文档 i18n;**内容 E2E/零知识加密**(未定,暂不预留 schema)

### 7.8 建议实现切片(给 writing-plans 铺垫,顺序可调)
1. 脚手架(Next.js + Drizzle + Neon + Better Auth)+ schema/迁移 + OAuth 登录 + 个人 org provisioning
2. API v1(pages CRUD)+ token 鉴权
3. serving(host 分离 / CSP / 缓存)
4. CLI(login/publish/list/delete/open)+ 本地状态文件
5. install-skill + SKILL.md / Codex 文档
6. 控制台 UI(页面列表 / token 管理 / 举报 / admin 下架 / 浏览量)+ i18n

---

## 8. 待定占位(非 TODO,是留给运维/发布环节的具体命名)
- `APP_ORIGIN` / `SERVE_ORIGIN` 的实际域名(需两个独立可注册域名)。
- npm 包名(spec 内用 `@kiosk/cli` 占位)。
- token 前缀(spec 内用 `kiosk_live_`)。

---

## 9. 关键决策速查
| 主题 | 决策 |
|---|---|
| 架构 | 单 Next.js App Router 应用;Vercel + Neon 部署(可移植 Docker) |
| 发布单位 | 自包含 HTML 单文件 |
| 客户端 | CLI 主路径(`@kiosk/cli`)+ REST API 底座(curl 兜底) |
| 公开 URL | `SERVE_ORIGIN/p/<public_id>`;public_id = ~12 位 base62;unlisted |
| 同 URL 更新身份 | 项目级 `.kiosk/pages.json`(默认)+ `--id`/`--new` + meta 标签 opt-in |
| 认证库 | Better Auth(organization 插件)+ 自定义 API token(`api_token` 表) |
| 登录 | OAuth GitHub + Google |
| API token | 控制台生成 `kiosk_live_*` + `kiosk login` 粘贴;落库存 hash |
| 数据模型 | 全量 org-first;注册建 personal org;`pages.organization_id` 非空 |
| id 策略 | auth 表默认 text id;`pages.id` = uuidv7 应用侧生成 |
| 更新语义 | 原地覆盖,无版本历史;软删 `deleted_at` |
| serving 安全 | 独立域名 + host 分离 + 严格 artifact 式 CSP + noindex + 可嵌入 |
| 缓存 | CDN + `revalidateTag(public_id)` |
| 加密/隐私 | 传输 TLS + 静态加密(Neon);隐私靠**访问控制**(P1 链接即凭证 / P2 认证 ACL);E2E **不做、不预留** |
| 浏览量 | 最小 `view_count`,middleware best-effort 自增(近似) |
| i18n | next-intl;EN+ZH;仅控制台 UI;无 URL 前缀 |
