# sync-spells

[English](./README.md)

在一个地方管理所有 AI agent 的 spells（commands、skills、agents），通过 symlink 同步到每个工具 — 写一次，处处可用。

## 功能

- **单一来源** — 只维护一个 spell 目录，告别分散的配置文件
- **基于 symlink 同步** — 源目录中的变更即时反映到所有工具
- **自动备份** — 替换真实目录前会安全备份
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

1. **Library**：所有可用 skill，位于 `skills-registry/`。
2. **Global**：跨场景共享的 skill，物理存放在 `skills-registry/global/`。
3. **Preset**：一组 skill 的工作模式，例如 `coding` 或 `lifeos`。
4. **Binding**：某个目录树默认使用哪个 preset。
5. **Project**：当前仓库使用哪个 preset。

Profile 仍然作为向后兼容的存储格式存在；日常命令优先使用 Preset 语义。

### 常用命令

- `spells skill list [--category]`：查看 Library 中的 skills
- `spells skill add <path>`：把 skill 加入 Library
- `spells skill new <name>`：创建新 skill
- `spells skill globalize <skill>`：移动 skill 到 `skills-registry/global/<name>`，并更新 profile/preset 引用
- `spells skill localize <skill> --to <category>`：把全局 skill 移回 `knowledge`、`coding`、`workflow` 或 `inbox`
- `spells bind [list|add|remove]`：管理目录树到 preset 的默认绑定
- `spells preset [list|show]`：管理 presets
- `spells use [preset]`：在当前项目启用 preset
- `spells resolve [preset]`：查看某个 preset 会解析出哪些项目级 skills
- `spells migrate [--dry-run]`：把既有 registry 转成当前分类结构
- `spells profiles [list|show]`：向后兼容的 profile 命令
- `spells doctor`：健康检查
- `spells config [get|set]`：配置管理

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

这个命令会把 skill 目录物理移动到 `skills-registry/global/<name>`，并把所有 profile/preset JSON 里的旧 Library 路径更新为新的 `global/<name>` 路径。如果裸 skill 名称匹配到多个 Library 路径，需要重新使用完整 Library 路径执行。

当某个全局 skill 应该回到特定分类时，使用 `localize`：

```bash
spells skill localize <skill> --to knowledge
spells skill localize <skill> --to coding
spells skill localize <skill> --to workflow
spells skill localize <skill> --to inbox
```

### 实现说明

`spells sync` 会把 `skills-registry/global/` 中的全局 skills 链接到每个已启用工具。`spells use [preset]` 会解析显式 preset 或当前目录命中的最长路径 binding，并把项目级 skills 从 registry 直接链接到 `.codex/skills` 和 `.claude/skills`；全局和 inbox skills 会被刻意排除在项目级链接之外。

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
