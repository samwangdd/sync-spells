# Skills Registry v3 设计

> 日期：2026-05-16
> 版本：sync-spells 2.0.0 → 3.0.0
> 状态：Draft

## 背景

当前 skills-registry 有 6 层目录（global / domains / projects / workflows / inbox / external），存在三个问题：

1. **分类标准不统一** — global 和 domains 边界模糊，projects 和 workflows 有重叠
2. **Profile 维护成本高** — 每新增一个 skill 要手动更新所有相关 profile 的逐条列举
3. **层级过多** — 找 skill 时不知道该放哪，认知负担大

## 设计目标

- 目录分类只按**工作类型**一个维度
- Profile 声明**类别级**加载，新增 skill 自动生效
- TypeScript 实现替代当前 Bash 脚本

## 一、Registry 目录结构

### 新结构（4 类别 + 2 特殊）

```
skills-registry/
├── global/           ← 所有 profile 必加载
├── coding/           ← 编码相关
├── collaboration/    ← 沟通协作
├── workflow/         ← 工作流/流程
├── external/         ← 第三方 MCP 安装
└── inbox/            ← 休眠隔离
```

### 分类判断标准

| 问题 | 答案 → 放哪 |
|------|-------------|
| 所有项目都常用？ | → `global/` |
| 编码/前端/测试相关？ | → `coding/` |
| 沟通/Lark/Atlassian 相关？ | → `collaboration/` |
| 流程/task/CI/CD 相关？ | → `workflow/` |
| 第三方 MCP 安装的？ | → `external/` |
| 暂时不用？ | → `inbox/` |

### 与旧目录的映射

| 旧路径 | 新路径 |
|--------|--------|
| `global/*` | `global/*`（不变） |
| `domains/frontend/*` | `coding/*` |
| `domains/lark/*` | `collaboration/*` |
| `domains/figma/*` | `coding/*` |
| `projects/mexc/*`（技术类） | `coding/*` |
| `projects/mexc/*`（流程类） | `workflow/*` |
| `projects/lifeos/*`（流程类） | `workflow/*` |
| `projects/lifeos/*`（技术类） | `coding/*` |
| `workflows/*` | `workflow/*` |
| `external/*` | `external/*`（不变） |
| `inbox/*` | `inbox/*`（不变） |

## 二、Profile 格式

### 从 .txt 改为 .json

**旧格式（mexc-code.txt）：**
```
global/git-commit
domains/frontend/e2e:playwright
projects/mexc/kickoff
domains/lark/lark-doc
```

**新格式（profiles/mexc-code.json）：**
```json
{
  "name": "mexc-code",
  "categories": ["coding"],
  "extras": ["collaboration/lark-doc", "external/lokalise-skill"],
  "extends": null
}
```

### Profile 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Profile 名称 |
| `categories` | string[] | 是 | 要全量加载的目录（不含 global，global 永远加载） |
| `extras` | string[] | 否 | 从其他目录个别追加的 skill 路径 |
| `extends` | string \| null | 否 | 继承另一个 profile 的配置 |

### 解析规则

Profile 解析生成最终 skill 列表的顺序：

```
1. global/* 全量加载（始终）
2. extends 父 profile 解析结果（递归）
3. categories 声明的目录下所有 skill
4. extras 列举的个别 skill
5. 去重：同名 skill 以后加载的为准
```

### Profile 示例

```json
// profiles/global-lite.json
{
  "name": "global-lite",
  "categories": [],
  "extras": []
}
// → 只加载 global/

// profiles/mexc-code.json
{
  "name": "mexc-code",
  "categories": ["coding"],
  "extras": ["collaboration/lark-doc"]
}
// → global/* + coding/* + collaboration/lark-doc

// profiles/lifeos-knowledge.json
{
  "name": "lifeos-knowledge",
  "categories": ["workflow"],
  "extras": ["collaboration/lark-doc", "coding/llm-wiki"]
}
// → global/* + workflow/* + collaboration/lark-doc + coding/llm-wiki
```

### 核心优势

新增一个 skill 到 `coding/` 目录后，所有声明了 `categories: ["coding"]` 的 profile **自动获得**，无需手动修改 profile 文件。

## 三、CLI 命令

### 命令列表

