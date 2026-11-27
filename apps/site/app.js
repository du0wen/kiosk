// Portal configuration — update APP_URL once app.kioskai.dev is live on Vercel
const SITE_CONFIG = {
  appUrl: "https://app.kioskai.dev",
  mcpUrl: "https://app.kioskai.dev/mcp",
  githubUrl: "https://github.com/du0wen/kiosk",
  releasesUrl: "https://github.com/du0wen/kiosk/releases",
};

const INSTALL_SNIPPETS = {
  unix: `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/du0wen/kiosk/releases/latest/download/kiosk-cli-installer.sh | sh`,
  windows: `powershell -ExecutionPolicy ByPass -c "irm https://github.com/du0wen/kiosk/releases/latest/download/kiosk-cli-installer.ps1 | iex"`,
  docker: `git clone https://github.com/du0wen/kiosk.git\ncd kiosk\ncp docker-compose.env.example .env\ndocker compose up -d`,
  cargo: `cargo install --git https://github.com/du0wen/kiosk --path packages/cli`,
};

const MCP_SNIPPET = `{
  "mcpServers": {
    "kiosk": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch", "${SITE_CONFIG.mcpUrl}"],
      "env": {
        "KIOSK_API_TOKEN": "kiosk_api_..."
      }
    }
  }
}`;

