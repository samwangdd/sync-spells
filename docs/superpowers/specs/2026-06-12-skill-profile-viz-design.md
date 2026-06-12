# Skill Profile 可视化 Web（`spells web`）设计

- 日期：2026-06-12
- 状态：设计待评审
- 所在仓库：`codeLab/sync-spells`（sync-spells CLI 源码）

## 1. 背景与目标

sync-spells 用 `profiles/*.json` 描述「激活配方」，用 `skill-category/<类>/<skill>/SKILL.md` 存放各 skill。
目前只能靠读 JSON 与目录理解某个场景到底激活了哪些 skill，不够直观。

目标：提供一个本地 Web 界面，用参考项目（mexc-software-platform）那种卡片式视觉风格，
让用户**浏览**所有 skill、**按场景（profile）查看**生效集合，并**在线编辑** profile 配方并写回 JSON。

非目标（YAGNI）：
- 不做远程部署 / 多人协作 / 鉴权。
- 不做 SKILL.md 正文编辑（仅展示）。
- 不重构现有 `config.ts` 的类型校验为 Zod（保持聚焦）。

## 2. 数据模型（现状，只读理解）

- `profiles/*.json`：`{ name, categories?: string[], extras?: string[], excludes?: string[], skills?: string[] }`
  - 解析（resolve）语义（见 `scripts/materialize-profile.sh` 与 `ResolveService`）：
    `skills[]` 原样 + 每个 `categories[]` 展开为该类下全部 `category/skill` + `extras[]`，再减去 `excludes[]`，**保序去重**。
- `skill-category/<category>/<skill>/SKILL.md`：frontmatter 含 `name` / `description` / 可选 `version` / 可选 `metadata.requires.bins`。
- 分类：coding / foundation / knowledge / system / workflow / writing / inbox / mcp-registry（约 129 个 skill）。
- CLI 配置 `~/.sync-spells/config.json`：`source`（= skill-category 目录）、`profilesDir`、`projectBindings`（路径 → profile，用于反查"场景在哪些目录自动生效"）。

## 3. 技术栈与约束

- **类型优先**：Zod schema 作单一真相，类型用 `z.infer` 派生；前后端共享同一份 contract，零类型漂移。
- 后端：TypeScript，Node 内置 `http`（不引 Express），复用现有 service 层。
- 前端：独立 `webui/` —— Vite + React + TypeScript + Tailwind CSS（Tailwind v4 + `@tailwindcss/vite`）。
- 共享运行时依赖：`zod`。
- 避开参考项目的 Next.js / Turborepo / NestJS / Prisma 重栈。

### 依赖增量

- 运行时（dependencies）：`zod`
- 前端构建（devDependencies）：`vite`、`@vitejs/plugin-react`、`react`、`react-dom`、`@types/react`、`@types/react-dom`、`tailwindcss`、`@tailwindcss/vite`

## 4. 架构与模块边界

```
src/
  shared/
    contract.ts          ★ Zod schema + z.infer 类型：ProfileRecipe / SkillCard /
                           ProfileView / CategoryView / AppState / API 请求响应
    resolveRecipe.ts     ★ 纯函数 resolveRecipe(recipe, catalogByCategory) → string[]
                           （skills[] 原样 + categories 展开 + extras，再 − excludes，保序去重；
                            与 materialize-profile.sh / ResolveService 语义完全一致）
  web/
    frontmatter.ts       手写解析 SKILL.md frontmatter（description/version/requires.bins），无 gray-matter
    SkillCatalogService.ts  组装 AppState（复用 SkillService/ResolveService/ProfileService + frontmatter）
    ProfileWriter.ts     Zod 校验 + 业务校验(ref/category 存在) + 写前备份 + 写回 JSON
    server.ts            Node http：路由静态资源(webui/dist) + /api/*，类型化收发
  commands/
    web.ts               runWeb（纯逻辑，组装依赖、返回 server handle）/ registerWeb（CLI I/O）
webui/
  index.html, vite.config.ts
  src/main.tsx, App.tsx
  src/api.ts             类型化客户端，用 contract 的 schema parse 响应
  src/views/{ScenesView,CatalogView}.tsx
  src/components/{ProfileCard,SkillCard,RecipeEditor,ResolvePreview,...}.tsx
  src/lib/                复用 src/shared/*（经 tsconfig path 引入）
```

各单元职责单一、可独立理解与测试；解析核心 `resolveRecipe` 前后端共用，杜绝双写漂移。

## 5. API 契约（均以 Zod schema 定义于 contract.ts）

- `GET /api/state` → `AppState = { profiles: ProfileView[], skills: SkillCard[], categories: CategoryView[] }`
  - `SkillCard = { ref, name, category, description?, version?, requiresBins?: string[], inProfiles: string[] }`
    - `inProfiles`：哪些 profile 解析后包含该 skill（"出现在 N 个场景"）。
  - `ProfileView = { name, categories: string[], extras: string[], excludes: string[], resolvedRefs: string[], skillCount, boundPaths: string[] }`
    - `boundPaths`：从 config.projectBindings 反查的绑定目录。
  - `CategoryView = { name, description?, skillRefs: string[] }`
