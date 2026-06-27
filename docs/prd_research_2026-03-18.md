# AI Agent 产品深度对比分析全书：sources `prd_reference_list.md`

更新日期：2026-03-24  
说明：文件名保留 `2026-03-18`，但本文内容已按 2026-03-24 可公开核验资料刷新。
历史说明：
- 当前正式设计以 `README.md` 与 `docs/prd_refined.md` 中的 app-data state namespace 为准。

研究边界说明：
- 本文以 `docs/prd_reference_list.md` 为研究清单。
- `docs/prd_reference_list.md` 中写的是 `oh-my-openagent`，截至 2026-03-24 公开可核验的对应仓库为 `code-yeongyu/oh-my-opencode`，本文按该对象研究。
- `kakukien/Hive-Pheromones-Agent-Skills` 截至 2026-03-24 未能稳定核验到公开仓库主页或 README，因此只做“低置信度记录”，不作为核心产品依据。
- 本项目是 OpenCode 插件，不是通用多智能体平台；因此所有结论都以“是否适合做 OpenCode 内部 harness/plugin”优先。

当前 beta 对齐提醒：

- 当前 beta 已把这些概念映射到：
  - plugin-self-contained 的 prompt/agent/command 注入
  - app-data canonical state
  - 全局 router config authority
- 研究阶段形成、且当前 beta 仍应明确解释清楚的功能期待包括：
  - `mic` / `pi` / `snap` 的少入口架构
  - `session-language`、`interaction-mode`、`relay-bridge`
  - `memory-palace` continuity 与 hidden continuity prompt injection
  - `debate_gate` / `disagreement_map`
  - `bootstrap` / `optimize-models` / `rematch`

---

## 一、 产品核心定位与差异化分析

### 1.1 研究对象当前定位总览

| 对象 | 当前公开定位 | 核心价值 | 对 `opencode-router` 的参考价值 |
| :--- | :--- | :--- | :--- |
| OpenCode Plugins | OpenCode 官方插件扩展机制 | 原生插件、命令、事件、工具、上下文压缩入口 | 最高，属于平台边界 |
| LangChain Deep Agents | 通用 deep agent harness | 内建规划、子代理、文件系统、shell、状态管理 | 高，适合借鉴“harness 结构” |
| Superpowers | 工作流/skills 驱动的 agent shell | spec -> plan -> subagent -> review 的强流程 | 高，适合借鉴“纪律”，不适合照搬“仪式感” |
| oh-my-opencode | OpenCode/Claude Code 增强编排层 | 多角色、多模型、强编排、强兼容 | 高，适合借鉴 orchestration，需规避复杂度 |
| oh-my-opencode-slim | 轻量 OpenCode 多代理套件 | 快装、少配置、默认模型与 schema | 很高，贴近公开用户安装体验 |
| swarm-tools | durable swarm coordination toolkit | `.hive`、邮件、预留、记忆、并发协作 | 中高，适合借鉴 durable state，不适合全量引入 |
| OpenSpec | spec-first 开发工作流 | proposal/design/tasks 产物链和命令流 | 高，适合借鉴工件治理 |
| get-shit-done | context-engineering + orchestration shell | 少命令、隐藏复杂度、长任务推进 | 中高，适合借鉴简明 UX |
| Hive-Pheromones-Agent-Skills | 低置信度 | 公开证据不足 | 暂不纳入设计主依据 |

### 1.2 结论先行

对于 `opencode-router`，最正确的产品方向不是：

- 通用 agent OS
- 重型 swarm 基础设施
- 全流程 spec 平台
- 只会切模型的轻壳

而是：

> 一个插件原生、命令极少、状态持久、成本可控的 OpenCode orchestration harness。

### 1.3 差异化判断

从公开资料看，真正可打的差异化不是“角色更多”或“自动化更猛”，而是下面四点一起成立：

1. 基于 OpenCode 官方插件机制原生实现，而不是外挂脚手架。
2. 用户只需要很少命令，绝大多数复杂度藏在 backstage。
3. 有 durable local state，但不把自己做成 swarm infrastructure。
4. 有轻量工件和 explainable routing，但不要求重型 spec ceremony。

