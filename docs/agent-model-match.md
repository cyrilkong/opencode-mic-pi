# agent-model-match 机制说明

本文档说明 `opencode-router` 当前实现里的 `agent-model-match`（也可简称 `model-match`）是如何工作的、依据什么做匹配、什么时候会同步写回配置，以及它**不会**做什么。

实现基准以当前代码为准，主要对应：

- `src/model-match.js`
- `src/model-research-rank.js`
- `src/research-authority.js`
- `src/model-benchmarks.js`
- `src/model-evidence.js`
- `src/router-config.js`
- `plugins/opencode-router.js`
- `scripts/bootstrap.js`
- `scripts/build-model-evidence.mjs`
- `scripts/run-model-research-runner.mjs`
- `scripts/rematch-model-match.js`

---

## 1. 它是什么

`agent-model-match` 是一层**角色到模型的推荐机制**。

它的目标不是让用户手写复杂的 agent-model pinning，而是根据：

- 当前环境里**真实可用**的模型
- 每个角色的职责维度
- 计费模式
- provider 偏好
- 用户已有的 role preference selector

自动生成每个角色更合适的：

- `default_model`
- `family_recommendation`
- `rating`
- 少量 `fallback`

它是一个**推荐/解释层**，不是一个静态 preset 表。

---

## 2. 状态存放在哪里

### 2.1 运行状态

推荐结果会写入：

- `~/.local/share/opencode/plugins/opencode-router/global/model-match.json`

这个文件是默认 app-data 根目录下的 plugin-global 状态工件，包含：

- 当前 recommendation id
- 生成时间
- 模型池来源
- availability / verification 信息
- 每个角色的推荐结果
- fallback 链
- warning 信息

可选的 **联网模型研究**侧车（与当前 discovery fingerprint 绑定）写在 **项目级** app-data 下（不是 `global/`）：

- `~/.local/share/opencode/plugins/opencode-router/projects/<project-key>/model-research.json`

对应实现：`src/model-research-rank.js`、`scripts/run-model-research-runner.mjs`。未启用研究或侧车不可用时，排序逻辑与旧版一致。

### 2.2 配置写回

在需要持久同步时，当前实现会把 recommendation 派生出的：

- `role_model_preferences`
- `billing_mode`

写回 router config，也就是：

- 全局 `~/.config/opencode/opencode-router.json`

写回策略是：

- 只在内容真正变化时才重写
- 最多保留一个固定 rollback 备份：`opencode-router.json.bak`
- 不再按时间戳无限分裂备份

**不会写入 `opencode.json`。**

这是当前实现的明确边界。

---

## 3. 输入有哪些

`model-match` 的主要输入分成五类。

### 3.1 可用模型池（availability）

来源优先使用经过验证的：

- `opencode models`

验证结果会写入：

- `~/.local/share/opencode/plugins/opencode-router/global/model-discovery-audit.json`

相关逻辑在：

- `src/model-match.js` 的 `refreshVerifiedModelDiscoveryAudit()`
- `resolveModelPool()`

### 3.2 Router 配置

来自 `src/router-config.js` 读取的 router policy：

- `billing_mode`
- `provider_preferences`
- `role_model_preferences`
- `model_match_policy_markdown_path`
- `force_cross_model_family_for_copi`
- `opencode_models_timeout_ms`
- 可选：`model_research_enabled`、`model_research_model`、`model_research_runner_path`、`model_research_timeout_ms`、`model_research_strict_web_tools`、`research_authority_allowlist_path`、`research_authority_strict`、`min_authority_citations_per_role`

配置优先级是：

1. `OPENCODE_ROUTER_CONFIG` 环境变量指定的明确路径
2. 全局路径 `~/.config/opencode/opencode-router.json`

项目内 `.opencode/opencode-router.json` 与 repo root `opencode-router.json` 当前都**忽略**。

### 3.3 Markdown policy baseline

当前实现支持一个**用户可维护的 markdown 路由 policy 文件**。

