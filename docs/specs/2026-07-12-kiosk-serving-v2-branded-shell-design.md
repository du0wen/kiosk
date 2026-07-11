# Kiosk Serving v2 设计 — 品牌外壳 + 跨源 sandbox iframe

> 状态:设计(待审)。上游:P1 spec(双源/严格 CSP)、P2 spec §7(可见性门)。
> 动 serving 代码前先读本文。它**演进** serving 层,不改 P1/P2 的数据与权限语义。

## 1. 背景与目标

现状:分享链接 `SERVE_ORIGIN/p/<id>` 直出**裸 HTML**——安全(独立 cookieless 域 + 严格 CSP),但内容**孤立、无品牌/nav**。

目标:公开页与组织页都套上 **Kiosk 品牌外壳(header/nav)**,内容不孤立;**不牺牲安全**;尽量少改边界。

**参照(已核实)**:Claude artifacts = claude.ai 上的品牌外壳 + 把内容放进**独立域 `claudeusercontent.com`** 的 sandbox iframe;Anthropic 明确选"独立 origin + 整站进程隔离",禁 storage、CSP 白名单极窄。→ 印证:**保留独立域 + 品牌外壳 + iframe** 才是对的路子;单域名 srcdoc 反而更弱。Kiosk 已有独立 `SERVE_ORIGIN`,只差外壳。

## 2. 架构

- **品牌外壳页**:在 `APP_ORIGIN`,Kiosk 可信模板(header/nav/品牌),**不内联任何不可信 HTML**。里面一个 `<iframe>` 指向 `SERVE_ORIGIN/p/<id>`。
- **内容**:仍在独立 cookieless 的 `SERVE_ORIGIN`,严格 CSP 不变。iframe `sandbox="allow-scripts"`(**不给 allow-same-origin** → opaque origin,禁 storage,读不到父页/cookie)——独立域 + sandbox 双层隔离,与 Claude 同构。
- 外壳是我们自己的代码(无不可信内容),放带 cookie 的 app 域**安全**;不可信 HTML 只存在于**跨源 + sandboxed** 的 iframe 里。

## 3. URL 方案

| 用途 | URL | 内容 |
|---|---|---|
| **分享链接(主)** | `APP_ORIGIN/v/<public_id>` | 品牌外壳 + iframe |
| 裸内容(iframe src / 供别处嵌入) | `SERVE_ORIGIN/p/<public_id>` | 裸 HTML(P1 现状) |

- `kiosk publish` / 控制台复制的链接 → 改返回**外壳 URL** `APP_ORIGIN/v/<id>`。
- 裸 `SERVE_ORIGIN/p/<id>` 保留:外壳的 iframe src,也是"想在自己博客里嵌一个 Kiosk 页"的 embed 源。

## 4. 可见性与鉴权(简化 P2-3)

外壳页 `GET /v/<id>`(app 域,有 session):
- **public**:直接渲染外壳 + `<iframe src="SERVE_ORIGIN/p/<id>">`。无需登录。
- **org**:查 session → 未登录跳 `/sign-in?callback=/v/<id>`;非成员 → 403 外壳;成员 → **外壳侧现签 serve-token** → `<iframe src="SERVE_ORIGIN/p/<id>?k=<token>">`。
  - **不再需要 serve→app→serve 重定向弹跳**:外壳本就在 app 域、手里有 session,直接 mint 令牌塞进 iframe。P2-3 的 `serve-token` 复用;`/serve-auth` 重定向门**降级为兜底**(仅当有人直连 `SERVE_ORIGIN/p/<id>` 而非走外壳时)。
- 裸 `SERVE_ORIGIN/p/<id>` 行为不变(public 直出;org 无有效令牌 → 现有 `/serve-auth` 兜底)。

## 5. sandbox 与 CSP

- iframe:`sandbox="allow-scripts"`(opaque origin;无 storage/无顶层跳转/无弹窗);不给 `allow-same-origin`。
- serve 响应:沿用 P1 严格 CSP(`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'none'; …`)。
- serve 响应**可被 app 域外壳内嵌**:不设 `X-Frame-Options`;`frame-ancestors` 对 public 页放开(允许别处 embed),对 org 页限 `APP_ORIGIN`(只允许自家外壳嵌)——plan 时定实现。
- 外壳页(app 域)自身 CSP:`frame-src SERVE_ORIGIN`(允许嵌 serve),其余按控制台常规 + `frame-ancestors 'none'`(外壳自身防被人套)。

## 6. 外壳内容(chrome)

顶栏:Kiosk 品牌/logo、页面标题、"由 Kiosk 发布"、举报入口、**打开裸页/复制 embed 链接**;(登录态可显作者/管理入口)。具体版式 plan 时定;P4 组织统一样式可覆盖外壳主题。

## 7. 发布行为变化(API/CLI)

- `POST /pages` / `PUT` 返回体的 `url` → 改成**外壳 URL**(`APP_ORIGIN/v/<id>`);另加 `rawUrl`(`SERVE_ORIGIN/p/<id>`)供 embed。
- CLI `publish` 打印外壳 URL;`--json` 同时给 `url` + `rawUrl`。`open` 打开外壳 URL。
- `pageUrl()` 拆成 `pageShellUrl()`(app/v) + `pageRawUrl()`(serve/p)。

## 8. 与 P2 的关系

- **保留**:`SERVE_ORIGIN` 独立域、serve-token、严格 CSP、可见性/角色语义。
- **降级**:P2-3 的 `/serve-auth` 重定向门从"主路径"变"直连兜底";主路径改为外壳侧 mint。
- **新增**:`/v/<id>` 外壳路由 + iframe 集成 + 发布返回外壳 URL。
- 控制台"页面详情"也可复用外壳(带 nav 的集成视图),呼应之前"内容不孤立"。

## 9. 迁移与兼容

- 存量已分享的 `SERVE_ORIGIN/p/<id>` 链接**继续可用**(裸页照旧;org 页走 `/serve-auth` 兜底)。
- 新分享一律用外壳 URL。无数据迁移。

## 10. 安全考量

- 不可信 HTML **只存在于跨源 + sandboxed iframe**;外壳无内联不可信内容 → app 域带 cookie 也安全。
- 独立域 + sandbox opaque = 双层(belt + suspenders),与 Claude 一致;单点漏配面小(外壳一个模板 + serve 一套头)。
- serve-token 短效(~2min)+ 绑 org + HMAC,外壳每次渲染现签。

## 11. 明确不做

- 不合并成单域名(Claude 也没合并;独立域是安全根基)。
- 不做 srcdoc 内联方案(丢独立域纵深防御)。
- 外壳主题化/组织品牌 = P4;本 spec 只做默认 Kiosk 外壳。
- artifact 内 storage 不支持(sandbox opaque;与"自包含、禁外部网络"一致)。

## 12. 测试要点

- `/v/<id>`:public 无 session → 200 外壳含 `<iframe src=…/p/<id>>`(无 k);org 无 session → 302 登录;org 非成员 → 403;org 成员 → 200 外壳,iframe src 带有效 k。
- 外壳 iframe 标签含 `sandbox="allow-scripts"` 且**不含** `allow-same-origin`。
- serve-token 由外壳签发、serve 端验签放行(复用 P2-3 测试)。
- 发布返回 `url`=外壳、`rawUrl`=裸;`pageShellUrl`/`pageRawUrl` 单测。
- 裸 `SERVE_ORIGIN/p/<id>` org 页直连仍走 `/serve-auth` 兜底(P2-3 回归不破)。
