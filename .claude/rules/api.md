---
paths:
  - "src/app/api/v1/**"
  - "app/api/v1/**"
---

# 发布 API 规则(REST v1)

- 前缀 `/api/v1`;鉴权 `Authorization: Bearer kiosk_live_*`(自定义 `verifyToken()` 校验)→ 解析 user → 解析 org。
- **`:id` 即 `public_id`**,内部 uuid 主键不外露。
- 端点:
  - `POST /pages` — body = 原始 `text/html`;标题取 `X-Kiosk-Title` 头,缺省从 `<title>`/文件名推断;可见性取 `X-Kiosk-Visibility: org|public`(缺省 `org`=私有)。→ `201 { id, url, visibility, createdAt }`。
  - `PUT /pages/:id` — 覆盖更新(须属 caller org);可带 `X-Kiosk-Visibility`。→ `200 { id, url, visibility, updatedAt }`;不存在 → `404`。
  - `PATCH /pages/:id` — body JSON `{ visibility: "org"|"public" }` 切换可见性(不重传内容)。→ `200 { id, url, visibility }`。
  - `GET /pages` — 游标分页。
  - `GET /pages/:id` — 单页元数据(含 `visibility`)。
  - `DELETE /pages/:id` — 软删 → `204`。
  - `GET /me` — 校验 token + 返回 user/org。
- **角色鉴权(P2)**:`requireToken` 返回 caller 在该 org 的 `role`(owner/admin/member);`can()`(`src/lib/permissions.ts`)判定。`DELETE`/`PATCH`/编辑他人页:member **仅限自己建的**(`created_by`),admin/owner 任意;违反 → `403`。任何成员可 **编辑** 任意页(共享工作区)。
- **单页 ≤ 2MB**;超 → `413`。
- 错误统一 `{ error: { code, message } }` + 正确状态码(400/401/403/404/413/429/500)。
- 限流:按 token/IP(自实现)。
- **接口改动必须同步更新接口文档**(PR 描述或 Linear 工单)。