---

## 二、 深度功能清单与详细描述

### 2.1 OpenCode Plugins 官方能力

基于 OpenCode 当前官方文档，插件层已提供做本产品所需的大部分底座能力：

- 支持通过 OpenCode 本地配置与 Nub 包方式加载插件。
- `opencode.json` 可通过 `plugin` 字段声明插件。
- 可注册 `config` 钩子扩展命令与代理配置。
- 可订阅多类生命周期事件，如 command、message、session、todo、tool、shell、TUI、compact。
- 可定义 custom tools。
- 有 `experimental.session.compacting` 钩子，可把关键信息注入压缩上下文。

对本项目的含义：

- `opencode-router` 不需要自建外部守护进程。
- 主产品面应优先落在插件自注入 runtime 与 app-data canonical state，而不是依赖项目表层目录。
- “记忆层”应优先利用本地状态文件 + compaction hook，而不是先上远程记忆系统。

### 2.2 各研究对象的关键功能

| 对象 | 值得吸收的功能 | 不宜直接照搬的部分 |
| :--- | :--- | :--- |
| Deep Agents | planning、subagents、filesystem、shell、state/memory、long-horizon harness | 通用性过强，容易把插件做成大而全框架 |
| Superpowers | skills、spec/plan/tasks、subagent-driven development、TDD/review | 公开用户可能不愿意每次走完整流程 |
| oh-my-opencode | 路由优先、角色化协作、模型分类、MCP/tool discipline | 角色和规则过多时维护成本高 |
| oh-my-opencode-slim | 六个核心 agent、schema、默认 OpenAI、mix models、轻安装 | 如果只停在“轻壳”，复杂任务 orchestration 不够强 |
| swarm-tools | durable progress、mailbox、reservations、semantic memory | 这套适合并发团队，不适合普通 OpenCode 用户日常插件 |
| OpenSpec | source-of-truth 外置、proposal/design/tasks 命令链 | 对小任务偏重，仪式成本高 |
| get-shit-done | 少命令、长任务推进、对 context rot 有意识 | 产品边界较松，正式控制层定义较弱 |

### 2.3 从本仓现状反推的“已验证方向”

当前仓库的 alpha 代码已经证明下列方向是正确的：

- 命令只保留 `/pi-dispatch`、`/pi-up`、`/pi-book`。
- `mic` 负责 intake card，`pi` 负责 route plan。
- `co-pi` 和 `wise` 是选择性顾问，而不是默认常开角色。
- 当前正式状态工件应理解为 app-data canonical state，包括：
  - project-scoped `intake-card.json`
  - `dispatch-packet.json`
  - `workboard.json`
  - `decision-ledger.jsonl`
  - `outcome-snapshots.jsonl`
  - `resume-capsule.json`
  - `session-language.json`
  - `interaction-mode.json`
  - `relay-bridge.json`
  - `research-memory.json`
  - `memory-palace.json`
  - global `model-match.json`
  - global `model-discovery-audit.json`
- 现有插件已经在使用：
  - `config`
  - `command.execute.before`
  - `event(message.updated)`
  - `shell.env`
  - `experimental.session.compacting`
- 当前 plugin lifecycle 还包括：
  - `bootstrap`
  - `optimize-models`
  - `rematch`

这说明 PRD 的重设计不该脱离当前主线，而应把这些 alpha 决策正式化。

---

## 三、 详细 Hooks 清单与关键设计

### 3.1 OpenCode 当前可用事件面

官方插件文档显示，OpenCode 已公开多类 hook/event 面，包括但不限于：

- command
- file
- session
- message
- todo
- tool execute before/after
- shell
- TUI
- `experimental.session.compacting`

### 3.2 `opencode-router` v1 应采用的最小 Hook 预算

建议 v1 只把下面 5 类 hook 视为主路径：

1. `config`
   - 注册命令与基础配置注入。

