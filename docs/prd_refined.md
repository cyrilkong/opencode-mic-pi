# `opencode-router` 插件产品 PRD（Refined / Beta Track 2026-03-28）

## 0. 文档说明

- 本文是当前版本的产品 PRD，服务于 `beta` 轨道推进，不是纯研究备忘。
- 本文优先依据可运行代码、当前 `README.md`、以及已通过的本地检查结果。
- backlog 只作为执行计划，不作为产品事实来源；当 backlog 与 PRD 或代码冲突时，以 PRD 与可运行代码为准。
- 本项目是 OpenCode 插件，目标是向 npm 插件发布前进，而不是发展成独立多智能体平台。

---

## 1. 产品定义

### 1.1 一句话定义

`opencode-router` 是一个面向 OpenCode 的 plugin-native orchestration harness：

> 用户主要在 `mic` 这个前台窗口整理需求，需要时可直接切到 `pi` 或 `snap`，由 `pi` 在后台完成 intake 接棒、任务路由、worker 指派、状态沉淀、模型匹配与恢复支持。

### 1.2 要解决的核心问题

它要解决的不是“让 AI 更像万能体”，而是把下面这条链路做成可长期使用的产品体验：

> 碎片化输入 -> intake backlog -> ready handoff -> 合理路由 -> 成本受控执行 -> 本地持久连续推进 -> 下次会话可恢复

### 1.3 产品卖点

1. `mic` 作为主要摩擦窗口，减少用户频繁切换 agent。
2. `pi` 作为 orchestration control plane，避免复杂任务退化成单代理硬扛。
3. `snap` 作为轻量直接入口，保留类似 OpenCode 原生 `build` / `plan` 的直接做事体验。
4. `memory-palace` 承担本地连续性，而不是把上下文恢复全部压回对话历史。
5. `agent-model-match` 与 `rematch` 提供 billing-aware、role-aware 的模型建议，而不是让用户自己维护复杂 pinning。

---

## 2. 当前阶段判断

### 2.1 当前真实阶段

当前项目不应再被描述成“刚起步原型”，但也明显还不是可发布 beta。

更准确的判断是：

> 架构主线与插件骨架已经成立，当前处于 beta 前的产品化加厚阶段。

### 2.2 已经成立的骨架

当前代码已经具备这些主线能力：

- plugin-self-contained 的 prompt / agent / command 注入
- `mic` intake -> ready -> `/pi-dispatch` handoff 骨架
- `pi` 的 route / risk / lane / worker 选择骨架
- `memory-palace` 的 workboard / ledger / snapshots / resume capsule 状态结构
- `model-match` 的 token / request 双轨策略、verified discovery、fallback、runtime/evidence provenance 拆层
- runtime fallback 的自动重试与下一模型切换

### 2.3 仍未完成的产品内容

当前离 beta 仍有明显缺口：

1. intake backlog 还不是成熟产品体验
   - 现在更像“结构化 parser + state 保存”，还不是完成度足够高的前台需求整理窗口。

2. `memory-palace` 还不是成熟恢复系统
   - 现在已有状态工件，但 `/pi-up`、`/pi-book` 的信息架构、恢复效率、可读性仍需产品化。

3. 三个核心工作流命令还只是骨架
   - `/pi-dispatch`
   - `/pi-up`
   - `/pi-book`
   - 它们已经存在，但内容设计、状态表达、交互节奏仍偏初级。

4. 主交互界面设计仍较原始
   - 尤其是 `mic` 主窗口与命令输出结果，仍需更成熟的 UX / TUI 设计。

5. `rematch` 处于“刚能用”
   - 已有 verified discovery、双命令拆分与同步 rematch，但还没达到顺手、可解释、低摩擦的 beta 水准。

6. 缺少产品 QA
   - 当前已有大量回归 /结构校验脚本，但它们不等于正式的产品 QA、安装验证与工作流验收。

---

## 3. 产品定位

### 3.1 这不是什么

`opencode-router` 不是：