默认路径：

- `~/.config/opencode/opencode-router-model-match.md`

也可以通过以下任一方式覆盖路径：

- `model_match_policy_markdown_path`
- `OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN`

生成默认模板：

- 插件包内自带一份 bundled plugin-default template：
  - `defaults/model-match-policy.default.md`
- 如果默认全局文件暂时不存在，运行时也会直接回退到这份 bundled default，而不是退成“无 policy”
- 插件启动时若默认路径缺失会自动生成
- `opencode-router bootstrap --write-model-policy --overwrite` 可用于手动重建模板

语义 legend：

- `docs/model_match_policy_legend.md`

这个 markdown 文件不是备注，但它也**不是直接打分表**。

它的职责是：

- 描述不同 agent 的模型偏好与调度姿态
- 改变 role strategy 的抽象偏好
- 让运行时在真实 available models 上做更符合产品意图的匹配

它**不会**做的事：

- 直接 pin 某个具体模型版本
- 直接覆盖 verified discovery 的模型池
- 直接替代运行时评分公式

当前推荐的维护方式是：

- 每个 agent 一个 section
- `focus` 用排序表达维度优先级
- `shape` / `cost` / `thinking` / `traffic` / `fallback` 用 `0-5` 表达强度
- base 字段默认同时作用于 token / request 两种 billing mode
- 只有在某个 billing mode 确实需要不同姿态时，才写 inline override block

建议：

- 用抽象 family / benchmark key，而不是具体模型版本
- 把 `role_model_preferences` 继续当作 selector intent
- 把 markdown policy 当作主要 role-routing policy baseline
- 把这个文件当作“人类维护的角色偏好描述”，而不是小数点配置表
- 优先改少数字段，不要把每个 override block 都写满

### 3.4 角色维度权重

当前实现仍然保留 `src/model-match.js` 的 **双轨 `ROLE_STRATEGIES`**：

- `token_billing`
- `request_billing`

但它现在更接近 **thin fallback prior**，不是主要的人格来源。

代码内置策略只保留少数共享 baseline archetype，例如：

- `frontline`
- `orchestrator`
- `reasoning`
- `coding`
- `document`
- `context_scan`
- `design`
- `multimodal`

它们的职责主要是：

- 在 policy 缺失时提供不至于失真的兜底排序
- 为 policy 没写到的尾部维度提供轻量顺序参考
- 继续承载 billing-aware price profile / tier penalty / fallback depth 这类运行时约束

真正的角色个性应该主要来自 markdown policy：

- `focus`
- `shape`
- `cost`
- `thinking`
- `traffic`
- `fallback`
- family / benchmark / keyword steering

这意味着同一批模型，在不同角色上依然会得到不同排序；但“角色像什么”应首先由 policy 描述，而不是由代码里的隐藏小数表决定。

### 3.5 Benchmark / rating 规则

模型的基础 rating 来自 `src/model-benchmarks.js`：

- 默认维度评分：`DEFAULT_RATINGS`
- token 级别规则：`TOKEN_PROFILES`
- 静态价格提示：`STATIC_PRICE_HINTS`

例如模型名里出现：

- `mini` / `small` / `nano`
- `flash` / `fast` / `turbo` / `haiku`
- `code` / `coder` / `codex`
- `pro` / `max` / `ultra` / `opus`
- `sonnet` / `balanced` / `standard`
- `vision` / `omni` / `image`
- `qwen` / `qwq`（通义 / QwQ 系开源命名）
- `kimi` / `moonshot` / `k2`（Kimi / Moonshot 系）
- `mimo`（MiMo 系）
- `grok`（xAI Grok 系）
- `glm` / `zhipu` / `chatglm`（智谱 GLM 系）
- `minimax` / `abab`（MiniMax 系）
- `deepseek`（DeepSeek 系）

就会对多个维度评分做加减，最后形成该模型的 benchmark profile。