2. `command.execute.before`
   - 接管 `/pi-dispatch`、`/pi-up`、`/pi-book`。

3. `event(message.updated)`
   - 观察 `mic` 输出，提取 intake card 和 ready packet。

4. `experimental.session.compacting`
   - 在上下文压缩时保留 dispatch/workboard/resume/model-match 摘要。

5. `shell.env`
   - 只做极少量环境透传，不扩展为复杂 secret plumbing。

### 3.3 v1.1 后可增补但不应抢跑的 Hook

- `tool.execute.before`
  - 用于阻断危险写入、`.env`、生产配置、超范围 shell。
- `tool.execute.after`
  - 用于自动写审计日志和 outcome snapshot。
- `session.idle` 或同类会话状态事件
  - 用于补写 resume capsule 和 compact memory。
- `installation.updated`
  - 用于 bootstrap/model-match 更新。

### 3.4 关键设计判断

从研究对象对比看，hook 不是越多越好，而是越能解释越好。

应该做：

- 少而硬的控制点。
- 每个 hook 只承担一个主责任。
- 让 hook 输出能落到可读工件。

不应该做：

- 模仿 oh-my-opencode 式大面积规则扩张。
- 模仿 swarm-tools 式协议化并发控制。
- 把所有路由逻辑都散落在 hook 里。

正确做法是：

> hook 只负责捕获、守门、沉淀，真正的产品逻辑放在 intake、routing、memory、model-match 这些稳定模块里。

---

## 四、 产品架构图与运行流程 (Mermaid)

```mermaid
flowchart TD
    U[User] --> MIC[Mic Front Window]
    MIC --> MSG[message.updated hook]
    MSG --> IC[Intake Card]
    IC -->|ready| DP[Dispatch Packet]
    DP --> CMD[/pi-dispatch]
    CMD --> PI[Pi Control Plane]
    PI --> RT[Route Plan]
    RT --> GATE{Need review?}
    GATE -->|route sanity| COPI[co-pi]
    GATE -->|major strategy| WISE[wise]
    GATE -->|no| WK[Workers]
    COPI --> WK
    WISE --> WK
    WK --> WB[Workboard]
    WB --> DL[Decision Ledger]
    WK --> OS[Outcome Snapshots]
    DL --> RC[Resume Capsule]
    OS --> RC
    RC --> COMPACT[session.compacting hook]
    COMPACT --> NEXT[Next session continuity]
```

这个流程与研究对象的关系：

- 平台底座来自 OpenCode Plugins。
- harness 结构借鉴 Deep Agents。
- 轻量工件借鉴 OpenSpec。
- orchestration 心智借鉴 oh-my-opencode。
- UX 极简借鉴 oh-my-opencode-slim 与 get-shit-done。
- durable continuity 借鉴 swarm-tools，但只保留轻量本地版。

---

## 五、 共同点、痛点与社区优劣分析

### 5.1 共同点

高信号研究对象普遍都有这几个共同点：

- 都不把“单轮对话”当成完整工作单元。
- 都有某种外部状态或工件。
- 都强调角色/阶段/命令边界。
- 都在处理 context decay / drift / coordination failure。

### 5.2 共同痛点

也都暴露出几乎相同的问题：

- 角色一多，用户就开始迷失。
- hook 和命令一多，行为就变得难预测。
- 工件一重，小任务体验就变差。
- 并发/恢复机制一重，安装与维护成本就上升。
- 多模型路由如果缺乏解释，会被用户视为玄学。

### 5.3 社区生态优劣

| 对象 | 社区优势 | 社区劣势 |
| :--- | :--- | :--- |
| OpenCode Plugins | 官方文档稳定、平台原生、边界清楚 | 生态相对新，最佳实践仍在形成 |
| Deep Agents | LangChain 背书、范式清晰 | 更像框架，不直接等于产品体验 |
| Superpowers | 社区实践丰富、workflow 完整 | 使用门槛和 ceremony 感较强 |
| oh-my-opencode | 同生态强相关、实战导向 | 复杂度和维护负担都高 |
| oh-my-opencode-slim | 公开用户更容易上手 | 上限受限于其轻量策略 |
| swarm-tools | durable multi-agent 思想成熟 | 面向高级用户，普通插件用户成本高 |
| OpenSpec | artifact discipline 清晰 | 对轻量任务过重 |
| get-shit-done | 产品语言直接、强调完成任务 | 体系化程度弱于前几者 |