- 通用多智能体操作系统
- 重型 swarm 基础设施
- 全量 spec 平台
- 只会切模型的 preset 壳
- 远程控制平面

### 3.2 这是什么

它应该是：

> 一个原生嵌入 OpenCode 的 orchestration plugin，用少量入口、少量命令、轻状态、强恢复和可解释路由，把复杂多步工作变成更稳定的日常体验。

### 3.3 面向 beta 的定位语气

beta 阶段的对外语气必须诚实：

- 主打 `mic` 主窗口 + `pi` orchestration + `snap` 快捷入口
- 主打本地连续性和 role-aware 模型推荐
- 不承诺完备自治
- 不承诺重型团队协作协议
- 不把尚未成熟的命令内容、恢复体验、QA 水准包装成“已完成产品”

---

## 4. 核心设计原则

1. **Plugin-native**
   - 一切主能力优先建立在 OpenCode 官方插件能力上，而不是外挂脚本系统。

2. **One default front window, two valid frontstage loops**
   - `mic` 是主要摩擦窗口。
   - `pi` 保留为用户可直达的 orchestrator 备选入口。
   - `snap` 保留为类原生 `build` / `plan` 的轻量快捷入口。
   - 允许存在两种有效主链路：
     - Mic-frontstage：用户全程停留在 `mic`，由 `pi` 后台 orchestration
     - Pi-frontstage：用户直接与 `pi` 交流，必要时后台调用 `mic` 回写 backlog

3. **Control plane, not worker bloat**
   - `pi` 是调度层，不是默认主工人。

4. **Intake backlog and memory-palace are product features**
   - 这两块不是纯状态层或实现细节，而是直接决定产品完成度的核心能力。

5. **Three core workflow commands, maintenance commands kept separate**
   - 核心工作流命令：
     - `/pi-dispatch`
     - `/pi-up`
     - `/pi-book`
   - 维护命令：
     - `/pi-rematch-token`
     - `/pi-rematch-request`

6. **Light artifacts, durable continuity**
   - 工件要足够轻，但恢复能力必须足够强。

7. **Role-first, model-second**
   - 先定义角色职责，再做模型匹配。

8. **Explainable routing**
   - 为什么走这个 lane、这个 worker、这个 review gate，必须讲清楚。

9. **Soft provider preference, not hard provider lock**
   - provider 是排序偏好，不是默认硬限制。

10. **Benchmark-assisted recommendation**
   - 模型匹配必须以 role dimension × rating 为核心证据。

11. **Runtime metadata must stay version-agnostic**
   - 除证据链、快照和显式样例外，运行层不得固化具体 discovered model id 或具体版本常量。

12. **Public beta honesty**
   - 不把“能跑的骨架”包装成“完成的产品”。

---

## 5. 产品面与入口策略

### 5.1 用户可见入口

#### `mic`

- 默认前台窗口
- 负责 intake、澄清、backlog 整理、ready gate
- 是主要摩擦窗口
- 同时应支持作为 backstage backlog reconciler 被 `pi` 调用，避免因为 backlog 回写而要求自动切 primary window
- 也应支持在 Mic-frontstage 模式下保持前台，同时后台调用 `pi` 执行 orchestration

#### `pi`

- 备选前台入口
- 允许用户直接和 orchestrator 沟通
- 适合明确执行、排障、路由、决策场景
- 当 `pi` 是当前前台窗口时，应保持用户对话连续；需要 backlog 回写时，优先后台调用 `mic` 做 reconcile，而不是要求 UI 自动切回 `mic`
- 也应支持作为 backstage orchestration engine 被 `mic` 调用，避免用户为了执行阶段被迫离开 `mic`

#### `snap`

- 备选前台入口
- 适合短任务、直接动作、低仪式感请求
- 保留 OpenCode 原生 `build` / `plan` 风格的小角色定位

### 5.2 后台职能角色

- `co-pi`
- `wise`
- `dev`
- `desi`
- `doc`
- `map`
- `scout`
- `debug`
- `check`
- `vis`

原则：

