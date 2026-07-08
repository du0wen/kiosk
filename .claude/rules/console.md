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
- **平台管理员**(≠ 组织内角色):env 白名单指定 + 受保护内部路由,可对任意 org 的任意页软删。