`balanced` / `quality` 的 token 规则**不再**把 `plus` 当作可匹配片段：各厂商对 `plus` 命名不一致，容易误判档位；需要时用 markdown policy 的 `prefer_keyword` / 家族字段显式表达意图。

`lookupBenchmarkProfile()` 的 `benchmark_basis` 会标记信号来源：

- `token_profile`：仅命中 `TOKEN_PROFILES` 规则
- `models_dev_zen`：在 **`opencode` / `opencode-go`** 提供商下，模型名命中与 [models.dev](https://models.dev/api.json) 上 OpenCode / ZenMux 目录一致的 **家族 slug 前缀**（`glm`、`minimax`、`deepseek`、`qwen`、`qwq`、`kimi`、`mimo`、`grok`），但未叠化出 token 级标签时的兜底（少见）
- `token_profile+models_dev_zen`：同一模型既满足 token 画像，又落在上述 Zen / OpenCode 目录 slug 锚定上
- `default_profile`：无 token 命中且不满足 Zen 目录锚定

同时，当前实现还会为一小组常见模型/家族提供**静态 price hint**，用于本地 price-aware 排序，而不是联网查询：

- Claude `Opus` / `Sonnet` / `Haiku`
- GPT / Codex `Max`
- Gemini `Flash` / `Pro`

这些价格提示是近似值，只用于本地路由启发式，不追求精确账单复刻。

当前 `STATIC_PRICE_HINTS` 的价格元数据已经拆成两层：

- `runtime`
  - 只保留抽象匹配信息与家族级 pricing meta
  - 例如 `match_key`、`family`、`pattern_basis`
- `evidence`
  - 允许保留具体版本证据快照
  - 例如 `evidence_model_id`、`source_url`、`verified_at`

当前 evidence source 使用：

- `https://models.dev/api.json`

运行时不会把这些具体版本号重新暴露成 runtime metadata。

### 3.5.1 pricing ground-truth vs local derivation

这里有一个重要边界：

- **availability ground-truth** 来自运行时 verified discovery（`opencode models`）
- **pricing ground-truth** 只有在静态元数据条目明确标注为 `fact-checked` 时，才算被本仓库采信为已核验价格事实
- 其余价格条目都只是本地 `heuristic` scoring metadata

也就是说：

- 价格元数据是为了改进排序，不是为了声明“这些模型一定存在”
- 它不能变成模型库存
- 它不能替代 verified discovery
- 它也不应该在插件里硬写具体版本常量作为长期事实表

当前实现遵循一个更严格的本地规则：价格 hint 的 key / pattern 应尽量使用家族/元模式，例如：

- `claude-opus`
- `gpt-codex-max`
- `gemini-flash`

而不是把 `gpt-5.1-codex-max` 这种精确版本号当成 pricing metadata 常量写进插件。

### 3.5.2 Evidence catalog（多源证据，证据驱动 rank）

`agent-model-match` 现在还支持一个**离线构建**的、与 verified pool 绑定的多源证据 JSON。运行时会同步加载它：

- `src/model-evidence.js` 暴露 `loadEvidenceCatalog`、`lookupEvidenceEntry`、`fuseEvidenceSources`。
- 解析顺序（与 README / schema 对齐）：
  1. `routerConfig.evidence_catalog_path`
  2. `routerConfig.evidence_catalog_glob`
  3. `OPENCODE_ROUTER_EVIDENCE_JSON`
  4. `OPENCODE_ROUTER_EVIDENCE_DIR` 下扫描 `model-evidence*.json`
  5. 仓库自带 `defaults/evidence/model-evidence*.json`

JSON shape（schema v2）：

- `pool_fingerprint`：必须等于当前 verified discovery audit 的 fingerprint
- `sources[]`：每条 external 来源的 `id` / `url` / `retrieved_at` / `license_note`
- `fusion.mode`：默认 `weighted_mean`，也支持 `max_normalized_percentile`
- `fusion.weights`：每个 `source.id` 的默认权重；可被 router config 的 `evidence_source_weights` 覆盖
- `models["<provider/model>"].by_source.<source_id>`：该模型在该来源下的 `coding_score` / `agentic_score` / `reasoning_score` / `confidence`
- 可选 `models[*].fused`：构建期固化好的融合分（`coding_evidence` / `agentic_evidence` / `reasoning_evidence`）

绑定行为：

- **fingerprint 命中**：`coding_evidence` / `agentic_evidence` 维度被融合分覆盖；按 `evidence_rank_strength` 把 `coding` / `reasoning` 这类 token-name 维度的权重压向 0，并把腾出的权重转移给 evidence 维度
- **fingerprint 不命中或缺失**：写入 `recommendation.warnings` 一条 `model-evidence: ...` 警告；fall back 到中性 evidence（rating 3）；**仍然不会**把 token-name 维度作为 rank 输入恢复

`scripts/build-model-evidence.mjs` 是 maintainer-only 工具：读取一个 `evidence-sources.yaml`（或 `--source-spec <path>`），按声明加载本地 JSON / YAML / inline / URL 表，按 `id_mapping` 映射到 OpenCode 模型 id，融合后写出 `model-evidence.<shortFingerprint>.json`。该脚本不在运行时调用，CI 默认 offline。

### 3.5.3 联网模型研究（可选，外部 runner）

在 `model_research_enabled: true` 且存在带 `fingerprint` 与 `models[]` 的 verified discovery audit 时，插件在持久化 `model-match` 之前会尝试运行 **外部研究子进程**（默认 `scripts/run-model-research-runner.mjs`），把 stdin JSON 结果校验后写入 `model-research.json`。触发面与常规 rematch 一致（例如插件 init / 配置变更后的 rematch、`scripts/rematch-model-match.js`、`/pi-rematch-*` 等路径会 `await` 完整流程）；若 audit 缺失或研究被关闭，则**不会**启动研究阶段（避免 bootstrap 在无池时误触发）。

排序在 **硬排除**（`global_avoid_keywords`、markdown policy 的 keyword / family avoid）之后，若侧车可用，则对每个候选池使用 **7:3** 权重混合「研究信号」（外部给出的维度分 + 池内排列）与「policy 软信号」（`policy_adjustment` 归一化），实现见 `sortModelsByRoleResearchBlend()`。研究失败或校验失败会写入 `ok: false` 的侧车并在 recommendation 中带 `model-research: ...` 警告，同时回退到非研究排序。

**默认 runner 在未显式允许时 fail-closed**（进程以非 0 退出且 `web_tools_ok: false`），避免把未经验证的“伪联网”结果写进侧车。离线 / CI 可设置 `OPENCODE_ROUTER_RESEARCH_MOCK=1`；本地仅想走通管道可设 `OPENCODE_ROUTER_ALLOW_STUB_WEB_TOOLS=1`（仍应视为非生产证据）。

引用 URL 必须通过 `defaults/research-authority-allowlist.json`（或 `research_authority_allowlist_path` 指向的同类文件）里的 **T1/T2/T3** 主机后缀校验；`research_authority_strict` 与 `min_authority_citations_per_role` 控制 T1+T2 引用数量下限。runner 提示词使用 `BEGIN_MACHINE_POOL_JSON` / `END_MACHINE_POOL_JSON` 包裹机器可读池列表，以降低自然语言注入对池解析的影响。私有地址与非法 scheme 在 `src/research-authority.js` 侧会被拒绝。

顶层 telemetry：`recommendation.model_research`（`enabled`、`usable`、`pool_fingerprint`、`researched_at`、`web_tools_ok`、`blend`）。

**Init 延迟成本**：当 `model_research_enabled: true` 时，插件 init 与 config hook 里的 `refreshModelMatch` 会同步等待外部研究子进程，默认上限 `model_research_timeout_ms`（120000ms，最大 900000ms）。在 runner 未接真实 web tools 或网络较慢时，这会直接拖慢 OpenCode 启动。若不希望 init 阻塞在研究阶段，可：保持 `model_research_enabled: false` 作为默认，仅在显式 `/pi-rematch-*` 或 `rematch-models --write` 时临时打开；或把 `model_research_timeout_ms` 调到可接受的上限。注意 init/config 的 `refreshModelMatch` 已被 try/catch 包裹，研究失败不会让插件启动崩溃，只会降级为上次已知推荐并在日志里记一条 error。

**研究锁与恢复**：研究阶段在 `projects/<stable-project-key>/.model-research.lock` 上加锁，避免并发 rematch 互相覆盖侧车。锁文件内容为 `{pid, started_at}`；当持有进程已退出或锁龄超过 `model_research_timeout_ms` 时，下一次研究会自动回收（reclaim）该锁。若出现异常残留且自动回收未命中，可执行 `opencode-router reset-state --project`（默认项目作用域）清理该项目的运行时状态，或 `reset-state --all` 清空整个插件 app-data 命名空间。

### 3.6 用户 selector

`role_model_preferences` 是一个 selector map。

它支持两种常见写法：

- 明确 scoped model：`provider/model`
- provider-agnostic model name：只写模型名

解析逻辑在 `src/model-match.js` 的 `resolveModelSelector()`。

---

## 4. Availability gating：为什么它是“严格”的

当前实现对 availability 的态度是：

> 真实可用模型是事实；配置偏好不是事实。

### 4.1 有 verified discovery 时

如果 `model-discovery-audit.json` 状态为 `verified`，且 audit 中带有模型列表：

- `model-match` 只在这批 verified models 里做匹配

### 4.2 没有 verified discovery 时

如果 audit：

- 缺失
- timed_out
- failed

则不会静默降级到某个内置模型清单。

此时 recommendation 会：

- 报 warning
- 把模型池标记为 `verified_discovery_required`
- 在没有 verified pool 的情况下不伪造可选模型

这也是 README 里提到的：

- 不再依赖 builtin/default preset model list

### 4.3 为什么这样设计

因为用户配置里的：

- `provider_preferences`
- `role_model_preferences`

只是意图，不代表你的环境里一定真的能调用这些模型。

---

## 5. 评分是怎样算出来的

核心入口在 `src/model-match.js`：

- `scoreModelForRole()`
- `sortModelsByRole()`

### 5.1 基础评分

步骤是：

1. 先用 `lookupBenchmarkProfile(modelId)` 拿到模型的 benchmark profile
2. 取该角色对应的维度权重，并在 billing mode 调整后做**归一化**
3. 对 capability 维度做加权求和，得到 capability score
4. 叠加 provider preference bonus
5. 如果是 `token_billing`，再减去基于静态价格提示的 price penalty

维度包括：

- `reasoning`
- `coding`
- `instruction`
- `context`
- `long_context`
- `output_quality`
- `speed`
- `multimodal`
- `cost_efficiency`

### 5.2 billing mode 的影响

`billing_mode` 现在不再是“同一套权重的小幅偏移”，而是**两套独立策略轨**：

- `token_billing`
  - 真实看待 `input` / `output` / `cache_read`
  - 使用 role-specific `price_profile`
  - 对高频角色可施加 `price_cap`
- `request_billing`
  - 大多数高价值角色仍然质量优先
  - 只保留轻量 `request_multiplier` tier penalty
  - 但 `mic` 例外：它在 request billing 下依然显式 cost-sensitive，并对低倍率 economy 候选保留明显偏好

对应函数：

- `resolveRoleStrategy()`
- `pricePenaltyForRole()`
- `filterRoleCandidates()`

也就是说，大部分角色的 `cost_efficiency` 在 `request_billing` 下只是弱信号；但 `mic` 会继续把 `speed + cost_efficiency + low multiplier` 作为核心前台约束。

### 5.4 markdown policy 怎样影响最终分数

对于某个 role，最终分数现在是：

1. markdown policy 的 `focus` + `shape` 会先生成该 role 的内部维度权重
2. `thinking` / `traffic` / `cost` 会进一步调节这些权重与价格惩罚
3. `provider_preferences` 带来 capped soft bonus
4. markdown policy 的 family / benchmark / keyword 排序偏好会提供额外加减分
5. token/request billing 下的价格惩罚最后作用到总分
6. 当 evidence catalog 命中并启用 `evidence_rank_strength > 0` 时，`coding_evidence` / `agentic_evidence` 维度会从融合分覆盖，并按 strength 把 `coding` / `reasoning` 等 token-name rank 维度的权重压向 0；naming 永远不会作为 rank 维度被恢复

> 重要：token / family / keyword 在 `provider_preferences` / `global_avoid_keywords` / markdown 的 `keyword_avoidances` 这些**排除/避让**层仍然有效；它们只对“是否进入候选”起作用，不再以隐式方式影响 rank。

其中 benchmark 匹配不是整串精确相等，而是 tag subset match：

- `coding+quality` 可以匹配 `coding+premium+quality`
- `fast` 可以匹配任何带 `fast` tag 的 benchmark key

因此如果你希望“主要参考明文 policy”，正确做法不是把所有模型都写进 `role_model_preferences`，而是：

- 用 markdown policy 调 role-routing baseline
- 用 `role_model_preferences` 只表达少量 selector intent / fallback intent

这些静态 price hint 现在带有 provenance，因此排序逻辑可以知道它使用的是：

- 已核验的 `fact-checked` metadata
- 或仅供本地近似路由的 `heuristic` metadata

当前仓库如果没有附带完整证据链，就应优先诚实地标成 `heuristic`。

### 5.3 role-specific price profile 是什么

当前实现会按策略轨为每个 role 定义 price behavior：

- `input`
- `output`
- `cache_read`
- `sensitivity`
- `request_tier_penalties`
- 可选 `price_cap`

含义不是精确账单模拟，而是表达该角色更像哪种工作负载：

- `mic` / `snap`：短输入多、响应要快，偏 input-sensitive
- `map` / `scout`：更可能消耗大量上下文和缓存读取，偏 input/cache-read-sensitive
- `pi` / `dev` / `debug` / `wise`：更看重生成质量，偏 output-sensitive

如果某个模型有静态 price hint，路由器会按这个 role profile 算出更贴近角色用途的 effective price，再转成 penalty。

### 5.4 provider preference 的影响

`provider_preferences` 不是 hard filter，而是 **soft ranking bonus**。

当前逻辑：

- 仅当 **完整 provider id**（模型 id 中第一个 `/` 之前的段，大小写不敏感）与 preference 列表某项 **完全相等** 时给 soft bonus；不再用 semantic family 去命中 preference 列表。
- 列表顺序仍决定 bonus 强度（靠前更高），并由各 role 的 `provider_bonus_cap` 封顶。

对应函数：

- `providerPreferenceScore()`

所以它不会强行把模型池锁死在某个 provider 上，只会在已有候选中抬高排序。

### 5.5 为什么 `co-pi` 会更明显地避开高价 premium model

`co-pi` 的职责是 second-brain / route sanity / plan pressure-test。

在 `token_billing` 下，这类角色通常会频繁参与短到中等长度的 advisory turns，因此当前实现有意让 `co-pi` 对价格更敏感：

- 保留 capability 排序
- 但对 premium tier 施加更强的 penalty
- 当存在明显更便宜、能力接近的 mid-tier 替代时，优先选 mid-tier

这正是为了避免像 `Opus` 这类高价模型，仅凭粗粒度 profile 优势，就稳定压过 `gpt-5.1-codex-max`、`Sonnet`、`Gemini Pro` 这一类近 peer 的候选。

### 5.6 `vis` 的 multimodal 候选优先

`vis` 现在除了权重上强烈偏向 `multimodal`，还会在候选阶段做一个简单规则：

- 如果当前模型池里存在明显 multimodal-capable 的模型
- `vis` 会优先只在这些 multimodal 候选中排序

如果没有 multimodal 候选，才回退到普通排序。

这样可以避免一个纯文本高分模型，仅凭 reasoning / price，把真正适合视觉工作的模型压下去。

---

## 6. role_model_preferences 是怎样参与匹配的

### 6.1 primary selection

对每个 role，会先看：

- `routerConfig.role_model_preferences[role]`

如果该 role 有 selector 列表，系统会按顺序尝试解析：

1. 若 selector 是 `provider/model`，要求当前模型池中有完全匹配项
2. 若 selector 是 provider-agnostic name，则会把当前模型池里“同名模型”找出来，再用 role scoring 选其中最优一个

如果某个 selector 解析成功，就作为该 role 的 primary pick。

### 6.2 selector 不命中时

如果 selector 在当前 verified pool 中无法解析：

- 会累计 warning
- 不会强行选一个假模型

相关 warning 包括：

- `Preference selectors unmatched in current model pool`
- `No preferred selectors matched for roles`
- `Stale config selectors (not in verified discovery)`

### 6.3 如果 role 没有可用 selector

系统会直接在当前有效模型池中，按角色评分从高到低选第一名。

---

## 7. semantic family 是什么

当前实现里的 family 指的是**模型语义家族**，不是 provider。

例如：

- `claude`
- `gpt`
- `gemini`
- `llama`
- `mistral`
- `deepseek`

相关逻辑在：

- `src/model-benchmarks.js`

当前 family 推断流程：

1. 优先从模型名 token 判断
2. token 无法判断时，再用 provider 作为 fallback
3. 还不行时，退回第一个 token 或 `other`

这意味着：

- family 的主要用途是表达“这是哪一类模型”
- provider 仍保留为独立字段，用于 soft preference 和结果展示

---

## 8. Co-pi 的 cross-family 规则

配置项：

- `force_cross_model_family_for_copi`

当前逻辑在 `src/model-match.js`：

1. 先为 `pi` 选出主模型
2. 为 `co-pi` 建立候选列表
3. 如果 `force_cross_model_family_for_copi !== false`，则优先找一个 **family 与 Pi 不同** 的模型
4. 如果找不到，再退回候选第一名 / 正常选择逻辑

这条规则的含义是：

- Co-pi 尽量和 Pi 站在不同语义模型家族上
- 目标是增加 second opinion 的异质性
- 它不是要求不同 provider，而是要求不同 family

---

## 9. 输出长什么样

每个 role 的输出通常包含：

- `model`
- `default_model`
- `provider`
- `family`
- `family_recommendation`
- `rating`
- `capability_score`
- `provider_bonus`
- `price_penalty`
- `price_tier`
- `price_hint`
- `role_price_profile`
- `benchmark_basis`
- `benchmark_key`
- `dimensions`
- `applied_weights`

同时 recommendation 还会输出：

- `fallback.pi`
- `fallback.co-pi`
- `fallback.wise`
- `warnings`
- `available_models`
- `model_pool_source`
- `model_pool_verified`
- `model_pool_verification`
- `model_discovery_audit`
- `evidence_catalog`：包含 `found` / `source` / `pool_fingerprint` / `sources[]` / `fusion` / `binding` / `evidence_rank_strength` / `enabled`

每个 role 还会带：

- `evidence_hit`：是否命中 evidence catalog
- `evidence_basis`：`matched` / `mismatch_neutral` / `missing` / `none`
- `pool_fingerprint_match`：当前 catalog binding 是否与 verified pool fingerprint 一致
- `evidence_fusion`：融合得到的 `coding_evidence` / `agentic_evidence` / `reasoning_evidence` / `confidence` / `fusion_mode` / `applied_weights`
- `evidence_by_source`：紧凑的 per-source 原始打分

这些都保存在：

- `~/.local/share/opencode/plugins/opencode-router/global/model-match.json`

---

## 10. bootstrap / rematch 什么时候会写回配置

### 10.1 bootstrap

`scripts/bootstrap.js` 当前职责仍然很克制：

- 只负责确保全局 `~/.config/opencode/opencode-router.json` 存在/更新

它**不会**：

- 写 `opencode.json`
- 安装 agent / command / plugin wrapper 文件

### 10.2 rematch

下列路径现在都会先**同步执行 verified discovery**（`opencode models`），然后立刻用这次 discovery audit 生成最终 recommendation，并把 recommendation 派生出的：

- `role_model_preferences`

写回 router config：

- `node bin/opencode-router.js rematch-models --write`
- OpenCode 内 `/pi-rematch-token`
- OpenCode 内 `/pi-rematch-request`
- plugin 的相关 rematch 路径

写回使用的不是完整 recommendation 全量落盘，而是把：

- `recommendation.roles[role].default_model`
- `recommendation.fallback[role]`

转换成：

- `role_model_preferences[role] = [default_model, ...matchedFallbacks]`，其中 `matchedFallbacks` 先保留你在配置里写出且仍能解析的 selector 顺序，再**追加**若干按角色评分排序的模型（避免 discovery 出现的新 SKU——例如新的 Kimi——永远不进入写回链）。

同时会把这次 rematch 选定/确认的：

- `billing_mode`

同步进 global router config。

也就是说，当前 rematch 流程是：

1. refresh discovery
2. rematch
3. 返回 done result

不再是“先给本地结果，再排队做 discovery follow-up”。

### 10.3 为什么只写 role_model_preferences

因为 router config 的目标是表达：

- 用户/系统当前希望优先尝试哪些模型 selector

而不是把全部运行态 recommendation 细节塞回配置。

完整 recommendation 仍然以：

- `~/.local/share/opencode/plugins/opencode-router/global/model-match.json`

为主。

---

## 11. 它不会做什么

当前实现明确**不会**：

- 写入 `opencode.json`
- 依赖内置 preset 模型池偷偷兜底
- 把 provider preference 当成硬 allowlist
- 在没有 verified availability 时伪造“看起来可用”的模型推荐

---

## 12. 作为操作者，什么时候该手改配置

### 12.1 建议直接依赖自动结果的情况

如果你只是想让系统根据当前环境自动选更合适模型：

- 保持 `provider_preferences` 简洁
- 少量使用 `role_model_preferences`
- 通过 `/pi-rematch-token`、`/pi-rematch-request` 或 `rematch-models --write` 让系统刷新
- 这些刷新路径都会先做同步 verified discovery，再返回最终结果
- 在 OpenCode 内直接根据你要的计费模式运行对应命令，而不是依赖命令参数

### 12.2 建议手改的情况

以下情况可以手改 `role_model_preferences`：

- 你明确知道某个 role 必须偏好某个模型
- 你想先锁定 selector，再让 availability / rating 在同名模型里继续排序
- 你在做环境切换，需要快速覆盖自动结果

### 12.3 不建议手改的情况

如果你只是“猜测某模型可能更强”，但没有 availability 事实：

- 不建议直接把大量固定 provider/model 写死
- 更建议先刷新 verified discovery，再看 recommendation

---

## 13. 当前文档覆盖情况结论

在新增本文之前，仓库里已有的信息主要分散在：

- `README.md`
- `docs/prd_refined.md`
- 代码实现本身

这些内容能说明方向，但**没有一份面向操作者的、实现级的完整说明文档**。

所以当前新增这个文档是有必要的。

---

## 14. 一句话总结

`agent-model-match` 当前是一个：

> 基于 verified availability + role dimensions + benchmark/rating + billing mode + soft provider preference 的本地推荐系统；它把完整 recommendation 写进默认 app-data 下的 `.../plugins/opencode-router/global/model-match.json`，并在 rematch 时把派生出的 `role_model_preferences`（含 fallback 链）和 `billing_mode` 写回全局 `opencode-router.json`，但不会写 `opencode.json`。