- 后台 worker 是职能，不是扩张用户心智负担的人格宇宙。
- 除 `mic` / `pi` / `snap` 外，其余角色默认应保持 backstage。

### 5.4 `mic` / `pi` backlog ownership

- `mic` 拥有 canonical user-facing backlog truth：
  - `As-is`
  - requirement-level task list
  - open questions
  - ready gate
- `pi` 拥有 execution continuity：
  - route plan
  - workboard
  - blockers
  - next step
  - worker coordination
- 当用户在 `pi` 窗口继续补充、修改、分支需求时，不应要求前台自动切回 `mic`。
- 正确机制是：`pi` 继续前台对话，同时把 requirement drift / reprioritization / missing user-owned decisions 交给 `mic` 在后台整理成更新后的 backlog truth。
- `mic` 的 backstage 输出用于 reconcile intake/backlog；`pi` 负责把结果带回前台并继续 orchestration。
- routine execution progress、临时推演、worker note、短期 blocker 不应频繁回写 `mic` backlog，而应留在 workboard / memory-palace。

### 5.5 双工作流闭环

#### A. Mic-frontstage loop

- `User -> Mic`
- `Mic` 负责澄清与 backlog 整理
- backlog ready 后，不要求用户切到 `pi`
- `Mic -> Pi(backstage) -> subagents`
- `Pi` 返回执行状态、blocker、next step 给 `Mic`
- `Mic` 继续面向用户交流，并在 requirement truth 变化时更新 backlog

#### B. Pi-frontstage loop

- `User -> Pi`
- `Pi` 直接 orchestration 并面向用户反馈
- 当 requirement truth 变化时：
  - `Pi -> Mic(backstage) -> backlog reconcile -> Pi`
- `Pi` 继续前台交流

规则：

- 两条闭环都合法。
- `Mic-frontstage` 应是默认主路径，因为它更符合低摩擦 intake/backlog 产品定位。
- `Pi-frontstage` 是 power-user / direct-orchestrator 入口，不应被移除。

### 5.3 命令系统

#### 三个核心工作流命令

- `/pi-dispatch`
  - 把 ready backlog 交给 `pi`
  - 生成 route plan、workboard、resume capsule
  - 呈现执行起点

- `/pi-up`
  - 用最短路径回答“现在做到哪、风险如何、下一步是什么”

- `/pi-book`
  - 用于更完整地恢复 packet、board、decision、snapshot 与研究记忆

#### 两个维护命令

- `/pi-rematch-token`
- `/pi-rematch-request`

它们是维护命令，不是主工作流命令。

---

## 6. 产品架构

### A. Experience Layer

- `mic`
- `pi`
- `snap`
- `/pi-dispatch`
- `/pi-up`
- `/pi-book`

### B. Intake Backlog Layer

- intake card parser
- ready gate
- language capture
- backlog rewrite / pending-state expression
- backlog reconciliation service for `pi`-side requirement drift
- Mic-frontstage relay surface for backstage Pi execution updates

### C. Control Layer

- `pi`
- route engine
- risk scorer
- lane selector
- review gate
- backstage orchestration support for Mic-frontstage sessions

### D. Worker Layer

- `dev`
- `desi`
- `doc`
- `map`
- `scout`
- `debug`
- `check`
- `vis`
- advisory: `co-pi`, `wise`

### E. Memory Palace Layer

- dispatch packet
- workboard
- decision ledger
- outcome snapshots
- resume capsule
- research memory
- project continuity index
- per-agent minimal indexes

边界补充：

- `memory-palace` 不是 `mic` backlog 的替代品。
- `mic` backlog 管 requirement truth；`memory-palace` 管 execution continuity。

### F. Model Match / Rematch Layer

- billing mode
- model matcher
- fallback builder
- verified discovery audit
- provenance evidence layer

---

## 7. 状态工件定义

### 7.1 Canonical state

以下文件是当前产品定义下的 canonical local state。

默认根目录在：

- `~/.local/share/opencode/plugins/opencode-router/`

