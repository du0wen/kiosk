---
paths:
  - "src/app/p/**"
  - "src/app/v/**"
  - "app/p/**"
  - "src/middleware.ts"
  - "middleware.ts"
  - "src/serving/**"
---

# 公开 serving 规则

- serving **只在 `SERVE_ORIGIN`**。middleware 按 `Host` 分流:
  - `SERVE_ORIGIN`:只放 `/p/*`、`/report`、健康检查、favicon;其余 404。
  - `APP_ORIGIN`:控制台 + `/api/*`;`/p/*` → 302 到 `SERVE_ORIGIN`。
- **serving v2(品牌外壳)**:分享链接 = **`APP_ORIGIN/v/<id>`**(可信外壳:Kiosk header/nav)+ 内嵌 `<iframe sandbox="allow-scripts" src="SERVE_ORIGIN/p/<id>[?k=token]">`(**绝不给 allow-same-origin**)。外壳无内联不可信 HTML;不可信内容只在**跨源 + sandbox** iframe 里。org 页由外壳(app 域有 session)现签 serve-token 塞进 iframe src(不走 serve→app→serve 弹跳;`/serve-auth` 降级为直连兜底)。裸 `/p/<id>` 行为不变(iframe src + 供别处 embed)。发布返回 `url`=外壳 + `rawUrl`=裸;URL 工具 `pageShellUrl`(app/v)/`pageRawUrl`(serve/p)。
- `GET /p/<public_id>`:查活跃页(`deleted_at is null`),回存的 `content_html` + 下列头;查不到/已删 → 404 页。
- **响应头**:严格 CSP(见下)、`X-Robots-Tag: noindex, nofollow`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`。**不设 `X-Frame-Options`、CSP 不限 `frame-ancestors`** → 页面可被嵌入。控制台(`APP_ORIGIN`)响应反而要设 `frame-ancestors 'none'` 防点击劫持。
- **严格 CSP**(核心):
  ```
  default-src 'none';
  script-src 'unsafe-inline' 'unsafe-eval' blob:;
  style-src 'unsafe-inline';
  img-src data: blob:; font-src data:; media-src data: blob:;
  connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none';
  ```
  即:内联 JS/CSS + `data:`/`blob:` 资源 OK,但**禁一切外部网络**(fetch/外链/表单外提)。
- **缓存**:CDN + 缓存标签 `public_id`;发布/更新/删除时 `revalidateTag(public_id)`。
- **浏览量**:middleware 里 best-effort 自增 `pages.view_count`(近似值,热页可 debounce)。
