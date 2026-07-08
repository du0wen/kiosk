---
paths:
  - "src/app/api/v1/**"
  - "app/api/v1/**"
---

# 发布 API 规则(REST v1)

- 前缀 `/api/v1`;鉴权 `Authorization: Bearer kiosk_live_*`(Better Auth apiKey 校验)→ 解析 user → 解析 org。
- **`:id` 即 `public_id`**,内部 uuid 主键不外露。
- 端点:
  - `POST /pages` — body = 原始 `text/html`;标题取 `X-Kiosk-Title` 头,缺省从 `<title>`/文件名推断。→ `201 { id, url, createdAt }`。
  - `PUT /pages/:id` — 覆盖更新(须属 caller org)。→ `200 { id, url, updatedAt }`;无权/不存在 → `404`。
  - `GET /pages` — 游标分页。
  - `GET /pages/:id` — 单页元数据。
  - `DELETE /pages/:id` — 软删 → `204`。
  - `GET /me` — 校验 token + 返回 user/org。
- **单页 ≤ 2MB**;超 → `413`。
- 错误统一 `{ error: { code, message } }` + 正确状态码(400/401/403/404/413/429/500)。
- 限流:按 token(apiKey 插件内置)。
- **接口改动必须同步更新接口文档**(PR 描述或 Linear 工单)。
