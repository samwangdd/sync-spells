# Skill 30 天使用情况分析（全部分类）

生成时间：2026-09-12
分析范围：`skill-category/` 下全部分类，共 **171 个 skill**：
- coding + workflow 专项：54 个
- 其他 global 分类（foundation / frontend-performance / git / i18n / knowledge / lark / mattpocock / mcp-registry / PM / QA / system / testing / third-party / visual-design / writing）：117 个
- 不含 `inbox/`（临时分类，尚未定型）

数据来源：Claude Code / Codex / Kiro 三个工具的本机会话日志，近 30 天
不含 Cursor（本次分析范围排除）

## 方法说明

- **Claude Code**：扫描 `~/.claude/projects/**/*.jsonl`（近 30 天，按文件 mtime 过滤），匹配 `Skill` 工具调用的精确字段 `"skill":"<name>"`。这是显式调用记录，无歧义。
- **Codex**：扫描 `~/.codex/archived_sessions/`、`~/.codex/sessions/` 下的 `*.jsonl`（近 30 天），匹配 `exec` 命令中读取 `skills/<name>/SKILL.md` 的字符串。Codex 没有独立的 "Skill 工具调用" 事件，是通过模型自主 `cat`/`rtk cat` 该技能的 SKILL.md 来触发的，因此这里统计的是"被读取/激活"的次数，可能略宽松于"严格显式调用"，但仍是可靠信号（误报概率低，不会是纯文本提及）。
- **Kiro**：扫描 `~/.kiro/sessions/**/messages.jsonl`（近 30 天），匹配 `disclose_context` 等工具调用中的 `"name":"<skill>"` 字段。
- 命中数是**该 skill 名称在日志中被作为工具调用参数出现的次数**，不是"消息提及次数"，避免把闲聊中提到技能名字误判为"用过"。
- 三个工具命中数为 0 且总和为 0 的，判定为**近 30 天未被任何工具调用过**。

## 总体结论

- 171 个 skill 中，**36 个确认闲置**（存在满30天仍零命中），**21 个太新排除**（创建不足30天且零命中；另有 27 个是创建不足30天但已有非零命中，属于正常活跃/低频，不计入排除清单）。
- coding + workflow 专项（54个）：17 个确认闲置，全部在 workflow 分类，coding 无闲置。
- 其他 global 分类（117个）：19 个确认闲置，分布在 frontend-performance、git、knowledge、mcp-registry、writing、lark、QA 等分类。

## 一、coding / workflow 专项分析（54 个）

### coding 分类（0 个零命中）

`coding/` 下 10 个 skill 全部在近 30 天有过至少 1 次调用（大多数是通过 Codex 大量命中，比如 `think-before-coding` 1773 次、`mexc-coding-loop` 1112 次）。**coding 分类没有闲置技能。**

### workflow 分类 — 确认闲置（17 个，占该分类 43 个的 40%）

| skill | 创建日期 | 说明 |
|---|---|---|
| `defuddle` | 2026-06-02 | 网页内容提取，未见调用 |
| `epub-cover` | 2026-07-13 | 电子书封面生成，未见调用 |
| `galio-oncall` | 2026-06-17 | oncall 相关，未见调用 |
| `harness-self-improve` | 2026-08-12 | harness 自我改进，未见调用 |
| `image-compression` | 2026-07-20 | 图片压缩，未见调用（`media-compression`/`video-compression` 亦零命中，压缩类三件套全灭） |
| `image-host-migration` | 2026-07-13 | 图床迁移，未见调用 |
| `jira-create` | 2026-08-07 | Jira 建单，未见调用（但 `jira-create-subtask`、`jira-create-sec-audit` 状态不同，见下方"低频"表） |
| `jira-create-sec-audit` | 2026-06-02 | 未见调用 |
| `jira-date-search` | 2026-06-02 | 未见调用 |
| `lark-ticket-group` | 2026-07-13 | 未见调用 |
| `marathon` | 2026-06-02 | 未见调用 |
| `marathon-fix` | 2026-06-02 | 未见调用 |
| `media-compression` | 2026-07-20 | 未见调用 |
| `pr-asset-pipeline` | 2026-07-13 | 未见调用 |
| `quarterly-review` | 2026-07-02 | 未见调用 |
| `ship` | 2026-07-20 | 未见调用（该目录仅有 `DESIGN.md`，无 `SKILL.md`，可能尚未完工） |
| `video-compression` | 2026-07-20 | 未见调用 |

