# Kiosk P2 设计 — 组织与权限 + 私有可见性

> 状态:定稿(待实现)。上游:`docs/specs/2026-07-08-kiosk-p1-publish-core-design.md`(P1)。
> 动非平凡代码前先读本文。实现计划见 `docs/plans/`。

## 1. 目标与范围

把 P1 的"单用户 = 单个人 org"扩成**多成员团队工作区**,并引入**页面可见性 / 访问控制**。

**范围内(P2)**
- 多成员组织:建额外团队 org、活跃 org 切换。
- 链接式邀请 + 角色(owner/admin/member)+ 角色鉴权。
- 页面可见性:`org`(默认,私有)/ `public`(显式公开);org 页经**签名令牌门**在 cookieless 的 `SERVE_ORIGIN` 上鉴权。
- 页面版本快照(只读历史)。
- 发布默认私有;`--public` / 控制台开关显式公开。

**范围外(不做)**:单页/按人 ACL、给组织外特定人分享(share-by-email)、版本回滚 UI、邮件投递邀请、组织统一样式(P4)。见 §13。

**非目标**:改动 P1 已定的双源隔离、严格 CSP、token→org 语义、id 策略。P2 是增量。

## 2. 前置(P1 已就位,复用)

- Better Auth `organization` 插件 → `organization` / `member`(含 `role`)/ `invitation` 表已在库。
- 注册后钩子 `provisionPersonalOrg` → 每用户一个个人 org + owner member。
- `pages.organization_id`(非空)、`created_by`;发布按 caller 的 membership 解析 org。
- `api_token.organization_id`:token 已 org-scoped。
- 双源:`APP_ORIGIN`(控制台+API+OAuth,`__Host-` 会话 cookie)与 `SERVE_ORIGIN`(公开 serving,**无 cookie**)。serving 严格 CSP。

## 3. 数据模型

**`pages` 增列**(极小迁移):
- `visibility` text NOT NULL default `'org'`,取值 `'org' | 'public'`。
- `updated_by` text NULL → `user.id`(最后编辑者)。
- `deleted_by` text NULL → `user.id`(软删执行者)。
- `created_by` 已有。软删语义(`deleted_at`)不变。

**新表 `page_version`**(append-only 快照):
- `id` uuidv7 PK
- `page_id` → `pages.id`(cascade)
- `content_html` text NOT NULL
- `title` text
- `edited_by` text → `user.id`
- `created_at` timestamptz default now()
- index on `page_id`

写入时机:`POST`(建页,存首版)+ 每次 `PUT` 且 **content 有变化**(与当前 `content_html` 不同才追加,避免无意义版本)。当前内容仍留 `pages.content_html`,serving 直接读它(快),`page_version` 只供历史查看。

**迁移向后兼容**:`ADD COLUMN visibility ... DEFAULT 'org'` 会让存量行变 `'org'`;但 P1 存量页是公开且链接已被分享 → **迁移里把存量行回填为 `'public'`**(保留其现有公开可达性),新建页才默认 `'org'`。

## 4. 角色与权限

角色沿用 `member.role`:`owner` / `admin` / `member`(租户内维度,与 §11 的平台 admin 无关)。

**权限矩阵**

| 能力 | member | admin | owner |
|---|:--:|:--:|:--:|
| 创建 / 读 / **编辑任意** org 页 | ✅ | ✅ | ✅ |
| 设置页面可见性(org↔public) | 自己的 | 任意 | 任意 |
| 删除页面(软删) | 仅自己建的 | 任意 | 任意 |
| 邀请 / 移除成员、改成员角色 | ❌ | ✅ | ✅ |
| 改 org 设置(名称等) | ❌ | ✅ | ✅ |
| 删除 org / 转移所有权 | ❌ | ❌ | ✅ |

- "编辑任意页"是刻意的共享编辑;误覆盖靠 §8 版本快照兜底(可追溯),不靠限权。
- admin 不能移除/降级 owner。

