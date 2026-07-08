---
paths:
  - "src/app/p/**"
  - "app/p/**"
  - "src/middleware.ts"
  - "middleware.ts"
  - "src/serving/**"
---

# 公开 serving 规则

- serving **只在 `SERVE_ORIGIN`**。middleware 按 `Host` 分流:
  - `SERVE_ORIGIN`:只放 `/p/*`、`/report`、健康检查、favicon;其余 404。
  - `APP_ORIGIN`:控制台 + `/api/*`;`/p/*` → 302 到 `SERVE_ORIGIN`。
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
