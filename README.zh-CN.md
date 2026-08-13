# sync-spells

[English](./README.md)

在一个地方管理所有 AI agent 的 spells（commands、skills、agents），通过 symlink 同步到每个工具 — 写一次，处处可用。

## 功能

- **单一来源** — 只维护一个 spell 目录，告别分散的配置文件
- **基于 symlink 同步** — 源目录中的变更即时反映到所有工具
- **自动备份** — 替换真实目录前会安全备份
- **跨工具 agents** — 一份 canonical 的 agent `.md` 按工具适配：`.md` symlink（Claude Code / Cursor）、生成 `.toml`（Codex）、生成 `.json`（Kiro）
- **支持的工具**：
  - **Claude Code**、**Agents**、**Codex**、**Cursor**、**Kiro** — 同步全局 `skills`

## 安装

```bash
git clone https://github.com/samwangdd/sync-spells.git
cd sync-spells
npm install
npm run build
npm link
```

此操作会注册全局 `spells` 命令。

## 使用

### 初始化

```bash
spells setup
```

交互式引导：指定 spell 源目录并选择要启用的工具。配置保存至 `~/.sync-spells/config.json`。

### 同步 spells

```bash
spells sync
```

将源目录通过 symlink 链接到各工具的配置目录。已有的真实目录会被备份到 `~/.sync-spells/backups/`。

`spells sync` 也会刷新所有已配置的项目 binding：每个绑定项目会按自己的 preset 重新物化 skills，不需要逐个仓库执行 `spells use`。

`spells sync` 还会执行一次 **agents pass**。Agent 定义只写一份 canonical Markdown，放在 `agents/{global,coding,system}/*.md`（YAML frontmatter + 正文），并按每个启用的工具适配：

| 工具 | 目标 | 方式 |
|------|------|------|
| Claude Code | `~/.claude/agents/<name>.md` | symlink（直通） |
| Cursor | `~/.cursor/agents/<name>.md` | symlink（直通） |
| Codex | `~/.codex/agents/<name>.toml` | 由 frontmatter + 正文生成 |
| Kiro | `~/.kiro/agents/<name>.json` | 由 frontmatter + 正文生成 |

生成的文件是派生产物 —— 永远改 canonical 的 `.md`，不要改 `.toml`/`.json`。已存在的真实文件在被替换前会先备份。

### 推入新 spells

```bash
spells push [path]
```

将指定目录（默认当前目录）中的 spell 文件复制到源目录。已存在的文件会跳过。

### 查看状态

```bash
spells status
```

显示当前项目启用的 preset 和已链接的 skills。使用 `spells status --verbose` 查看全局工具映射 symlink 状态。

## Skill 管理

SyncSpells 只有五个日常概念：

1. **Library**：所有可用 skill，位于 `skill-category/`。
2. **Global profile**：最小全局可用集合，定义在 `profiles/global.json`。
3. **Preset**：一组 skill 的工作模式，例如 `coding` 或 `lifeos`。
4. **Binding**：某个目录树默认使用哪个 preset。
5. **Project**：当前仓库使用哪个 preset。

Profile 仍然作为向后兼容的存储格式存在；日常命令优先使用 Preset 语义。

### 常用命令

- `spells skill list [--category]`：查看 Library 中的 skills
- `spells skill add <path>`：把 skill 加入 Library
- `spells skill new <name>`：创建新 skill
- `profiles/global.json`：用显式 `extras` 逐条加入最小全局 profile
- `spells skill localize <skill> --to <category>`：把全局 skill 移回 `knowledge`、`coding`、`workflow` 或 `inbox`
- `spells bind [list|add|remove]`：管理目录树到 preset 的默认绑定
- `spells preset [list|show]`：管理 presets
- `spells use [preset]`：在当前项目启用 preset
- `spells resolve [preset]`：查看某个 preset 会解析出哪些项目级 skills
- `spells migrate [--dry-run]`：把既有 registry 转成当前分类结构
- `spells profiles [list|show]`：向后兼容的 profile 命令
- `spells doctor`：健康检查
- `spells workspace [init|doctor|migrate]`：管理 workspace manifest,校验 skill/agent symlink 健康
- `spells config [get|set]`：配置管理

## MCP 管理

MCP 配置和 skills 分开管理。共享 MCP 放在 `mcp-registry/global.json`，项目 preset 放在 `mcp-registry/presets/<preset>.json`。

```bash
spells mcp status
spells mcp sync --global --dry-run
spells mcp sync --global
spells mcp use coding --dry-run
spells mcp use coding
```

全局 MCP 同步只合并 sync-spells 托管的 server 条目到 Claude Code、Cursor 和 Codex 的目标配置文件。已有的用户配置会保留；同名但未托管的条目默认视为冲突，不会覆盖。