---

*证据来源参考：*

- OpenCode 官方插件与配置文档
- 各对象 GitHub README / repo 页面
- 本仓当前 `.opencode/` 与 `src/` alpha 实现

---

## 六、补充深挖：研究对象的“功能-架构-流程-路由-控制层”解剖

### 6.1 OpenCode Plugins

- 功能：插件、命令、事件、工具、上下文压缩。
- 架构：插件作为原生扩展点挂在 OpenCode 生命周期上。
- 流程：加载插件 -> 注入配置 -> 接收事件 -> 改写行为 -> 持久化结果。
- 路由：平台不替你做产品路由，但给了足够多的接入点。
- 控制层：最适合做轻量 gatekeeper + state synchronizer。

结论：

> `opencode-router` 必须 plugin-native，而不是 plugin-adjacent。

### 6.2 Deep Agents

- 功能：planning、subagents、memory、filesystem、shell。
- 架构：以通用 harness 为核心。
- 流程：高层任务 -> planner -> specialist agents -> execution loop。
- 路由：围绕 planner 和 subagent orchestration。
- 控制层：强，但偏框架。

可借鉴点：

- harness 层抽象
- 长任务结构
- 对工具与状态的统一封装

不宜照搬：

- 把本插件做成另一个通用 agent framework

### 6.3 Superpowers

- 功能：skills、spec、plan、subagent development、test/review。
- 架构：强 workflow shell + 可安装 skills。
- 流程：spec -> plan -> tasks -> implementation -> validation。
- 路由：由流程阶段而非单纯任务标签驱动。
- 控制层：强纪律、强模板。

可借鉴点：

- “不是所有工作都靠聊天”这件事是对的。
- skills / workflow 文档化有助于公开产品传播。

不宜照搬：

- 全任务强制走 spec 流程。

### 6.4 oh-my-opencode

- 功能：多角色、模型分类、工具增强、兼容多环境。
- 架构：强 orchestration layer。
- 流程：角色分工 -> 自动路由 -> 使用工具/MCP -> 结果回收。
- 路由：显式且强。
- 控制层：强，但容易变重。

可借鉴点：

- routing-first 思维
- 把 orchestration 当成产品本体

不宜照搬：

- 角色膨胀
- 规则膨胀
- 默认 fanout

### 6.5 oh-my-opencode-slim

- 功能：轻量多代理、schema、默认 OpenAI、混合模型。
- 架构：小而快的 preset-first 套件。
- 流程：安装 -> 设 key -> 使用核心 agent。
- 路由：轻度角色路由。
- 控制层：足够但克制。

可借鉴点：

- 安装体验
- 默认值优先
- 六个左右核心角色足够

不宜照搬：

- 只做轻壳，不做真正的 control plane

### 6.6 swarm-tools

- 功能：mail、reservations、semantic memory、work log、swarm 命令。
- 架构：durable collaboration substrate。
- 流程：任务拆分 -> agent 协调 -> reservation/communication -> 回收结果。
- 路由：协作协议强于单轮智能判断。
- 控制层：很强，但成本也高。

可借鉴点：

- durable progress
- 冲突避免
- 结果和日志可追溯

不宜照搬：

- `.hive` 级重基础设施
- 高学习门槛

### 6.7 OpenSpec

- 功能：proposal、design、tasks、执行命令链。
- 架构：artifact-first workflow。
- 流程：先文档，后实现。
- 路由：由 artifact 阶段驱动。
- 控制层：工件即控制层。

可借鉴点：

- source-of-truth 必须落地为工件
- 决策不应只存在于聊天里

不宜照搬：

- 所有任务一律 spec 化

