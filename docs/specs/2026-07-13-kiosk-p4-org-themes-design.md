# Kiosk P4 设计 — 组织主题 / 品牌(文字 + 颜色)

> 状态:定稿(待实现)。上游:serving v2(`/v` 品牌外壳)、P3 导出(`renderRemote` 契约)。动非平凡代码前先读本文。

## 1. 目标与范围

org 可配置**品牌**,应用到两处:**`/v` 品牌外壳**(顶栏)与**导出水印**。

- **范围内**:`org_settings` 表(主题色 + 导出水印文字);`/v` 外壳按所属 org 应用品牌名 + 主题色;导出水印(HTML 页脚即时生效;PDF/PNG/JPEG 透传给渲染服务,待 P3-2 生效);`/settings` 配置 UI(owner/admin)。
- **范围外**:logo 图片 / blob 存储、每页覆盖主题、动态按人水印、字体等更细主题、裸 `/p` serving 的主题(裸页保持极简)。
- **非目标**:不改可见性/权限/双源语义;品牌名复用 `organization.name`(不加独立字段)。

## 2. 数据模型

新建 app 自有表 **`org_settings`**:
- `organizationId` text PK → `organization.id`(cascade)
- `themeColor` text 可空(`#rrggbb`;写入时校验格式,防 CSS 注入)
- `exportWatermark` text 可空
- `createdAt` / `updatedAt` timestamptz

无其它表改动;品牌**名**取 `organization.name`。

## 3. 服务层

`src/lib/org-settings.ts`:
- `getOrgSettings(organizationId): Promise<{ themeColor: string | null; exportWatermark: string | null }>`(无行 → 全 null)。
- `setOrgSettings(organizationId, patch: { themeColor?: string | null; exportWatermark?: string | null }): Promise<void>`(upsert;`themeColor` 校验 `^#[0-9a-fA-F]{6}$`,非法则拒/忽略)。
- `getOrgBranding(organizationId): Promise<{ name: string | null; themeColor: string | null }>`(join `organization.name` + settings,供 `/v` 用)。
- `isHexColor(v): boolean`(纯函数,单测)。

## 4. 品牌外壳应用(`/v/<id>`)

- `/v` 外壳(server component)按**该页所属 org** 读 `getOrgBranding(page.organizationId)`:
  - 顶栏品牌文字 = org `name`(缺省 "Kiosk");
  - `themeColor` 作顶栏强调(底色或品牌字色 + 下边框);缺省回落现有默认样式。
- 公开页也显示**所属 org 品牌**(分享出去即带该 org 门面)。
- `themeColor` 仅进受控 inline style(已校验 hex),不接受任意 CSS。

## 5. 导出水印

- `exportPage` 读所属 org 的 `exportWatermark`:
  - **HTML**:非空则在导出 HTML 末尾追加一段转义后的页脚水印(`<footer>…</footer>`);**即时生效**。
  - **PDF/PNG/JPEG**:把 `watermark` 透传给 `renderRemote` → **`/render` 契约加可选 `watermark`**(渲染服务 P3-2 将来叠加);缺 P3-2 时这三种仍 502,水印待生效。
  - **MD**:不加。
- `renderRemote(html, format, watermark?)` + `render/README.md` 契约同步更新(`body` 增 `watermark?`)。

## 6. 配置 UI

`/settings`:owner/admin 表单配 `themeColor`(颜色选择/hex 输入)+ `exportWatermark`(文本);`can(role, "org.update")` gated(member 不可);经 server action 调 `setOrgSettings`。i18n EN/ZH。

## 7. 与前序的关系

- `org_settings` = P3 spec 里搁置的那张表,此处落地。
- 导出水印 = 之前从 P3 砍出、此处接回(仍是**静态 org 文字**;动态按人水印仍属将来)。
- `/render` 契约扩展(加 `watermark?`)→ 更新 `render/README.md`;P3-2 实现时据此叠加。
- serving v2 外壳扩展(读品牌)。

## 8. 明确不做(P4 外)

logo/图片/blob、每页主题覆盖、动态按人水印、字体/圆角等细粒度主题、主题应用到裸 `/p`、主题预览所见即所得编辑器。

## 9. 测试要点

- `isHexColor`:合法/非法用例。
- `getOrgSettings`/`setOrgSettings`:无行→null;set 后读回;非法 `themeColor` 被拒。
- `getOrgBranding`:join 出 org name + themeColor。
- `exportPage`:HTML 含水印页脚(设了水印时)/ 不含(未设);pdf 分支把 `watermark` 传进 `renderRemote`(mock,断言参数)。
- `/settings` 鉴权:member 不能改(server action 拒);owner/admin 可。
- `/v` 应用主题:build + 手动(顶栏显 org 名 + 主题色)。
