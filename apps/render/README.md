# render/ — Kiosk 渲染微服务(P3-2)

> 状态:**已实现**。独立包(独立 `package.json` + `Dockerfile`),与主应用不同进程、**可独立部署**。主应用(`src/lib/export.ts` 的 `renderRemote`)按下面的契约调用;缺它/不可达时 PDF/PNG/JPEG 导出**优雅降级为 502**(MD/HTML 不受影响)。设计见 `docs/specs/2026-07-13-kiosk-p3-export-design.md` §3。

## 这是什么
一个**独立部署**的小服务(与主应用不同进程),用 Playwright/Chromium **禁出网**地渲染不可信 HTML → PDF/PNG/JPEG。主应用永不进程内渲染不可信 HTML;此服务是隔离的渲染沙箱(与 serving v2 的跨源 sandbox iframe 同理念)。

## 契约(主应用已按此调用 —— 别改签名,改了要同步 `renderRemote`)
```
POST /render
  Header: x-render-secret: <RENDER_SHARED_SECRET>     # 不匹配 → 401
  Body (JSON): { html: string, format: "pdf"|"png"|"jpeg", watermark?: string }
  200 → 二进制:application/pdf | image/png | image/jpeg
  400 → 非法 format / html 非字符串;413 → html > 2MB;500 → 渲染失败;504 → 渲染超时(>15s)
  # watermark(P4):非空则在渲染结果右下角叠加淡灰文字。
```

## 实现
- `render.mjs` —— `renderHtml(html, format, watermark?)`:懒启一个共享 `chromium.launch({args:['--no-sandbox']})`;每请求全新 context;`page.route('**')` 里 `http/https/file/ftp` 开头的请求 `abort()`(自包含 `data:`/`blob:`/`about:` 放行,自包含资源仍可渲染);`setContent(..., domcontentloaded, 15000)`;`page.pdf({printBackground:true})` 或 `page.screenshot({type, fullPage:true})`。`closeBrowser()` 供测试收尾。
- `server.mjs` —— `node:http` 服务:`POST /render` + `x-render-secret` 门 + JSON 解析 + 体积上限(2MB→413)+ format 校验(→400)+ 15s 超时(→504);`createRenderServer()` 供测试起随机端口。
- `Dockerfile` —— 基于 `mcr.microsoft.com/playwright:v1.61.1-jammy`(**tag 必须与 `package.json` 的 playwright 版本一致**),`npm install --omit=dev`,`CMD node server.mjs`。
- env:`RENDER_SHARED_SECRET`(共享密钥,与主应用一致)、`PORT`(默认 4000)。

## 本地跑
```bash
cd render
pnpm install --ignore-workspace          # 独立于主 workspace
pnpm exec playwright install chromium     # 首次:下 Chromium(本地非 Docker 时需要)
RENDER_SHARED_SECRET=dev-render-secret-change-me node server.mjs   # 起在 :4000
node --test                               # 契约测试(render + server)
```

## 部署 & 接线
- 独立容器:`docker build -t kiosk-render render/` → 跑起来,设 `RENDER_SHARED_SECRET` + `PORT`。
- 主应用侧(已完成):`src/lib/export.ts` `renderRemote(html, format, watermark?)` 读 `RENDER_SERVICE_URL` + `RENDER_SHARED_SECRET`,POST `/render`;未配置/不可达 → `ExportError(502)`,超时 → `ExportError(504)`。
- env(`.env`):`RENDER_SERVICE_URL`(dev 占位 `http://localhost:4000`)、`RENDER_SHARED_SECRET`。
- 起容器后把 `RENDER_SERVICE_URL` 指过去,PDF/PNG/JPEG 即可用,主应用**零改动**。