其中拆成两层：

- global state
  - `global/model-match.json`
  - `global/model-discovery-audit.json`
- project-scoped state
  - `projects/<stable-project-key>/intake-card.json`
  - `projects/<stable-project-key>/dispatch-packet.json`
  - `projects/<stable-project-key>/workboard.json`
  - `projects/<stable-project-key>/decision-ledger.jsonl`
  - `projects/<stable-project-key>/outcome-snapshots.jsonl`
  - `projects/<stable-project-key>/resume-capsule.json`
  - `projects/<stable-project-key>/session-language.json`
  - `projects/<stable-project-key>/interaction-mode.json`
  - `projects/<stable-project-key>/relay-bridge.json`
  - `projects/<stable-project-key>/research-memory.json`
  - `projects/<stable-project-key>/memory-palace.json`

测试/开发时可以用：

- `OPENCODE_ROUTER_DATA_DIR`

覆盖默认 app-data 根目录，但这不是正式产品路径。

### 7.2 非 canonical 工件

以下工件可以存在于开发流程中，但不应被表述成正式产品真相：

- development backlog
- 临时样例
- 本地调试脚本产物

规则补充：

- 插件 canonical runtime state 严禁写入项目表层 `.opencode/.workspace/`
- `.opencode/.workspace/` 不属于 router 插件状态目录
- development backlog 之类的开发规划工件不得写入 app-data runtime state，也不得写入 `.workspace/`

---

## 8. 当前已满足的核心逻辑

以下核心逻辑已经基本成立：

1. 插件自注入而不是依赖 OpenCode 可见文件面。
2. `mic` -> ready -> `/pi-dispatch` 的 handoff 骨架已存在。
3. `pi` 已能给出 shape / risk / lane / worker 基线。
4. `memory-palace` 已具备基本状态结构与读写路径。
5. `model-match` 已具备 dual-track billing、verified discovery、fallback、provenance split。
6. runtime fallback 已具备自动切换下一模型的能力。

这些说明：

> 主逻辑不是问题，问题在产品内容完成度与 beta 级成熟化。

---

## 9. Beta 前必须补齐的产品内容

### 9.1 Intake backlog productization

必须完成：

- 让 `mic` 真正成为高质量 backlog 窗口，而不只是 parser 前端
- 强化 `As-is`、任务列表、问题状态、ready 状态的表达质量
- 明确“pending vs ready”在主交互中的信息层级
- 降低用户在 `mic` 窗口的摩擦感
- 明确 `pi` 前台执行时如何后台调用 `mic` 做 backlog reconcile，而不依赖自动 primary 切换
- 明确 `mic` 前台执行时如何后台调用 `pi` 并把执行反馈稳定地转述给用户

### 9.2 Memory-palace productization

必须完成：

- 让 `/pi-up` 真正回答当前状态
- 让 `/pi-book` 真正支持恢复，而不是罗列工件
- 明确 workboard、resume、research memory 之间的职责边界
- 增加 project continuity index 和 per-agent minimal index，让同项目新 session 不重复造轮子
- 控制状态噪音，避免沉积无用内容
- 明确哪些反馈应该进 `memory-palace`，哪些 requirement drift 应该回流给 `mic`

### 9.3 三个核心命令的内容设计

必须完成：

- `/pi-dispatch` 的启动信息架构
- `/pi-up` 的扫描效率
- `/pi-book` 的恢复效率
- 三个命令之间的层次分工

### 9.4 主交互 UX / TUI 设计

必须完成：

- `mic` 主窗口的产品化表达
- 状态标签、风险提示、下一步提示的统一风格
- 命令输出的视觉层级与可扫描性

### 9.5 Rematch 成熟化

必须完成：

- 让 `rematch` 从“能工作”提升到“顺手、低摩擦、可解释”
- 强化 billing mode 选择的可理解性
- 强化推荐摘要、warning、discovery 状态的表达
- 保持 runtime metadata versionless

### 9.6 QA 与 beta 验证

必须完成：