**实现:薄自定义 `src/lib/permissions.ts`**(纯函数,非 Better Auth access-control 模块——因为"删自己的页"是实例级归属判断)。
```
type Role = "owner" | "admin" | "member";
type Action =
  | "page.edit" | "page.delete" | "page.setVisibility"
  | "member.invite" | "member.remove" | "member.setRole"
  | "org.update" | "org.delete" | "org.transfer";
can(role: Role, action: Action, ctx?: { isResourceOwner?: boolean }): boolean
```
`page.delete` / `page.setVisibility`:member 需 `ctx.isResourceOwner === true`;admin/owner 恒真。Better Auth 只负责成员/角色/邀请/activeOrg;鉴权判定走 `can()`。纯函数 → 单测穷举矩阵。

**鉴权接入**:
- API/CLI:`requireToken` 除 `{ userId, organizationId }` 外再返回 caller 在该 org 的 `role`(join `member`);写操作前 `can(role, action, {isResourceOwner: page.created_by === userId})`。
- 控制台 server actions/路由:同 `can()`,role 取自 active org 的 membership。

## 5. 多组织与活跃组织

- 用户可建**额外团队 org**(Better Auth `organization.create` → org + owner member);个人 org 保留为默认。
- **活跃 org**:用 Better Auth session `activeOrganizationId`。登录默认活跃 = 个人 org(或上次活跃)。控制台顶部 **org 切换器**(`organization.setActive`);当前 active org 决定控制台看到的页/成员/token。
- **API/CLI 不需要 active 概念**:token 已绑定具体 org。CLI login 的 mint(`/api/cli/token`)为**当时的 active org** 换发 token;`kiosk whoami` 显示 org + role。用户要换 org 发布 → 控制台切 active 后新 mint,或后续加 `--org`。
- 具体 Better Auth API 名(create/setActive/activeOrganizationId 字段/list members)在 plan/impl 时对源码核实。

## 6. 邀请流(链接式)

- admin/owner 在成员页填**邮箱 + 角色** → 建 `invitation`(Better Auth)→ 生成 `/invite/<invitationId>` 链接,复制手动发(Slack/微信等)。
- 受邀人打开 `/invite/<id>` → 用该邮箱 OAuth 登录 → **接受**(建 `member`,role 取邀请里的)/ **拒绝**。
- 邮件投递:**留档、后续加**(邀请记录 + 接受流程与链接式相同,只多一层投递)。
- 邀请可撤销 / 有过期(用 Better Auth 默认)。

## 7. 可见性与 serving 访问门 ★(P2 核心)

`GET /p/<public_id>`(在 `SERVE_ORIGIN`)按 `pages.visibility` 分流:

- **`public`**:直接公开服务(P1 现有行为 + 严格 CSP + noindex)。**仅在用户显式设为 public 后**。
- **`org`(默认)**:serve 源无 cookie,靠 app 域签发的**短期签名令牌**鉴权:
  1. serve 收到 `/p/<id>`,URL 无有效 `?k` 令牌 → **302 到 `APP_ORIGIN/serve-auth?next=<public_id>`**。
  2. app 域(有 `__Host-` 会话)校验:未登录 → 跳 `/sign-in?callback=/serve-auth?next=<id>`;已登录但非该页 org 成员 → **403**;是成员 → 签发令牌 → **302 回 `SERVE_ORIGIN/p/<id>?k=<token>`**。
  3. serve 验令牌(HMAC 验签 + 未过期 + 令牌 org == 页面 org)→ 返回 HTML;否则回到步骤 1。
- **令牌**:HMAC-SHA256(payload `{orgId, userId, exp}`,exp ≈ 2min),base64url;密钥用 `BETTER_AUTH_SECRET`(或专用)。**无状态**——serve 只验签,不查库、不落 cookie。
- serve 源**不设任何 cookie**(维持 cookieless 不变量);每次新开 org 页都走一次快速重定向(可接受;短命令牌复用/优化留后续)。
- 非成员 403 页 / 未登录登录门都在 app 域。

**安全依据**见 §11。

## 8. 版本历史(只读)