| 命令 | 说明 | 与 v2 的变化 |
|------|------|-------------|
| `spells materialize <profile>` | 解析 profile，生成 active-skills/ symlink | 读 JSON + resolve 逻辑 |
| `spells use [--profile <name>] [dir]` | materialize + 项目 skills 目录指向 | 无大变化 |
| `spells profiles` | 列出所有 profile | 显示 categories/extras |
| `spells registry` | 列出各类别 skill 数量 | 适配新目录名 |
| `spells status [dir]` | 显示项目 skill 链接状态 | 无变化 |
| `spells doctor [dir]` | 检查配置问题 | 无变化 |
| `spells resolve <profile>` | 输出解析后的完整 skill 列表 | **新增** |
| `spells migrate` | 旧结构 → 新结构一次性迁移 | **新增** |

### materialize 核心逻辑

```
输入: profile name
1. 读 profiles/<name>.json
2. resolve: global 全量 + extends 递归 + categories 展开 + extras + 去重
3. 清空 active-skills/<name>/
4. 逐个 skill 建 symlink: active-skills/<name>/<skill-name> → skills-registry/<path>
输出: MaterializeResult
```

### resolve 去重规则

同名 skill（basename 相同）以解析顺序中**后出现的为准**：
- extras 中的同名覆盖 categories 中的
- 子 profile 中的同名覆盖 extends 父 profile 中的

## 四、数据迁移

### `spells migrate` 命令

一次性迁移，流程：

1. **备份** — 将整个 `skills-registry/` 复制到 `skills-registry-backup-<date>/`
2. **目录迁移** — 按映射表移动 skill 目录
3. **Profile 转换** — 读取旧 `.txt`，分析每个 skill 属于哪个新类别，生成 `.json`
4. **验证** — 对每个 profile 跑 resolve，确认 skill 数量与旧版一致
5. **输出报告** — 列出迁移了哪些、跳过了哪些、需要人工确认的

### Profile 转换启发式

从旧 `.txt` 的路径推断新 categories：
- 路径含 `domains/frontend` 或 `projects/mexc`（技术类）→ 归入 `coding`
- 路径含 `domains/lark` → 如果是 lark-doc 放 `extras`，否则不加载
- 路径含 `projects/lifeos`（流程类）→ 归入 `workflow`
- 路径含 `workflows/` → 归入 `workflow`
- 路径含 `global/` → 自动包含，不出现在 profile 中

## 五、TypeScript 代码变更

### 需要改的文件

| 文件 | 变更 |
|------|------|
| `package.json` | version → 3.0.0 |
| `src/types/index.ts` | Profile 类型加 categories/extras/extends；SkillCategory 改为新分类枚举 |
| `src/services/ProfileService.ts` | 读 JSON profile，新增 resolve 方法 |
| `src/services/MaterializeService.ts` | 接收 resolve 后的 skill 列表建 symlink |
| `src/services/SkillService.ts` | scanCategory 适配新目录名 |
| `src/commands/materialize.ts` | 调用新 resolve 逻辑 |
| `src/commands/profiles.ts` | 显示 categories/extras |

### 需要新增的文件

| 文件 | 说明 |
|------|------|
| `src/services/ResolveService.ts` | profile resolve 核心逻辑 |
| `src/commands/resolve.ts` | `spells resolve` 调试命令 |
| `src/commands/migrate.ts` | `spells migrate` 迁移命令 |

### 不改的文件

- `src/lib/` — symlink、config、backup、errors 不变
- `src/services/ProjectService.ts` — activate 逻辑不变，只接收解析后的列表
- `src/commands/use.ts` — 组合 materialize + activate，逻辑不变

### ResolveService 核心接口

```typescript
interface ResolvedProfile {
  name: string;
  skills: string[];       // 最终 skill 路径列表（去重后）
  sources: {
    global: string[];     // 来自 global/ 的
    extends: string[];    // 来自 extends 父 profile 的
    categories: string[]; // 来自 categories 展开的
    extras: string[];     // 来自 extras 的
  };
}

class ResolveService {
  resolve(profileName: string): Promise<ResolvedProfile>;
}
```

## 六、测试策略

- 单元测试覆盖 ResolveService 的去重、extends 递归、categories 展开
- ProfileService 的 JSON 解析和校验
- 迁移命令的集成测试（用临时目录）
- 现有 materialize/use 测试更新断言

## 七、风险与约束

- **迁移不可自动回滚** — backup 目录需手动恢复
- **extends 递归深度** — 限制最大 5 层，防止循环引用
- **external/ 不自动加载** — 第三方 skill 只能通过 extras 引入，避免不可控的 context 膨胀
- **旧 .txt profile 不再兼容** — migrate 后旧文件保留但不再被读取