- `PUT /api/profiles/:name`  body=`ProfileRecipe = { name, categories?, extras?, excludes?, skills? }`
  → 校验→备份→写文件→返回更新后的 `ProfileView`
  - `skills?` 为高级字段，UI 不编辑但原样保留写回。
  - 4xx：Zod shape 非法或引用未知 ref/category（不写文件）。
- `GET /api/skill/:ref/markdown`（可选）→ `{ markdown: string }`，供卡片抽屉看 SKILL.md 全文。

## 6. 前端视图与交互

顶栏：标题 + 视图切换（场景 ⇄ 目录）+ 全局搜索 + 保存/脏状态提示。
视觉沿用参考的 `--mx-*` 设计 token 风格（暖灰底、蓝主色、柔和阴影、圆角），用 Tailwind 实现。

### 场景视图（Profiles）—— 主视角
- profile 卡片网格：名字 + 解析后 skill 数 + 绑定目录（boundPaths）。
- 点入详情，分两块：
  - **配方区（可编辑）**：直接增删 `categories` / `extras` / `excludes` 三个清单。
  - **解析预览区（实时只读）**：前端用共享 `resolveRecipe` 本地实时重算最终生效 skill，按 category 分组展示卡片。
- 「保存」→ `PUT`；未保存时顶栏 dirty 提示。

### 目录视图（Catalog）—— 理解所有 skill
- 全部 skill 按 category 分区平铺卡片：名字 + 描述 + version + 依赖 CLI 徽章 + "出现在 N 个场景"徽章。
- 搜索 / 按 category 过滤；点卡片 → 抽屉看 SKILL.md 全文 + 包含它的 profile 列表。

### 编辑模型决策
采用**直控配方三清单 + 实时预览**：忠于真实 JSON、所见即所得、写回可预测。
不采用"智能开关"（自动推断落 extras/excludes，写回不可预测）。

编辑器聚焦 `categories` / `extras` / `excludes` 三清单；profile 里若已有 `skills[]`（原始 ref，
当前各 profile 基本不用）作为高级字段**原样保留写回、参与实时预览**，但 MVP 不在 UI 暴露其编辑。

## 7. 构建与运行

- 使用：`npm run web:build`（Vite → `webui/dist`）→ `spells web [--port <n>] [--no-open]` 起 Node 服务托管 dist + `/api`，默认开浏览器。
- 开发：`npm run web:dev` 同起 Vite dev server（HMR，:5173）+ 后端 API（:4178），Vite proxy `/api` 到后端。
- `spells web` 若 `webui/dist` 不存在 → 提示先跑 `npm run web:build`。
- 端口被占 → 自动 +1 重试，多次失败才报错退出。

## 8. 错误处理

- PUT 非法配方（Zod shape / 未知 ref/category）→ 4xx + 错误信息，UI 内联报错，**不写文件**。
- 某 SKILL.md 缺失或 frontmatter 畸形 → 该卡片仅显示名字、无描述，整体不中断（优雅降级）。
- 写文件失败（如 iCloud 锁定）→ 500，UI 保留未保存状态并提示重试。
- 写 profile 前用 `backup.ts` 备份旧文件到 `~/.sync-spells/backups/<timestamp>/`。

## 9. 测试策略（TDD，jest）

- `resolveRecipe`：纯函数，覆盖 categories 展开 / extras 补 / excludes 排除 / 保序去重 / 边界。**这是前端实时预览的正确性保证。**
- `parseFrontmatter`：有/无 description、含 version、含 requires.bins、畸形 YAML 优雅降级。
- `SkillCatalogService.getState()`：临时目录造 category/skill/profile，断言卡片描述、`inProfiles` 反查、profile 解析数、boundPaths。
- `ProfileWriter`：Zod 拒非法 shape、业务校验拒未知 ref/category、写前生成 backup、写回 JSON 缩进 2 空格 + 尾换行（与现有文件一致）。
- `runWeb`：轻量，验证能载 config 并组装出 AppState（不实拉起长跑 server）。
- React 组件：纯 I/O，靠 TS 类型 + Zod 运行时校验兜底，**不引入 Vitest/Testing-Library**。

测试沿用本仓惯例：mock `os.homedir()` 到临时目录、`jest.resetModules()` + `require()` 重载。

## 10. 数据流

`spells web` → 载 config → 起 server → 浏览器 `GET /` 取静态页 →
`app GET /api/state` 渲染场景+目录 → 编辑配方（前端 `resolveRecipe` 本地实时重算预览）→
保存 `PUT /api/profiles/:name` → 后端 Zod+业务校验 → 备份 → 写文件 → 回最新 `ProfileView` → UI 更新。

## 11. 风险与开放点

- iCloud 同步与本地写并发：写前备份缓解；若 iCloud 正在下载占位文件，写可能失败 → 走 500 重试路径。
- `webui/` 引入构建步骤，使本仓从纯 CLI 变为含前端工程；需在 README/CLAUDE.md 补构建说明（后续实现阶段处理）。
- 共享类型跨 `src/` 与 `webui/`：通过 tsconfig path / 相对 import 引 `src/shared/*`，需确保 Vite 能解析仓库根外/同仓 TS。