const I18N = {
  en: {
    "nav.features": "Features",
    "nav.security": "Security",
    "nav.install": "Install",
    "nav.mcp": "MCP",
    "nav.console": "Open Console",
    "hero.badge": "Open Source · MIT License · v0.1.0",
    "hero.title": "Publish AI-generated HTML with zero-network isolation.",
    "hero.sub": "Turn single-file HTML artifacts from Claude Code, Codex, and Cursor into shareable, organization-scoped URLs with strict CSP sandboxing, full-page watermarks, and native MCP.",
    "hero.ctaPrimary": "Launch Console",
    "hero.ctaGithub": "View on GitHub",
    "hero.ctaSelfHost": "Self-Host Guide",
    "preview.shellBadge1": "Org-Private · Signed Gate",
    "preview.shellBadge2": "CSP: default-src 'none'",
    "preview.metric1": "CLI Publish",
    "preview.metric2": "External Requests",
    "preview.metric3": "Export Formats",
    "features.kicker": "Capabilities",
    "features.title": "Built for teams sharing AI artifacts safely",
    "features.sub": "Everything needed to move generated dashboards, reports, and prototypes out of local chats without exposing your domain to XSS or data exfiltration.",
    "f1.title": "Double-Origin & Zero-Network CSP",
    "f1.desc": "Console cookies are bound strictly to APP_ORIGIN via __Host- cookies. Served pages run on an isolated SERVE_ORIGIN inside sandboxed iframes blocking all outbound network calls.",
    "f2.title": "Native Rust CLI",
    "f2.desc": "Single-binary CLI for macOS, Linux, and Windows with OIDC browser login, same-URL updates, org template lookup, and PDF/PNG export. Zero runtime dependencies.",
    "f3.title": "Native MCP 2.0 Server",
    "f3.desc": "Connect Claude Desktop, Claude Code, Cursor, or Codex directly to POST /mcp with scoped API tokens for publishing, listing, visibility switching, and cleanup.",
    "f4.title": "Org Templates & Full-Page Watermarks",
    "f4.desc": "Manage versioned HTML style templates by category, apply organization branding, and enforce tamper-resistant diagonal viewer watermarks on both web and exports.",
    "f5.title": "Air-Gapped Export Microservice",
    "f5.desc": "Convert pages to Markdown or HTML locally, or render pixel-accurate PDF, PNG, and JPEG through an isolated Chromium container with external Internet disabled.",
    "f6.title": "Web Setup Wizard & Self-Hosting",
    "f6.desc": "Spin up with Docker Compose or Vercel + Neon. Built-in first-run /setup wizard configures Postgres, local or S3/R2 storage, and invite-only policies with zero hand-editing.",
    "arch.kicker": "Security Architecture",
    "arch.title": "Defense-in-depth isolation by default",
    "arch.sub": "Arbitrary AI-generated HTML never shares an origin, cookie jar, or network surface with your workspace console.",
    "arch.appTitle": "Console, API & Branded Shell",
    "arch.app1": "Next.js App Router console, OAuth/OIDC, and organization RBAC",
    "arch.app2": "__Host- session cookies strictly locked to APP_ORIGIN",
    "arch.app3": "REST v1 API, stateless MCP server (/mcp), and /v/:id branded wrapper",
    "arch.app4": "Mints short-lived HMAC serve tokens for org-private pages",
    "arch.bridge": "Sandboxed iframe + HMAC Token",
    "arch.serveTitle": "Stateless Zero-Network Serving",
    "arch.serve1": "Separate registrable domain with zero cookies and zero storage",
    "arch.serve2": "Strict CSP: default-src 'none'; connect-src 'none'; form-action 'none'",
    "arch.serve3": "Verifies signed token gate before returning org-private HTML",
    "arch.serve4": "Completely isolated from console credentials and internal APIs",
    "install.kicker": "Quick Start",
    "install.title": "Install in seconds, self-host anywhere",
    "install.sub": "Prebuilt native binaries for 5 platforms via GitHub Releases, or deploy the full stack on your own server with Docker Compose.",
    "install.tabUnix": "macOS / Linux",
    "install.tabWin": "Windows (PowerShell)",
    "install.tabDocker": "Docker Compose",
    "install.tabCargo": "Cargo (Source)",
    "mcp.kicker": "AI Agent Integration",
    "mcp.title": "Connect your coding assistant via MCP",
    "mcp.sub": "Add Kiosk to Claude Desktop, Cursor, or Codex once, then ask your agent to publish any generated HTML directly to your organization workspace.",
    "mcp.docsLink": "Read full MCP documentation →",
    "copy": "Copy",
    "copied": "Copied",
    "footer.copy": "MIT Licensed · Built for AI coding workflows",
    "footer.docs": "Self-Hosting",
    "footer.mcp": "MCP Guide",
    "footer.security": "Security",
    "footer.releases": "Releases",
    "footer.github": "GitHub",
  },
  zh: {
    "nav.features": "核心特性",
    "nav.security": "安全架构",
    "nav.install": "快速安装",
    "nav.mcp": "MCP 集成",
    "nav.console": "打开控制台",
    "hero.badge": "开源项目 · MIT 协议 · v0.1.0",
    "hero.title": "一键发布 AI 生成的 HTML，零外网沙盒隔离。",
    "hero.sub": "将 Claude Code、Codex、Cursor 生成的自包含 HTML 作品一键发布为组织私有或公开可分享链接，内置严格双源隔离、整页动态水印与原生 MCP 协议。",
    "hero.ctaPrimary": "进入在线控制台",
    "hero.ctaGithub": "GitHub 仓库",
    "hero.ctaSelfHost": "自托管部署指南",
    "preview.shellBadge1": "组织私有 · 签名令牌门",
    "preview.shellBadge2": "CSP: default-src 'none'",
    "preview.metric1": "CLI 发布耗时",
    "preview.metric2": "允许外部请求",
    "preview.metric3": "支持导出格式",
    "features.kicker": "核心能力",
    "features.title": "专为团队安全分享 AI 作品打造",
    "features.sub": "把本地对话里的原型、报表、仪表盘安全地分享给团队与客户，彻底隔离 XSS 与数据外泄风险。",
    "f1.title": "双源隔离与零外网 CSP",
    "f1.desc": "控制台 Session 通过 __Host- Cookie 严格绑定 APP_ORIGIN；页面内容在独立 SERVE_ORIGIN 的沙盒 iframe 中渲染，阻断一切外部网络请求。",
    "f2.title": "原生 Rust CLI",
    "f2.desc": "覆盖 macOS / Linux / Windows 的单文件二进制，零运行时依赖，支持浏览器 OIDC 登录、同 URL 更新、拉取组织模板与多格式导出。",
    "f3.title": "原生 MCP 2.0 协议",
    "f3.desc": "通过无状态 POST /mcp 端点直连 Claude Desktop、Claude Code、Cursor 与 Codex，支持发布、列表、可见性切换与权限隔离。",
    "f4.title": "组织样式模板与整页水印",
    "f4.desc": "按用途分类管理带版本历史的 HTML 模板，支持组织品牌主题与防篡改斜向整页水印，在网页浏览和 PDF/图片导出中同步生效。",
    "f5.title": "断网隔离导出微服务",
    "f5.desc": "本地即时导出 Markdown / HTML，并通过完全禁出网的无头 Chromium 渲染服务输出带品牌水印的高清 PDF、PNG 与 JPEG。",
    "f6.title": "Web 安装向导与极简自托管",
    "f6.desc": "支持 Docker Compose 一键启动或 Vercel + Neon 免费部署，内置首次运行 /setup 向导，可视化配置数据库、本地/S3 存储与邀请制策略。",
    "arch.kicker": "安全架构",
    "arch.title": "默认开启纵深隔离边界",
    "arch.sub": "任意用户或 AI 生成的 HTML 永远不会与控制台共享域名、Cookie 或网络出入口。",
    "arch.appTitle": "控制台、API 与品牌外壳",
    "arch.app1": "Next.js App Router 控制台、OAuth / OIDC 登录与多组织 RBAC",
    "arch.app2": "__Host- Session Cookie 严格锁死在 APP_ORIGIN",
    "arch.app3": "REST v1 API、无状态 MCP Server (/mcp) 与 /v/:id 品牌外壳",
    "arch.app4": "为组织私有页面实时签发短效 HMAC 访问令牌",
    "arch.bridge": "沙盒 iframe + HMAC 签名门",
    "arch.serveTitle": "无状态零外网隔离域",
    "arch.serve1": "独立可注册域名，零 Cookie、零存储、完全无状态",
    "arch.serve2": "严格 CSP：default-src 'none'; connect-src 'none'; form-action 'none'",
    "arch.serve3": "校验签名令牌通过后才返回组织私有 HTML 内容",
    "arch.serve4": "与主站登录凭证和内部管理接口彻底物理隔离",
    "install.kicker": "快速上手",
    "install.title": "秒级安装 CLI，随处自托管",
    "install.sub": "GitHub Releases 提供 5 平台预编译二进制与一键安装脚本，也可用 Docker Compose 一条命令私有化部署全套服务。",
    "install.tabUnix": "macOS / Linux",
    "install.tabWin": "Windows (PowerShell)",
    "install.tabDocker": "Docker Compose",
    "install.tabCargo": "Cargo 源码编译",
    "mcp.kicker": "AI 助手集成",
    "mcp.title": "通过 MCP 接入你的编码工具",
    "mcp.sub": "在 Claude Desktop、Cursor 或 Codex 中配置一次，即可让 AI 直接把生成的 HTML 发布到你的 Kiosk 组织空间。",
    "mcp.docsLink": "查看完整 MCP 配置文档 →",
    "copy": "复制",
    "copied": "已复制",
    "footer.copy": "MIT 开源协议 · 为 AI 编码工作流而生",
    "footer.docs": "自托管文档",
    "footer.mcp": "MCP 指南",
    "footer.security": "安全策略",
    "footer.releases": "版本下载",
    "footer.github": "GitHub",
  },
};