### workflow 分类 — 太新排除（2 个，不计入闲置判定）

| skill | 创建日期 | 存在天数 | 说明 |
|---|---|---|---|
| `lark-base-bug-fix-loop` | 2026-09-12 | 0 天 | 今天刚创建，零命中纯粹是因为还没来得及被使用 |
| `mexc-nginx-route` | 2026-08-27 | 16 天 | 未满 30 天窗口，零命中不能作为闲置证据 |

## 完整命中矩阵（coding + workflow 专项，54 个，供参考）

| category | skill | 创建日期 | Claude Code | Codex | Kiro | 合计 |
|---|---|---|---|---|---|---|
| coding | changed-files-quality-gate | 2026-06-02 | 0 | 868 | 2 | 870 |
| coding | happy-hour | 2026-08-15 | 0 | 32 | 0 | 32 |
| coding | maintenance-routine-design | 2026-08-18 | 0 | 80 | 0 | 80 |
| coding | mexc-coding-loop | 2026-06-18 | 0 | 1110 | 2 | 1112 |
| coding | review-css-scss | 2026-06-02 | 0 | 615 | 2 | 617 |
| coding | scss-component-conventions | 2026-06-02 | 1 | 527 | 0 | 528 |
| coding | sensors-impl | 2026-06-02 | 1 | 428 | 1 | 430 |
| coding | software-design-philosophy | 2026-07-13 | 1 | 502 | 0 | 503 |
| coding | think-before-coding | 2026-06-02 | 8 | 1765 | 0 | 1773 |
| coding | vercel-react-best-practices | 2026-06-02 | 0 | 429 | 0 | 429 |
| workflow | ask-for-review | 2026-09-05 | 0 | 50 | 0 | 50 |
| workflow | calendar-event | 2026-06-02 | 0 | 3 | 0 | 3 |
| workflow | **defuddle** | 2026-06-02 | 0 | 0 | 0 | **0** |
| workflow | **epub-cover** | 2026-07-13 | 0 | 0 | 0 | **0** |
| workflow | **galio-oncall** | 2026-06-17 | 0 | 0 | 0 | **0** |
| workflow | **harness-self-improve** | 2026-08-12 | 0 | 0 | 0 | **0** |
| workflow | **image-compression** | 2026-07-20 | 0 | 0 | 0 | **0** |
| workflow | **image-host-migration** | 2026-07-13 | 0 | 0 | 0 | **0** |
| workflow | issue-to-mr | 2026-08-13 | 0 | 341 | 0 | 341 |
| workflow | **jira-create** | 2026-08-07 | 0 | 0 | 0 | **0** |
| workflow | **jira-create-sec-audit** | 2026-06-02 | 0 | 0 | 0 | **0** |
| workflow | jira-create-subtask | 2026-06-02 | 0 | 18 | 0 | 18 |
| workflow | jira-daily-worklog | 2026-06-02 | 8 | 0 | 0 | 8 |
| workflow | **jira-date-search** | 2026-06-02 | 0 | 0 | 0 | **0** |
| workflow | jira-handoff | 2026-06-02 | 2 | 194 | 6 | 202 |
| workflow | jira-workload-report | 2026-09-05 | 1 | 0 | 0 | 1 |
| workflow | kickoff | 2026-06-02 | 1 | 16 | 0 | 17 |
| workflow | lark-base-bug-fix-loop（太新） | 2026-09-12 | 0 | 0 | 0 | 0 |
| workflow | **lark-ticket-group** | 2026-07-13 | 0 | 0 | 0 | **0** |
| workflow | localize-sync-flow | 2026-08-07 | 0 | 104 | 0 | 104 |
| workflow | luban-deploy | 2026-07-13 | 0 | 22 | 0 | 22 |
| workflow | luban-frontend-deploy | 2026-07-29 | 0 | 124 | 11 | 135 |
| workflow | manage-taskboard | 2026-08-06 | 230 | 5973 | 56 | 6259 |
| workflow | **marathon** | 2026-06-02 | 0 | 0 | 0 | **0** |
| workflow | **marathon-fix** | 2026-06-02 | 0 | 0 | 0 | **0** |
| workflow | **media-compression** | 2026-07-20 | 0 | 0 | 0 | **0** |
| workflow | mexc-ai-store | 2026-08-03 | 2 | 0 | 0 | 2 |
| workflow | mexc-nginx-route（太新） | 2026-08-27 | 0 | 0 | 0 | 0 |
| workflow | omf-prd-pipeline | 2026-07-13 | 0 | 147 | 0 | 147 |
| workflow | one-shot | 2026-09-08 | 0 | 14 | 0 | 14 |
| workflow | **pr-asset-pipeline** | 2026-07-13 | 0 | 0 | 0 | **0** |
| workflow | pre-qa | 2026-06-17 | 2 | 129 | 0 | 131 |
| workflow | qa-readiness-gate | 2026-09-05 | 0 | 42 | 0 | 42 |
| workflow | **quarterly-review** | 2026-07-02 | 0 | 0 | 0 | **0** |
| workflow | **ship** | 2026-07-20 | 0 | 0 | 0 | **0** |
| workflow | static-resource-migration | 2026-07-20 | 0 | 147 | 0 | 147 |
| workflow | static-resource-upload | 2026-07-20 | 0 | 173 | 1 | 174 |
| workflow | submit-for-qa | 2026-09-05 | 0 | 46 | 0 | 46 |
| workflow | submit-review | 2026-06-17 | 0 | 128 | 0 | 128 |
| workflow | taskboard-handoff | 2026-09-04 | 3 | 164 | 0 | 167 |
| workflow | taskboard-loop-cron | 2026-08-22 | 0 | 80 | 1 | 81 |
| workflow | taskboard-schedule | 2026-09-07 | 0 | 75 | 0 | 75 |
| workflow | triaging-blocked-issues | 2026-08-12 | 0 | 1441 | 1 | 1442 |
| workflow | **video-compression** | 2026-07-20 | 0 | 0 | 0 | **0** |
| workflow | weekly-review | 2026-07-13 | 0 | 16 | 0 | 16 |

