# sync-spells

[English](./README.md)

在一个地方管理所有 AI agent 的 spells（commands、skills、agents），通过 symlink 同步到每个工具 — 写一次，处处可用。

## 功能

- **单一来源** — 只维护一个 spell 目录，告别分散的配置文件
- **基于 symlink 同步** — 源目录中的变更即时反映到所有工具
- **自动备份** — 替换真实目录前会安全备份
- **支持的工具**：
  - **Claude Code** — 同步 `commands`、`skills` 和 `agents`
  - **Cursor** — 同步 `commands`
  - **Codex** — 同步 `commands`
  - **Kiro** — 同步 `commands`

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

显示每个工具每条映射的链接状态。

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
