# render/ — Kiosk 渲染微服务(P3-2,**待实现**)

> 状态:**口子已留,服务未建**。主应用(`src/lib/export.ts` 的 `renderRemote`)已按下面的契约调用;此服务尚未实现。缺它时 PDF/PNG/JPEG 导出**优雅降级为 502**(MD/HTML 不受影响)。设计见 `docs/specs/2026-07-13-kiosk-p3-export-design.md` §3。

## 这是什么
一个**独立部署**的小服务(与主应用不同进程),用 Playwright/Chromium **禁出网**地渲染不可信 HTML → PDF/PNG/JPEG。主应用永不进程内渲染不可信 HTML;此服务是隔离的渲染沙箱(与 serving v2 的跨源 sandbox iframe 同理念)。

## 契约(主应用已按此调用 —— 别改签名,改了要同步 `renderRemote`)
```
POST /render
  Header: x-render-secret: <RENDER_SHARED_SECRET>     # 不匹配 → 401
  Body (JSON): { html: string, format: "pdf"|"png"|"jpeg", viewport?: {width,height,deviceScaleFactor} }
  200 → 二进制:application/pdf | image/png | image/jpeg
```

## 实现要点(P3-2 计划将展开)
- 小型 Node HTTP 服务(`node:http` 或 Fastify)+ `playwright`(chromium);自带 `Dockerfile`(基于官方 Playwright 镜像)。
- **禁出网**:`page.route('**')` 里 `http/https/file` 开头的请求 `abort()`,`data:`/`blob:`/`about:` 放行(自包含资源仍可渲染);容器网络策略再兜一层。
- `page.setContent(html, { waitUntil: 'domcontentloaded' })` → `page.pdf()` / `page.screenshot()`。
- 硬约束:渲染超时(~15s → 504)、`html` 体积上限 2MB(→ 413)、每请求全新 context、Chromium sandbox 开。
- env:`RENDER_SHARED_SECRET`、`PORT`。

## 主应用侧的接线(已完成)
- `src/lib/export.ts` `renderRemote(html, format)`:读 `RENDER_SERVICE_URL` + `RENDER_SHARED_SECRET`,POST 到 `/render`;未配置/不可达 → `ExportError(502)`,超时 → `ExportError(504)`。
- env(`.env`):`RENDER_SERVICE_URL`(dev 占位 `http://localhost:4000`)、`RENDER_SHARED_SECRET`。
- 建好本服务后:起容器 → 把 `RENDER_SERVICE_URL` 指过去,PDF/PNG/JPEG 即可用,主应用**零改动**。