- 在现有回归检查之外补产品 QA
- 增加主工作流验收
- 增加安装与升级验证
- 增加真实本地 OpenCode / npm 插件路径验证

---

## 10. Beta 版本定义

### 10.1 目标版本

beta 目标版本定义为：

- `v0.9.0-beta`

### 10.2 Beta 的含义

到 `v0.9.0-beta` 时，产品必须达到：

1. `mic` 的 backlog 整理体验可长期使用
2. `memory-palace` 的恢复能力对真实会话有效
3. 三个核心工作流命令内容成熟，不再只是工程骨架
4. `pi` / `snap` 作为备选入口的定位清晰，不和 `mic` 主叙事冲突
5. `rematch` 足够顺手，warning 与 discovery 状态足够清楚
6. 已有明确 QA 与验收流程
7. npm 插件安装路径、配置路径、默认行为、README 叙事一致
8. 对外承诺不超过当前真实能力

---

## 11. 向 npm 插件发布前进的要求

在 beta 前，必须满足这些发布导向要求：

1. 包结构稳定
   - 插件入口、bin、必要文档与样例保持清晰

2. 安装路径清楚
   - 本地开发安装
   - npm/plugin 安装
   - 全局 router config 生效路径

3. 默认体验清楚
   - 默认公开入口
   - 默认命令
   - 默认 config authority

4. 配置与文档一致
   - `billing_mode`
   - `provider_preferences`
   - `role_model_preferences`
   - `public_agents`

5. QA 具备发布意义
   - 不只是代码结构校验
   - 还包括用户工作流、安装、升级、恢复、rematch 验证

6. git 版本基线真实存在
   - 进入 beta 前，应从当前开发态进入真实 git 仓库节奏
   - 至少具备：清晰 `.gitignore`、首个可回溯的基线提交、版本/tag 纪律、面向发布的变更边界

---

## 12. 非目标

beta 轨道不做：

1. 继续扩张大量用户可见角色
2. 增加更多主工作流命令
3. 引入重型 swarm reservation / lock / mailbox
4. 引入远程控制平面
5. 发展成全量 spec 平台
6. 用复杂自治叙事掩盖当前产品内容未完成的问题

---

## 13. 里程碑

### M0 — architecture spine lock

- 目标版本：`v0.8.1`
- 目标：确认插件主航道与边界
- 当前判断：基础已成立

### M1 — intake backlog productization

- 目标版本：`v0.8.2`
- 目标：把 `mic` 做成真正可用的前台 backlog 窗口

### M2 — memory-palace productization

- 目标版本：`v0.8.3`
- 目标：把 `/pi-up` 与 `/pi-book` 做成真实恢复工具

### M3 — command experience and interaction design

- 目标版本：`v0.8.4`
- 目标：完成三个核心工作流命令的内容设计与主交互 UX / TUI 加厚

### M4 — rematch and model-match hardening

- 目标版本：`v0.8.5`
- 目标：把 `rematch` 从“可用”提升到“beta 可用”

### M5 — QA and beta pilot

- 目标版本：`v0.8.6`
- 目标：建立产品 QA、安装验证、主工作流验收、真实环境 pilot

### M6 — npm beta release

- 目标版本：`v0.9.0-beta`
- 目标：形成可公开试用的 npm 插件 beta

### M7 — production candidate

- 目标版本：`v1.0.0`
- 目标：在 beta 反馈后收敛成正式公开版本

---

## 14. 最终收束结论

当前阶段最重要的事不是继续发明新能力，而是：

1. 把 `mic` 做成成熟 intake backlog 窗口
2. 把 `memory-palace` 做成成熟恢复系统
3. 把三个核心工作流命令做成真正可读、可扫、可决策的产品内容
4. 把 `rematch` 做成顺手的维护能力
5. 补上 QA 与 npm beta 发布所需的产品成熟度

后续实现若与这些目标冲突，应优先保留：

- 主窗口清晰度
- orchestration 的解释性
- 本地连续性
- 低维护配置
- 诚实的 beta 边界