### 6.8 get-shit-done

- 功能：上下文工程、长任务推进、少命令 UX。
- 架构：以完成任务为导向的轻 orchestrator。
- 流程：用户给目标 -> 系统推进 -> 用户查看结果/状态。
- 路由：偏隐式。
- 控制层：强调结果，不强调术语。

可借鉴点：

- 用户界面只暴露少数命令
- 复杂度尽量藏在 backstage

### 6.9 Hive-Pheromones-Agent-Skills

截至 2026-03-24：

- 未能稳定核验到公开 README 或正式仓库页面。
- 不能确认其当前维护状态、架构、命令系统和适用平台。

结论：

> 先不以其为 PRD 依据，等待可核验资料补齐。

---

## 七、架构与产品思路的横向对比

| 维度 | OpenCode Plugins | Deep Agents | Superpowers | oh-my-opencode | oh-my-opencode-slim | swarm-tools | OpenSpec | get-shit-done |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 对 OpenCode 原生适配 | 最高 | 低 | 中 | 高 | 高 | 低 | 低 | 低 |
| orchestration 强度 | 低 | 高 | 高 | 很高 | 中 | 很高 | 中 | 中 |
| 工件治理强度 | 低 | 中 | 高 | 中 | 低 | 中 | 很高 | 低 |
| 持久化/恢复 | 平台可接入 | 中高 | 中 | 中 | 低中 | 很高 | 中 | 中 |
| 安装/理解门槛 | 低 | 中 | 中高 | 高 | 低 | 高 | 中高 | 低中 |
| 公开产品友好度 | 高 | 中 | 中 | 中 | 高 | 低 | 中 | 高 |
| 对本项目的借鉴优先级 | 必须采用 | 高 | 高 | 高 | 很高 | 选择性 | 高 | 中高 |

横向判断：

- 平台底层必须站在 OpenCode Plugins 上。
- orchestration 思想主要向 Deep Agents 和 oh-my-opencode 学。
- 工件 discipline 向 OpenSpec 和 Superpowers 学。
- UX 与安装策略向 oh-my-opencode-slim 和 get-shit-done 学。
- durable state 只选择性吸收 swarm-tools，不引入其整体复杂度。

---

## 八、共同点与共同痛点（补充展开版）

### 8.1 共同点

这些项目都在回答同一个问题：

> 当任务不再是一句 prompt 能解决时，怎样避免 agent 漂移、失忆、乱路由、乱花钱。

因此它们普遍引入：

- 角色或阶段
- 状态或工件
- 某种调度层
- 某种恢复机制

### 8.2 共同痛点

从产品设计角度看，最危险的四个坑非常稳定：

1. 把 orchestration 做成显摆架构，而不是用户收益。
2. 把工件做成重文书流程。
3. 把多模型路由做成解释不了的黑箱。
4. 把 durable state 做成难安装、难迁移、难维护的大系统。

### 8.3 对本项目的直接约束

`opencode-router` 的 PRD 必须明确写死下面这些边界：

- 只保留少数主命令。
- 只保留少数用户可感知角色。
- durable state 默认本地文件，不先上远程后端。
- 工件轻量化，服务于推进，不服务于 ceremony。
- 路由必须能讲清楚“为什么是这个 lane、这个 worker、这个 review gate”。

---

## 九、活跃社区与生态成熟度补充分析

### 9.1 成熟度分层

按“对本项目的可依赖程度”可分为三层：

第一层：可直接依赖

- OpenCode 官方插件/配置文档

第二层：高信号产品/框架参照

- Deep Agents
- Superpowers
- OpenSpec
- oh-my-opencode
- oh-my-opencode-slim

第三层：选择性灵感参照

- swarm-tools
- get-shit-done

低置信度对象：

- Hive-Pheromones-Agent-Skills

### 9.2 对生态成熟度的现实判断