## Workspace

iCloud 的 `sync-spells/` 目录是一个受管 **workspace**。其根目录下的 `workspace.json` manifest 声明了 CLI 托管的目录：

```json
{ "version": 1, "library": "skill-category", "profiles": "profiles", "agents": "agents", "legacy": [] }
```

```bash
spells workspace init      # 写入 workspace.json（幂等）
spells workspace doctor    # 校验 manifest 目录 + 工具 symlink 健康
spells workspace migrate   # 创建 manifest 声明的、当前缺失的目录
```

当 manifest 声明的目录缺失、某工具的 skill 映射 symlink 断链或指向错误目标、或 Claude Code / Cursor 的 agent 直通 symlink 悬空时，`workspace doctor` 会报告问题，便于在同步漂移造成影响前发现。修复跑 `spells sync`。

### 快速开始

1. 查看可用 skills：
   ```bash
   spells skill list
   ```

2. 查看 presets：
   ```bash
   spells preset list
   ```

3. 在项目中启用 preset：
   ```bash
   cd /path/to/project
   spells use
   ```

4. 查看状态：
   ```bash
   spells status
   ```

### Global Skills

当某个 skill 应该同时给 LiveOS 和 Coding 使用时，可以把它全局化：

```bash
spells skill globalize <skill>
```

需要全局可用的 skill 放进 `profiles/global.json`，逐条写入 `extras`。不要在 global profile 里整类引入 category，避免全局 skill 数量膨胀。

当某个全局 skill 应该回到特定分类时，使用 `localize`：

```bash
spells skill localize <skill> --to knowledge
spells skill localize <skill> --to coding
spells skill localize <skill> --to workflow
spells skill localize <skill> --to inbox
```

### 实现说明

`spells use [preset]` 会解析显式 preset 或当前目录命中的最长路径 binding，并把项目级 skills 从 skill category 直接链接到 `.codex/skills` 和 `.claude/skills`；inbox skills 会被刻意排除在项目级链接之外。

### `spells web`

启动本地 Web UI：浏览全部 skills、查看每个 profile 解析出的 skill 集合，并带实时预览地编辑 profile recipe（`categories` / `extras` / `excludes`）后写回 JSON。

```bash
npm run web:build          # 首次 / 前端改动后
spells web                 # http://127.0.0.1:4178，自动开浏览器
spells web --port 5000     # 指定端口（被占用时自动 +1）
spells web --strict-port   # 端口被占用时直接失败，不顺延
spells web --host 0.0.0.0  # 暴露到局域网（该 API 无鉴权）
spells web --no-open       # 不开浏览器
```

默认只监听回环地址 —— 这个 API 没有任何鉴权。

### `spells service`（macOS 后台常驻）

把 `spells web` 托管成 launchd agent：登录即自启，进程挂掉自动拉起。

```bash
npm run web:build            # 必需 —— 没有 webui/dist 会拒绝安装
spells service install       # 写入 plist 并启动
spells service status        # 运行状态、pid、url、node 路径
spells service restart
spells service logs -f       # 跟踪错误日志
spells service uninstall
```

几个要点：

- **plist**：`~/Library/LaunchAgents/com.sync-spells.web.plist`；**日志**：`~/.sync-spells/logs/web.{out,err}.log`。
- `KeepAlive = {SuccessfulExit: false}`：崩溃会被拉起（10s 节流），而主动 `uninstall` / `launchctl bootout` 停掉后不会被拉回来。
- agent 带 `--strict-port` 运行，端口冲突时明确失败，而不是悄悄漂到 4179 让书签失效。
- launchd 没有 `$PATH`，所以 plist 里写的是 node 的**绝对路径**。`install` 会优先选稳定位置（`/opt/homebrew/bin/node`），而不是你当前正在用的版本管理器路径 —— nvm/volta 的路径会在下次升级 node 后消失。可用 `--node <path>` 覆盖；`status` 会在该路径失效时报警。
- 若端口已被别的进程占用，`install` 会告警。一个绑在 `0.0.0.0` 的游离 `spells web` 在 BSD socket 语义下能与 agent 的 `127.0.0.1` 绑定共存，会静默提供旧代码 —— 用 `lsof -nP -iTCP:4178 -sTCP:LISTEN` 揪出来。
- 移动仓库位置或升级 node 之后需要重装：plist 里硬编码了这两个路径。

## 本地开发

```bash
npm run dev          # 通过 ts-node 直接运行，无需编译
npm run build        # 编译 TypeScript → dist/
npm test             # 运行全部测试
```

运行单个测试文件：

```bash
npx jest __tests__/lib/symlink.test.ts
```

## License

MIT
