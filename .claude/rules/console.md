---
paths:
  - "src/app/(console)/**"
  - "app/(console)/**"
  - "src/app/pages/**"
  - "src/app/settings/**"
  - "src/app/report/**"
  - "src/i18n/**"
  - "messages/**"
---

# 控制台 + i18n 规则

- 控制台在 `APP_ORIGIN`。路由:`/`(未登录→登录页 GitHub/Google;已登录→ `/pages`)、`/pages`(列表)、`/settings/tokens`、`/settings`、`/report`。
- **P1 页面只从 CLI/API 产生**;控制台**不做**在线新建/编辑 HTML。控制台 = 管理 + 分发链接 + 拿 token。
- **页面列表**:标题、公开链接(一键复制)、更新时间、大小、**浏览量**、`↗ 打开`(跳 `SERVE_ORIGIN`)、内联**重命名**、**删除/下架**(软删,二次确认)。空状态 = onboarding 指引(装 CLI → `kiosk login` → `kiosk install-skill` → 发布)。
- **token 管理** `/settings/tokens`:列出(名字/前缀/创建/最后使用)、新建(明文只显示一次)、撤销。
- **i18n**:`next-intl`;语言 **EN + ZH**(英文为主);默认读 `Accept-Language` → 手动切换器 → 记住偏好(cookie + 登录后写用户资料);**URL 不带 locale 前缀**;**只覆盖控制台 UI**(CLI/skill 文档、用户页面不涉及)。
- **P2 新增**:控制台一切按 **active org**(`session.activeOrganizationId`,登录时 `session.create.before` hook 设为个人 org;`resolveActiveOrg` 读取)。`/settings/members`(成员列表 + **移除/改角色**(owner/admin,不能动 owner/自己)+ 邀请出链接 + org 切换器 + 建 org,走 `authClient.organization.*`);`/pages` 每页**可见性开关**(公开/私有,`can()` role+归属 gated)+ **历史** `/pages/[id]/history`(版本列表 + **Restore 回滚**到旧版);`/invite/[id]` 接受/拒绝页。
- **P4 品牌**:`/settings` owner/admin 配**主题色 + 导出水印**(`org_settings` 表,`can("org.update")` gated;hex 校验);`/v` 外壳按所属 org 显**品牌名(=`organization.name`)+ 主题色**;导出水印 HTML 页脚即时、PDF/图透传给渲染服务(待 P3-2)。
- **平台管理员**(≠ 组织内角色):env 白名单指定 + 受保护内部路由,可对任意 org 的任意页软删。