- OpenCode 官方插件能力已足够支撑 v1。
- 真正需要谨慎的不是“能力不够”，而是“插件产品是否会过度设计”。
- 同生态对象里，`oh-my-opencode` 和 `oh-my-opencode-slim` 最值得直接对照，因为它们离 OpenCode 使用语境最近。
- 如果未来要扩展成更通用的 orchestration harness，再回看 Deep Agents 和 swarm-tools 更合适；但这不该是当前 PRD 的主目标。

---

## 十、研究结论：分别适合什么团队 / 什么场景

| 对象 | 更适合什么团队 | 更适合什么场景 |
| :--- | :--- | :--- |
| OpenCode Plugins | 已在 OpenCode 生态内工作的团队 | 原生插件、命令、hook、tool 扩展 |
| Deep Agents | 需要通用 agent harness 的平台型团队 | 长任务、多子代理、框架级开发 |
| Superpowers | 接受较强流程纪律的工程团队 | spec/plan/tasks 驱动开发 |
| oh-my-opencode | 高阶 AI coding power user / 重度配置用户 | 强编排、多角色协作 |
| oh-my-opencode-slim | 希望快装快用的公开用户 | 轻量多 agent 套件 |
| swarm-tools | 高并发、多 agent 协作团队 | durable swarm、reservation、mailbox |
| OpenSpec | 需要强工件治理的团队 | 需求到实现的可追溯流程 |
| get-shit-done | 重视结果、讨厌复杂界面的用户 | 长任务推进、少命令交互 |

对 `opencode-router` 的最终适配场景：

- OpenCode 用户
- 希望前台入口稳定
- 需要后台调度
- 想减少重复解释和上下文丢失
- 不愿意承受重型配置和复杂命令体系

---

## 十一、证据链接索引（按研究对象归类）

### 11.1 OpenCode Plugins

- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/config

### 11.2 Deep Agents

- https://github.com/langchain-ai/deepagents
- https://raw.githubusercontent.com/langchain-ai/deepagents/master/README.md

### 11.3 Superpowers

- https://github.com/obra/superpowers
- https://raw.githubusercontent.com/obra/superpowers/main/README.md

### 11.4 oh-my-opencode

- https://github.com/code-yeongyu/oh-my-opencode
- https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/README.md

### 11.5 oh-my-opencode-slim

- https://github.com/alvinunreal/oh-my-opencode-slim
- https://raw.githubusercontent.com/alvinunreal/oh-my-opencode-slim/master/README.md

### 11.6 swarm-tools

- https://github.com/joelhooks/swarm-tools
- https://raw.githubusercontent.com/joelhooks/swarm-tools/main/README.md

### 11.7 OpenSpec

- https://github.com/Fission-AI/OpenSpec
- https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/README.md

### 11.8 get-shit-done

- https://github.com/gsd-build/get-shit-done
- https://raw.githubusercontent.com/gsd-build/get-shit-done/main/README.md

### 11.9 Hive-Pheromones-Agent-Skills

- `docs/prd_reference_list.md` 中列出，但截至 2026-03-24 未核验到稳定公开资料。

---

## 十二、最终判断（简版结论，有利于 PRD 生成的摘要）

最终判断只有六条：

1. `opencode-router` 必须坚持 OpenCode 原生插件路线，不做外挂式平台。
2. 应定位为 harness-style orchestration plugin，而不是全能 agent OS。
3. 命令系统必须继续收敛到 `/pi-dispatch`、`/pi-up`、`/pi-book` 这种极简面。
4. 核心竞争力应来自 `mic -> pi` 的 intake/routing/memory/model-match 主链路，而不是角色数量。
5. durable state 要做，但要做成本地轻量 memory palace，而不是 swarm 基础设施。
6. 工件必须存在，但要轻量，保留 OpenSpec/Superpowers 的治理收益，规避其 ceremony 成本。

可直接转写为 PRD 的产品定义：

> `opencode-router` 是一个面向 OpenCode 的 plugin-native orchestration harness。它让用户主要和 `mic` 对话，由 `pi` 在后台做路由、风险分级、worker 分派和记忆沉淀，并通过少量命令与本地状态文件提供可恢复、可解释、可公开发布的工作流体验。