粗体加星（**）标记的为**确认闲置**；标注"（太新）"的为排除项。

## 二、其他 global 分类分析（117 个）

覆盖 foundation、frontend-performance、git、i18n、knowledge、lark、mattpocock、mcp-registry、PM、QA、system、testing、third-party、visual-design、writing 共 15 个分类。

### 确认闲置（19 个，存在满30天仍零命中）

| category | skill | 创建日期 |
|---|---|---|
| frontend-performance | h5-performance-regression | 2026-06-02 |
| frontend-performance | web-perf-audit | 2026-07-04 |
| git | git-tag | 2026-07-04 |
| knowledge | family-finance-analysis | 2026-07-04 |
| knowledge | learning-archive | 2026-06-17 |
| knowledge | lenny-product-advisor | 2026-07-13 |
| knowledge | llm-wiki-para | 2026-06-02 |
| lark | lark-doc-pitfalls | 2026-06-02 |
| lark | lark-meeting-invite | 2026-06-02 |
| lark | lark-sheet-i18n | 2026-06-02 |
| mcp-registry | jira-mcp-setup | 2026-07-04 |
| mcp-registry | lokalise-mcp-setup | 2026-07-04 |
| mcp-registry | presets | 2026-06-17 |
| mcp-registry | yapi-mcp-setup | 2026-07-04 |
| QA | qa-regression-scope | 2026-06-17 |
| writing | imagegen | 2026-06-02 |
| writing | mermaid-diagram | 2026-06-02 |
| writing | pandoc | 2026-06-02 |
| writing | writing-github-readme | 2026-06-02 |

值得注意：`mcp-registry` 分类下 4 个中有 4 个零命中（`jira-mcp-setup`、`lokalise-mcp-setup`、`presets`、`yapi-mcp-setup`），只有 `gitlab-cli-setup` 有命中——这批 MCP 安装向导类 skill 可能已经完成一次性配置后不再需要重复调用，闲置属于预期内。