function detectLocale() {
  const saved = localStorage.getItem("kiosk_site_locale");
  if (saved === "en" || saved === "zh") return saved;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

let currentLocale = detectLocale();
let currentTab = "unix";

function applyTranslations() {
  const dict = I18N[currentLocale] || I18N.en;
  document.documentElement.lang = currentLocale === "zh" ? "zh-CN" : "en";
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (key && dict[key]) el.textContent = dict[key];
  }
  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) langBtn.textContent = currentLocale === "zh" ? "EN" : "中文";
  for (const btn of document.querySelectorAll("[data-copy-btn]")) {
    if (!btn.classList.contains("copied")) {
      btn.textContent = dict.copy;
    }
  }
}

function setInstallTab(tab) {
  currentTab = tab;
  const codeEl = document.getElementById("install-code");
  if (codeEl) codeEl.textContent = INSTALL_SNIPPETS[tab] || INSTALL_SNIPPETS.unix;
  for (const btn of document.querySelectorAll("[data-tab]")) {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  }
}

async function copyText(text, btn) {
  const dict = I18N[currentLocale] || I18N.en;
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add("copied");
    btn.textContent = dict.copied;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.textContent = dict.copy;
    }, 1800);
  } catch {
    // Fallback ignored if clipboard is blocked
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Wire configurable links
  for (const el of document.querySelectorAll("[data-app-link]")) {
    el.setAttribute("href", SITE_CONFIG.appUrl);
  }

  const mcpEl = document.getElementById("mcp-code");
  if (mcpEl) mcpEl.textContent = MCP_SNIPPET;

  setInstallTab(currentTab);
  applyTranslations();

  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    langBtn.addEventListener("click", () => {
      currentLocale = currentLocale === "zh" ? "en" : "zh";
      localStorage.setItem("kiosk_site_locale", currentLocale);
      applyTranslations();
    });
  }

  for (const btn of document.querySelectorAll("[data-tab]")) {
    btn.addEventListener("click", () => {
      setInstallTab(btn.getAttribute("data-tab"));
    });
  }

  const heroCopyBtn = document.getElementById("hero-copy-btn");
  if (heroCopyBtn) {
    heroCopyBtn.addEventListener("click", () => copyText(INSTALL_SNIPPETS.unix, heroCopyBtn));
  }

  const installCopyBtn = document.getElementById("install-copy-btn");
  if (installCopyBtn) {
    installCopyBtn.addEventListener("click", () => copyText(INSTALL_SNIPPETS[currentTab], installCopyBtn));
  }

  const mcpCopyBtn = document.getElementById("mcp-copy-btn");
  if (mcpCopyBtn) {
    mcpCopyBtn.addEventListener("click", () => copyText(MCP_SNIPPET, mcpCopyBtn));
  }
});
