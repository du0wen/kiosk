---
paths:
  - "cli/**"
  - "packages/cli/**"
---

# CLI 规则(skill 主路径)

- CLI 是 skill 主路径(占位包名 `@kiosk/cli`,bin `kiosk`)。是 REST API 的客户端;curl 为兜底。
- 命令:`login` / `publish <file>` / `list` / `open` / `delete` / `install-skill [--claude] [--codex]` / `whoami` / `logout`。
- **`publish` 身份解析顺序**:`--id` → `--new` → 查 `.kiosk/pages.json`(从文件目录向上找最近的 `.kiosk/`,按相对路径映射)命中则 PUT 更新、未命中则 POST 新建并写回映射。
- HTML 走**文件 body**(不进模型上下文、无 shell 转义)。默认**只打印 URL 一行**(便于 AI 抓取);`--json` 给结构化。可选 `--title`、`--open`。
- **鉴权**:`KIOSK_TOKEN` 环境变量**优先于** `~/.config/kiosk/config.json`(权限 600);`apiBase` 可被 `KIOSK_API_BASE` 覆盖。
- `install-skill`:写 Claude Code `.claude/skills/kiosk/SKILL.md` 与 Codex 等价说明;skill 文档 **P1 保持英文**。
- 错误 → 友好提示 + **非零退出码**;网络错误给重试提示。
- `.kiosk/pages.json` 结构:`{ version, pages: { "<相对路径>": { id, url } } }`;P1 不自动改 `.gitignore`。