### 太新排除（19 个，创建不足30天且零命中，不计入闲置判定）

| category | skill | 创建日期 |
|---|---|---|
| foundation | claude-handoff（mattpocock）| 2026-09-09 |
| mattpocock | codebase-design | 2026-09-09 |
| mattpocock | git-guardrails-claude-code | 2026-09-09 |
| mattpocock | implement-spec | 2026-09-09 |
| mattpocock | improve-codebase-architecture | 2026-09-09 |
| mattpocock | loop-me | 2026-09-09 |
| mattpocock | migrate-to-shoehorn | 2026-09-09 |
| mattpocock | resolving-merge-conflicts | 2026-09-09 |
| mattpocock | retro | 2026-09-05 |
| mattpocock | scaffold-exercises | 2026-09-09 |
| mattpocock | setup-pre-commit | 2026-09-09 |
| mattpocock | setup-ts-deep-modules | 2026-09-09 |
| mattpocock | to-questionnaire | 2026-09-09 |
| mattpocock | wait-what | 2026-09-09 |
| mattpocock | wizard | 2026-09-09 |
| mattpocock | writing-beats | 2026-09-09 |
| mattpocock | writing-fragments | 2026-09-09 |
| mattpocock | writing-shape | 2026-09-09 |
| writing | meeting-notes | 2026-08-24 |

注：`ask-matt`（4次）、`triage`（12次）虽然创建日期同为 2026-09-09，但已有非零命中，属于正常活跃/低频，**不计入太新排除清单**。

### 太新但已有命中（非闲置候选，仅供参考，不计入排除清单）

以下 skill 创建不足30天，但已经产生调用记录——说明它们一上线就被用到了，不是"零命中"，因此既不算闲置也不需要"排除"：`show-me`（1013）、`writing-skills`（1037）、`i18n-copy-organizer`（147）、`lokalise-upload-flow`（204）、`mexc-acceptance-audit`（252）、`playwright-cli`（160）、`thermo-nuclear-code-quality-review`（49）、`hardcoded-copy-i18n-audit`（22）、`code-change-quiz`（45）、`sync-dashi-taskboard-upstream`（17）、`ljg-book`（4）、`mexc-testing`（10）、`webapp-testing`（2）、`frontend-slides`（7）、`ask-matt`（4）、`triage`（12）。这批之前的报告版本曾被误标为"太新排除"，已修正——**排除清单只应包含零命中的 skill**。

### Global 分类里表现最活跃的 skill（合计命中 >1000）

`tdd`（1948）、`grilling`（1322）、`evolution`（1221）、`writing-for-agents`（1194）、`skill-health-check`（1186）、`picky`（1112）、`show-me`（1013，但太新）、`harness`（1085）、`handoff`（1090）、`brand-visuals`（1071）

## 低频但非零（1-20次，值得关注但暂不判定为闲置）

- coding+workflow 专项：`jira-workload-report`（1）、`mexc-ai-store`（2）、`kickoff`（17）、`one-shot`（14）、`weekly-review`（16）、`jira-create-subtask`（18）、`luban-deploy`（22）

## 备注与局限

- 判定依据是"日志中出现该 skill 被当作工具调用触发"，不是"文件路径被提及"，避免误报。
- Codex 的统计方式（读取 SKILL.md）比 Claude Code/Kiro 的显式调用宽松一档，若某 skill 在 Codex 上为 0，说明连"被模型读取"这一步都没发生，闲置程度更确定。
- 未纳入 Cursor（按你的要求排除）。
- **创建日期**取自 `git log --follow` 首次提交记录，用于排除"刚创建、还没到30天统计窗口"的误判。太新排除只适用于**零命中**的 skill（coding+workflow 专项 2 个 + 其他 global 分类 19 个 = 21 个）；创建晚但已有命中的 skill 不算排除项，直接按命中数归入活跃/低频。
- 30 天窗口内零命中（且已存在满30天）不代表永久无用，可能是季节性任务（如 `quarterly-review`）尚未到触发时机，需人工复核后再决定是否下线或归档进 `inbox/`。
