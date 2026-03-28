# agent-model-match 机制说明

本文档说明 `opencode-router` 当前实现里的 `agent-model-match`（也可简称 `model-match`）是如何工作的、依据什么做匹配、什么时候会同步写回配置，以及它**不会**做什么。

实现基准以当前代码为准，主要对应：

- `src/model-match.js`
- `src/model-benchmarks.js`
- `src/router-config.js`
- `plugins/opencode-router.js`
- `scripts/bootstrap.js`
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

配置优先级是：

1. `OPENCODE_ROUTER_CONFIG` 环境变量指定的明确路径
2. 全局路径 `~/.config/opencode/opencode-router.json`

项目内 `.opencode/opencode-router.json` 与 repo root `opencode-router.json` 当前都**忽略**。

### 3.3 Markdown policy baseline

当前实现支持一个**用户可维护的 markdown 评分基准文件**。

默认路径：

- `~/.config/opencode/opencode-router-model-match.md`

也可以通过以下任一方式覆盖路径：

- `model_match_policy_markdown_path`
- `OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN`

生成默认模板：

- `opencode-router bootstrap --write-model-policy`

这个 markdown 文件不是备注，它会真实参与打分。

当前支持覆盖的参数包括：

- `dimension_priority`
- `dimension_baseline`
- `price_sensitivity`
- `thinking_sensitivity`
- `role_frequency`
- `fallback_depth`
- `price_cap`
- `family_preferences`
- `family_avoidances`
- `benchmark_preferences`
- `benchmark_avoidances`

建议：

- 用抽象 family / benchmark key，而不是具体模型版本
- 把 `role_model_preferences` 继续当作 selector intent
- 把 markdown policy 当作主要 role scoring baseline
- 把这个文件当作“人类维护的角色偏好描述”，而不是小数点配置表

### 3.4 角色维度权重

当前实现不再使用“一套角色权重 + billing mode 小幅微调”。

默认内置策略定义在 `src/model-match.js` 的 **双轨 `ROLE_STRATEGIES`**：

- `token_billing`
- `request_billing`

例如：

- `mic` 更看重 `instruction`、`cost_efficiency`、`speed`
- `pi` 更看重 `reasoning`、`coding`、`long_context`、`output_quality`
- `co-pi` 现在明确是 **Pi 的 second-brain**，不是 `wise` 的低配替身；在 token billing 下更偏 mid-tier second-brain，在 request billing 下更偏高质量辅助思考
- `wise` 更看重 `reasoning`、`long_context`、`output_quality`
- `dev` / `debug` 更看重 `coding`，但 `debug` 比 `dev` 更重视 `reasoning` 与 `context`
- `doc` 更看重 `instruction`、`output_quality`、`long_context`
- `map` 更看重 `long_context` / `context`，兼顾 cache-read 价格敏感度
- `scout` / `snap` 更看重速度与低成本
- `desi` 是 text-first UX/UI 创意与表达角色，不再把 `multimodal` 当成核心维度；`vis` 才是 image-aware 角色

这意味着同一批模型，在不同角色上会得到不同排序。

但如果 markdown policy 对某个 role/billing mode 写了覆盖项，运行时会优先把这些抽象偏好翻译成内部权重 / 惩罚策略，再参与最终评分。

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

就会对多个维度评分做加减，最后形成该模型的 benchmark profile。

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

1. markdown policy 的 `dimension_priority` + `dimension_baseline` 会先生成该 role 的内部维度权重
2. `thinking_sensitivity` / `role_frequency` / `price_sensitivity` 会进一步调节这些权重与价格惩罚
3. `provider_preferences` 带来 capped soft bonus
4. markdown policy 的 family / benchmark 排序偏好会提供额外加减分
5. token/request billing 下的价格惩罚最后作用到总分

因此如果你希望“主要参考明文 policy”，正确做法不是把所有模型都写进 `role_model_preferences`，而是：

- 用 markdown policy 调 role scoring baseline
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

- 如果 provider 命中 preference，给较高 bonus
- 如果 semantic family 命中 preference，给较低 bonus

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

- `role_model_preferences[role] = [default_model, ...matchedFallbacks]`

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
