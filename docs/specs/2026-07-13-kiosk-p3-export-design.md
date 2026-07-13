# Kiosk P3 设计 — 导出(MD / HTML / PDF / PNG / JPEG)

> 状态:定稿(待实现)。上游:P1/P2 spec + serving v2。动非平凡代码前先读本文。实现计划见 `docs/plans/`。

## 1. 目标与范围

让用户把已发布页面导出为 **MD / HTML / PDF / PNG / JPEG**。

- **MD / HTML**:主应用内**纯转换**(无渲染)。
- **PDF / PNG / JPEG**:交给**独立渲染微服务**(Playwright/Chromium,禁出网)渲染。
- 入口:REST API、CLI、控制台。导出按**可见性/成员**鉴权(导自己 org 的页)。**同步**返回文件。

**范围外(P3 不做)**:导出水印(砍掉,以后按需做动态按人水印)、`org_settings`、异步任务队列、公开匿名访客导出、批量导出、logo。

**非目标**:不改 P1/P2 的可见性/权限/双源/serving v2 语义;主应用**绝不进程内渲染不可信 HTML**。

## 2. 架构总览

```
控制台/CLI/API ──GET /api/v1/pages/:id/export?format=─▶ 主应用
  主应用: 鉴权(成员) → 取 content_html
     ├─ md   → turndown 转换(本地)          → text/markdown
     ├─ html → 直接回 content_html(本地)      → text/html
     └─ pdf/png/jpeg → POST content_html 到渲染微服务 → 二进制流回
渲染微服务(独立容器, 禁出网): POST /render {html, format} → Playwright 渲染 → 二进制
```

## 3. 渲染微服务(独立部署件)

- 位置:仓库内子目录 `render/`(自带 `package.json` + `Dockerfile`),**独立部署**(你 Komodo 上跑一个容器)。主应用与它**不同进程**。
- 技术:小型 Node HTTP 服务(`node:http` 或 Fastify)+ `playwright`(chromium)。
- 契约:`POST /render`
  - 请求头:`x-render-secret: <RENDER_SHARED_SECRET>`(app 与服务共享;不匹配 → 401)。
  - body(JSON):`{ html: string, format: "pdf"|"png"|"jpeg", viewport?: {width,height,deviceScaleFactor} }`。
  - 响应:二进制(`application/pdf` / `image/png` / `image/jpeg`)。
- 渲染流程:全新 `browser.newContext()` → `page.route('**')` **拦截**:URL 以 `http/https/file` 开头 → `abort()`(阻断出网/SSRF/外泄),`data:`/`blob:`/`about:` → 放行(自包含资源仍可渲染,契合严格 CSP);`page.setContent(html, { waitUntil: 'domcontentloaded' })` + 小 settle;`page.pdf()` / `page.screenshot()`。
- 硬约束:**禁出网**(上面的 route + 容器网络策略双保险)、渲染**超时**(如 15s → 504)、`html` **体积上限 2MB**(超 → 413)、每请求全新 context、Chromium sandbox 开。
- env:`RENDER_SHARED_SECRET`、`PORT`。

## 4. 安全考量

- 微服务渲染的是**不可信 HTML** → 靠**禁出网 + 进程/容器隔离 + 短超时 + 无持久化**收敛爆炸半径;主应用只做转发,永不进程内渲染。
- app↔服务:共享密钥头;服务只在内网/受信网络暴露(你的部署,egress 关掉)。
- 与 serving v2 一致:不可信内容始终被隔离(serving 用跨源 sandbox iframe;导出用禁网微服务)。

## 5. 导出入口与权限

- **API**:`GET /api/v1/pages/:id/export?format=md|html|pdf|png|jpeg`
  - 鉴权:`requireToken`(成员);页归属校验(该 page 属 caller org)。
  - 响应:文件流 + `Content-Disposition: attachment; filename="<slug>.<ext>"`(slug 取标题净化,缺省 public_id);错误统一 `{error:{code,message}}` + 状态码(400 非法 format / 404 / 413 / 502 渲染服务不可用 / 504 超时)。
- **CLI**:`kiosk export <id> --format pdf [-o 文件]`(缺 `-o` 时:文本类打 stdout,二进制类要求 `-o`)。
- **控制台**:每页 **"Export ▾"**,五个格式下载链接(指向导出 API,带会话)。
- **谁能导出**:**org 成员**(token / session)。公开页匿名访客导出**不做**(P3 外)。
- **同步**:导出端点直接调渲染服务、等结果、流回(渲染约数秒;Vercel 函数超时默认 300s 够)。异步队列**不做**。

## 6. 服务层与数据

- 新文件 `src/lib/export.ts`:
  - `toMarkdown(html: string): string`(turndown)。
  - `exportPage(params: { page: Page; format: ExportFormat }): Promise<{ body: Buffer | string; contentType: string; ext: string }>`:`md`/`html` 本地;`pdf`/`png`/`jpeg` 调 `renderRemote(html, format)`(POST 渲染服务)。
  - `renderRemote(html, format): Promise<Buffer>`:读 `RENDER_SERVICE_URL` + `RENDER_SHARED_SECRET`;失败 → 抛可映射为 502/504 的错误。
  - `type ExportFormat = "md" | "html" | "pdf" | "png" | "jpeg"`;`exportFilename(page, ext)`。
- **无数据库改动**(不建 `org_settings`)。

## 7. 依赖与部署

- 主应用新增:`turndown`(HTML→MD)。**不**在主应用装 Playwright/Chromium。
- `render/` 子目录:`playwright` + chromium(其 Dockerfile 用官方 Playwright 镜像)。
- env:主应用 `RENDER_SERVICE_URL` + `RENDER_SHARED_SECRET`;服务 `RENDER_SHARED_SECRET` + `PORT`。本地 dev:起 `render/` 服务(容器或 `node`),`RENDER_SERVICE_URL` 指过去。部署你自管。

## 8. 明确不做(P3 外)

导出水印 / `org_settings` / 设置 UI、异步队列、公开匿名导出、批量导出、logo、导出缓存/CDN(后续可按 `content_hash` 缓存渲染结果)。

## 9. 测试要点

- `toMarkdown`:HTML→MD 基本用例(标题/段落/链接/列表)。
- `exportPage`:`md`/`html` 走本地(内容/contentType/ext 正确);`pdf`/`png`/`jpeg` **mock `renderRemote`**(断言按 format 调用 + 头正确)——**单测不起真 Chromium**。
- 导出 API 路由:401 无 token;404 跨 org;400 非法 format;md/html 直接返回;pdf 分支调用 renderRemote(mock)。
- 渲染微服务:契约级测试(给一段自包含 HTML → 得到非空 PDF/PNG;外链请求被 abort)——在 `render/` 内跑,起真 Chromium(不进主应用 CI 的 Neon 套件)。
- 手动:真机导出五种格式,校验 PDF/图片保真 + 外部资源被禁网(不泄漏)。