- 每次建页 / 内容变化的更新 → 追加 `page_version` 快照(见 §3)。
- 控制台页面详情:**历史版本列表**(编辑者 + 时间)+ 查看某版本内容 / 与当前对比。
- **回滚 UI 不做**(留后续);数据已存,以后加"恢复到此版本"即一次 PUT。

## 9. 发布行为变化(API / CLI)

- **默认私有**:`POST /api/v1/pages` 建页默认 `visibility='org'`。
- `POST` 接受可选 `visibility`(默认 `org`);`PATCH /api/v1/pages/:id { visibility }` 切换已有页可见性(不重传内容);`PUT` 更新内容时亦可带 `visibility`。权限按 §4(member 只能改自己页的可见性)。
- **CLI**:
  - `kiosk publish` 建页默认私有,返回 `/p/<id>`(org-gated),并打印提示:`(private to your org — add --public or use the console to share publicly)`。
  - `kiosk publish --public`:建/改为 public。
  - `kiosk share <id> --public | --private`:切换已有页可见性(独立命令,调 `PATCH`)。
  - `kiosk whoami`:显示 org + role。
- 返回 URL 不变(始终 `/p/<id>`);可见性只改"这条链接对公众开不开"。

## 10. 控制台 UI + i18n

- 顶部 **org 切换器** + "新建组织"。
- **成员页**:成员列表(角色标识)、邀请(邮箱+角色→出链接)、改角色、移除;按 caller role 显隐操作。
- **`/invite/<id>` 接受页**:展示 org/角色 → 接受/拒绝。
- **页面详情**:可见性开关(设为公开/转回私有,带当前状态)、版本历史查看。
- token 管理沿用 P1,归属当前 active org。
- i18n:next-intl,EN/ZH 补全新文案。

## 11. 安全考量

- **为何 org 页也必须在 cookieless 的 `SERVE_ORIGIN`**:被服务的是不可信用户 HTML(org 页也一样——恶意/被污染的成员页,队友一开就中招)。若放带 cookie 的 app 域,严格 CSP 也挡不住:页面内联 JS 可 `window.open('APP_ORIGIN/settings/tokens')` → **同源**读弹窗 DOM 刮 token → 顶层跳转外带。CSP 只管 fetch/表单/外链,管不到 `window.open`、读同源 DOM、顶层跳转。分离 origin 使该 `window.open` 变**跨源**,读取被同源策略拒绝——这才是主墙,CSP 是第二层。
- **令牌安全**:短命(~2min)+ 绑 org + HMAC 不可伪造;泄漏窗口小且只对该 org 有效。
- **平台 admin**(跨租户 trust & safety,P1 env 白名单)与组织内角色是两个维度,不混。
- 隐私仍靠**访问控制**(身份 > 链接);E2E 不做(见 P1 §)。

## 12. 迁移与向后兼容

- 迁移:`pages` 加 `visibility`/`updated_by`/`deleted_by` + 建 `page_version`;**回填存量 `pages.visibility='public'`**(保住 P1 已分享链接的可达性)。
- 无 ownership 语义变更;`pages.organization_id` 不动。零数据丢失。

## 13. 明确不做(P2 外)

单页/按人 ACL、share-by-email 给非成员、版本回滚 UI、邮件投递邀请、组织统一样式(P4)、`--org` 多 org 发布切换(后续)。

## 14. 测试要点

- `permissions.can()`:矩阵穷举(每 role × action × isResourceOwner)。
- serving 门:public 直服;org 无令牌→302;伪造/过期/跨 org 令牌→拒;合法令牌→200。签名/验签往返。
- 版本快照:建页存首版;内容变→追加;内容不变的 PUT→不追加。
- 邀请:建→接受(建 member,角色正确)/拒绝;非受邀邮箱不能接受。
- 鉴权:member 删他人页→403、删自己页→OK;admin 删任意→OK;非成员/跨 org 访问→拒。
- 迁移:存量页回填 public 后仍公开可达;新页默认 org 需登录。
```
