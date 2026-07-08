---
paths:
  - "src/db/**"
  - "drizzle.config.ts"
---

# 数据层规则(Drizzle + Neon)

- 单库 Neon Postgres。Better Auth 托管表 + app 自有 `pages`,**同库、同一套 Drizzle 迁移**。
- Schema 在 `src/db/schema/`,barrel 在 `src/db/schema/index.ts`;客户端在 `src/db/index.ts`(`drizzle-orm/neon-serverless` + `Pool`,Node 下需 `neonConfig.webSocketConstructor = ws`)。
- **id 策略**:
  - auth 表用 Better Auth **默认 text id**(勿改 id 策略)。
  - `pages.id` = **uuidv7,应用侧生成**:`uuid("id").primaryKey().$defaultFn(() => uuidv7())`,**勿用 `gen_random_uuid()`**(那是 v4)。
  - `public_id` = `nanoid` base62 **12 位**,唯一索引;它就是公开 URL 的 id 和 API 的 `:id`。
- **不加表前缀**(独立库;`user` 保留字由 Drizzle 自动加引号处理)。
- FK:`pages.organization_id`、`pages.created_by` 是 `text`(对齐 auth text id)。`organization_id` 恒**非空**(多租户预留;P2 前每人一个个人 org)。
- **软删**:`pages` 所有查询过滤 `deleted_at is null`;删除 = 置 `deleted_at`,不物理删。
- 迁移流程:改 schema → `pnpm db:generate` → `pnpm db:migrate`。Better Auth 表由 `pnpm auth:generate` 生成到 `src/db/schema/auth.ts`。
- 生成后务必核对 `organization`/`member` 等表的实际列名,再让 `provisionPersonalOrg` 的 insert 对齐。
