function lower(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function cloneRatings(ratings) {
  return { ...ratings };
}

const DEFAULT_RATINGS = {
  reasoning: 3,
  coding: 3,
  instruction: 3,
  context: 3,
  long_context: 3,
  output_quality: 3,
  speed: 3,
  multimodal: 2,
  cost_efficiency: 3,
  coding_evidence: 3,
  agentic_evidence: 3,
};

const TOKEN_PROFILES = [
  {
    key: "mini",
    match:
      /(^|[-_/])mini($|[-_/])|(^|[-_/])small($|[-_/])|(^|[-_/])nano($|[-_/])/,
    ratings: {
      reasoning: -1,
      coding: 0,
      instruction: 0,
      context: -1,
      long_context: -1,
      output_quality: -1,
      speed: 2,
      multimodal: 0,
      cost_efficiency: 2,
    },
  },
  {
    key: "fast",
    match:
      /(^|[-_/])flash($|[-_/])|(^|[-_/])fast($|[-_/])|(^|[-_/])turbo($|[-_/])|(^|[-_/])instant($|[-_/])|(^|[-_/])haiku($|[-_/])/,
    ratings: {
      reasoning: -1,
      coding: -1,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: -1,
      speed: 2,
      multimodal: 0,
      cost_efficiency: 1,
    },
  },
  {
    key: "coding",
    match:
      /(^|[-_/])code($|[-_/])|(^|[-_/])coder($|[-_/])|(^|[-_/])codex($|[-_/])|(^|[-_/])dev($|[-_/])/,
    ratings: {
      reasoning: 0,
      coding: 2,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: 1,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 0,
    },
  },
  {
    key: "premium",
    match:
      /(^|[-_/])pro($|[-_/])|(^|[-_/])max($|[-_/])|(^|[-_/])ultra($|[-_/])|(^|[-_/])opus($|[-_/])|(^|[-_/])reasoning($|[-_/])/,
    ratings: {
      reasoning: 2,
      coding: 1,
      instruction: 1,
      context: 1,
      long_context: 1,
      output_quality: 2,
      speed: -1,
      multimodal: 0,
      cost_efficiency: -1,
    },
  },
  {
    key: "balanced",
    match:
      /(^|[-_/])sonnet($|[-_/])|(^|[-_/])balanced($|[-_/])|(^|[-_/])standard($|[-_/])/,
    ratings: {
      reasoning: 1,
      coding: 1,
      instruction: 1,
      context: 1,
      long_context: 1,
      output_quality: 1,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 0,
    },
  },
  {
    key: "multimodal",
    match:
      /(^|[-_/])vision($|[-_/])|(^|[-_/])image($|[-_/])|(^|[-_/])multimodal($|[-_/])|(^|[-_/])omni($|[-_/])/,
    ratings: {
      reasoning: 0,
      coding: 0,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: 0,
      multimodal: 2,
      cost_efficiency: 0,
    },
  },
  {
    key: "long-context",
    match:
      /(^|[-_/])(128k|200k|1m|long|extended|context)($|[-_/])|(^|[-_/])gemini($|[-_/])/,
    ratings: {
      reasoning: 0,
      coding: 0,
      instruction: 0,
      context: 1,
      long_context: 2,
      output_quality: 0,
      speed: -1,
      multimodal: 0,
      cost_efficiency: 0,
    },
  },
  {
    key: "quality",
    match:
      /(^|[-_/])opus($|[-_/])|(^|[-_/])sonnet($|[-_/])|(^|[-_/])pro($|[-_/])|(^|[-_/])max($|[-_/])|(^|[-_/])advanced($|[-_/])/,
    ratings: {
      reasoning: 0,
      coding: 0,
      instruction: 1,
      context: 0,
      long_context: 0,
      output_quality: 1,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 0,
    },
  },
  {
    key: "qwen",
    match: /(^|[-_/])qwen|(^|[-_/])qwq/i,
    ratings: {
      reasoning: 1,
      coding: 0,
      instruction: 1,
      context: 1,
      long_context: 1,
      output_quality: 0,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 1,
    },
  },
  {
    key: "kimi",
    match:
      /(^|[-_/])(kimi|moonshot)($|[-_/])|(^|[-_/])k2($|[-_/])/i,
    ratings: {
      reasoning: 1,
      coding: 2,
      instruction: 1,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 1,
    },
  },
  {
    key: "kimi-k2-swe",
    match:
      /(^|[-_/])(kimi[-_/]?k2|moonshot[-_/]?k2|k2[-_.][0-9]|k2-thinking)($|[-_/])/i,
    ratings: {
      reasoning: 0,
      coding: 1,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 0,
    },
  },
  {
    key: "mimo",
    match: /(^|[-_/])mimo($|[-_/])/i,
    ratings: {
      reasoning: 1,
      coding: 1,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: 1,
      multimodal: 0,
      cost_efficiency: 1,
    },
  },
  {
    key: "grok",
    match: /(^|[-_/])grok($|[-_/])/i,
    ratings: {
      reasoning: 1,
      coding: 0,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: 1,
      multimodal: 0,
      cost_efficiency: 0,
    },
  },
  {
    key: "glm",
    match: /(^|[-_/])glm|(^|[-_/])zhipu|(^|[-_/])chatglm/i,
    ratings: {
      reasoning: 1,
      coding: 1,
      instruction: 1,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 1,
    },
  },
  {
    key: "minimax",
    match: /(^|[-_/])minimax|(^|[-_/])abab($|[-_/])/i,
    ratings: {
      reasoning: 1,
      coding: 1,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: 0,
      multimodal: 0,
      cost_efficiency: 1,
    },
  },
  {
    key: "deepseek",
    match: /(^|[-_/])deepseek|(^|[-_/])deep[-_]seek/i,
    ratings: {
      reasoning: 2,
      coding: 1,
      instruction: 0,
      context: 0,
      long_context: 0,
      output_quality: 0,
      speed: -1,
      multimodal: 0,
      cost_efficiency: 1,
    },
  },
];

function clampRating(value) {
  return Math.max(1, Math.min(5, value));
}

const FAMILY_RULES = [
  { family: "claude", providers: ["anthropic"], tokens: ["claude"] },
  {
    family: "gpt",
    providers: ["openai", "azure-openai", "azure"],
    tokens: ["gpt", "chatgpt", "davinci", "curie", "babbage", "ada"],
  },
  {
    family: "gemini",
    providers: ["google", "googleai", "google-ai", "vertexai"],
    tokens: ["gemini"],
  },
  {
    family: "llama",
    providers: ["meta", "meta-llama", "groq", "together"],
    tokens: ["llama", "llama2", "llama-2", "llama3", "llama-3"],
  },
  {
    family: "mistral",
    providers: ["mistral"],
    tokens: ["mistral", "codestral"],
  },
  {
    family: "cohere",
    providers: ["cohere"],
    tokens: ["cohere", "command", "command-r", "command-r-plus"],
  },
  { family: "deepseek", providers: ["deepseek"], tokens: ["deepseek"] },
  {
    family: "glm",
    providers: ["zhipuai", "zhipu", "z-ai", "zai", "chatglm"],
    tokens: ["glm", "chatglm", "glmt"],
  },
  {
    family: "minimax",
    providers: ["minimax", "minimax-cn", "minimaxai"],
    tokens: ["minimax", "abab"],
  },
  { family: "gemma", providers: [], tokens: ["gemma"] },
  { family: "phi", providers: [], tokens: ["phi"] },
  {
    family: "grok",
    providers: ["xai", "x-ai", "grok"],
    tokens: ["grok"],
  },
  {
    family: "qwen",
    providers: ["qwen", "dashscope", "alibabacloud"],
    tokens: ["qwen", "qwq", "qwenvl", "qwen2", "qwen3", "qwen2.5"],
  },
  {
    family: "kimi",
    providers: ["moonshot", "kimi", "moonshotai"],
    tokens: ["kimi", "moonshot"],
  },
  { family: "mimo", providers: ["xiaomi", "mimo"], tokens: ["mimo"] },
];

const STATIC_PRICE_HINTS = [
  {
    key: "claude-opus",
    family: "claude",
    match: /(^|[-_/])opus($|[-_/])/,
    hint: {
      runtime: {
        tier: "premium",
        blended_usd_per_mtok: 75,
        input_usd_per_mtok: 15,
        output_usd_per_mtok: 75,
        cache_read_usd_per_mtok: 1.5,
        family: "claude",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "claude-opus-4-1-20250805",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "Claude Opus family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "claude-sonnet",
    family: "claude",
    match: /(^|[-_/])sonnet($|[-_/])/,
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 9,
        input_usd_per_mtok: 3,
        output_usd_per_mtok: 15,
        cache_read_usd_per_mtok: 0.3,
        family: "claude",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "claude-sonnet-4-6",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "Claude Sonnet family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "claude-haiku",
    family: "claude",
    match: /(^|[-_/])haiku($|[-_/])/,
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 1.2,
        input_usd_per_mtok: 0.8,
        output_usd_per_mtok: 4,
        cache_read_usd_per_mtok: 0.08,
        family: "claude",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "claude-haiku-4-5-20251001",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "Claude Haiku family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "gpt-codex-max",
    match:
      /(^|[-_/])codex[-_/]?max($|[-_/])|(^|[-_/])max[-_/]?codex($|[-_/])/,
    family: "gpt",
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 12,
        input_usd_per_mtok: 4,
        output_usd_per_mtok: 20,
        cache_read_usd_per_mtok: 0.4,
        family: "gpt",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "openai/gpt-5.1-codex-max",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "GPT Codex Max family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "gpt-max",
    match:
      /(^|[-_/])max($|[-_/])|(^|[-_/])pro($|[-_/])/,
    family: "gpt",
    hint: {
      runtime: {
        tier: "premium",
        blended_usd_per_mtok: 20,
        input_usd_per_mtok: 5,
        output_usd_per_mtok: 35,
        cache_read_usd_per_mtok: 0.5,
        family: "gpt",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "gpt-5.4-pro",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "Premium GPT family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "gemini-flash",
    family: "gemini",
    match: /(^|[-_/])flash($|[-_/])/,
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 0.4,
        input_usd_per_mtok: 0.1,
        output_usd_per_mtok: 0.7,
        cache_read_usd_per_mtok: 0.02,
        family: "gemini",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "gemini-2.5-flash",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "Gemini Flash family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "gemini-pro",
    match:
      /(^|[-_/])pro($|[-_/])/,
    family: "gemini",
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 6,
        input_usd_per_mtok: 1.5,
        output_usd_per_mtok: 10.5,
        cache_read_usd_per_mtok: 0.15,
        family: "gemini",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "gemini-2.5-pro",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "Gemini Pro family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "gpt-mini",
    match:
      /(^|[-_/])mini($|[-_/])|(^|[-_/])nano($|[-_/])/,
    family: "gpt",
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 2,
        input_usd_per_mtok: 0.8,
        output_usd_per_mtok: 3.2,
        cache_read_usd_per_mtok: 0.08,
        family: "gpt",
        pattern_basis: "family_pattern",
        source: "models_dev_family_snapshot",
      },
      evidence: {
        evidence_model_id: "gpt-5.4-mini",
        source_label: "models.dev api.json",
        evidence_type: "fact_snapshot",
        source_url: "https://models.dev/api.json",
        verified_at: "2026-03-27",
        verified_by: "router_local",
        derivation: "Runtime pricing metadata stays family-pattern based; concrete models.dev snapshot is stored only as evidence.",
        note: "GPT mini family evidence snapshot from models.dev catalog.",
      },
    },
  },
  {
    key: "qwen-flash",
    family: "qwen",
    match: /(^|[-_/])(flash|turbo|light)($|[-_/])/i,
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 0.2,
        input_usd_per_mtok: 0.05,
        output_usd_per_mtok: 0.35,
        cache_read_usd_per_mtok: 0.01,
        family: "qwen",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "qwen-open-weight-economy-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Approximate blended MTok for Qwen-class flash / turbo SKUs on typical open relay pricing; override with real hints when available.",
        note: "Heuristic tier for Qwen-family speed-optimized variants.",
      },
    },
  },
  {
    key: "qwen-open",
    family: "qwen",
    match: /.+/,
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 0.9,
        input_usd_per_mtok: 0.25,
        output_usd_per_mtok: 1.55,
        cache_read_usd_per_mtok: 0.03,
        family: "qwen",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "qwen-open-weight-mid-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Broad mid-tier placeholder for Qwen / QwQ family on aggregators; flash-like names match qwen-flash first.",
        note: "Heuristic catch-all for Qwen-family models without a tighter price row.",
      },
    },
  },
  {
    key: "kimi-flash",
    family: "kimi",
    match: /(^|[-_/])flash($|[-_/])/i,
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 0.35,
        input_usd_per_mtok: 0.1,
        output_usd_per_mtok: 0.6,
        cache_read_usd_per_mtok: 0.02,
        family: "kimi",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "kimi-moonshot-economy-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation: "Economy-tier heuristic for Kimi / Moonshot flash-style endpoints.",
        note: "Heuristic for Kimi flash naming.",
      },
    },
  },
  {
    key: "kimi-open",
    family: "kimi",
    match: /.+/,
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 1.2,
        input_usd_per_mtok: 0.35,
        output_usd_per_mtok: 2.05,
        cache_read_usd_per_mtok: 0.04,
        family: "kimi",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "kimi-moonshot-mid-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation: "Mid-tier heuristic for Kimi / Moonshot / k2-class general models.",
        note: "Heuristic catch-all for Kimi-family models.",
      },
    },
  },
  {
    key: "mimo-open",
    family: "mimo",
    match: /.+/,
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 0.55,
        input_usd_per_mtok: 0.15,
        output_usd_per_mtok: 0.95,
        cache_read_usd_per_mtok: 0.02,
        family: "mimo",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "mimo-open-weight-mid-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation: "Mid-tier heuristic for Xiaomi MiMo-class open models on typical relays.",
        note: "Heuristic for MiMo-family models.",
      },
    },
  },
  {
    key: "deepseek-flash",
    family: "deepseek",
    match: /(^|[-_/])(flash|turbo|light)($|[-_/])/i,
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 0.18,
        input_usd_per_mtok: 0.05,
        output_usd_per_mtok: 0.32,
        cache_read_usd_per_mtok: 0.01,
        family: "deepseek",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "deepseek-open-economy-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Economy-tier heuristic for DeepSeek flash-style SKUs; align with models.dev DeepSeek family listings.",
        note: "Heuristic for DeepSeek flash / turbo style names.",
      },
    },
  },
  {
    key: "deepseek-open",
    family: "deepseek",
    match: /.+/,
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 0.85,
        input_usd_per_mtok: 0.22,
        output_usd_per_mtok: 1.48,
        cache_read_usd_per_mtok: 0.03,
        family: "deepseek",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "deepseek-open-mid-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Mid-tier heuristic for DeepSeek general / pro-class models on typical relays; catalog shapes follow models.dev slug families.",
        note: "Heuristic catch-all for DeepSeek-family models.",
      },
    },
  },
  {
    key: "glm-flash",
    family: "glm",
    match: /(^|[-_/])(flash|turbo|light|air)($|[-_/])/i,
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 0.25,
        input_usd_per_mtok: 0.07,
        output_usd_per_mtok: 0.4,
        cache_read_usd_per_mtok: 0.01,
        family: "glm",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "glm-open-economy-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Economy-tier heuristic for GLM flash / air style SKUs; naming mirrors models.dev GLM entries.",
        note: "Heuristic for GLM economy-class variants.",
      },
    },
  },
  {
    key: "glm-open",
    family: "glm",
    match: /.+/,
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 0.95,
        input_usd_per_mtok: 0.28,
        output_usd_per_mtok: 1.62,
        cache_read_usd_per_mtok: 0.03,
        family: "glm",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "glm-open-mid-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Mid-tier heuristic for GLM-class models on OpenCode / aggregator relays; slug shapes follow models.dev `opencode` catalog.",
        note: "Heuristic catch-all for GLM-family models.",
      },
    },
  },
  {
    key: "minimax-flash",
    family: "minimax",
    match: /(^|[-_/])(flash|turbo|light|highspeed)($|[-_/])/i,
    hint: {
      runtime: {
        tier: "economy",
        blended_usd_per_mtok: 0.3,
        input_usd_per_mtok: 0.09,
        output_usd_per_mtok: 0.52,
        cache_read_usd_per_mtok: 0.02,
        family: "minimax",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "minimax-open-economy-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Economy-tier heuristic for MiniMax speed-optimized SKUs; naming mirrors models.dev MiniMax-M2* listings.",
        note: "Heuristic for MiniMax flash / highspeed style names.",
      },
    },
  },
  {
    key: "minimax-open",
    family: "minimax",
    match: /.+/,
    hint: {
      runtime: {
        tier: "mid",
        blended_usd_per_mtok: 1.0,
        input_usd_per_mtok: 0.3,
        output_usd_per_mtok: 1.7,
        cache_read_usd_per_mtok: 0.035,
        family: "minimax",
        pattern_basis: "open_source_router_heuristic",
        source: "router_open_source_heuristic",
      },
      evidence: {
        evidence_model_id: "minimax-open-mid-tier",
        source_label: "opencode-router heuristic",
        evidence_type: "heuristic_bundle",
        source_url: null,
        verified_at: null,
        verified_by: "router_local",
        derivation:
          "Mid-tier heuristic for MiniMax M2-class models; slug shapes follow models.dev `opencode` / `opencode-go` catalogs.",
        note: "Heuristic catch-all for MiniMax-family models.",
      },
    },
  },
];

/** Providers that ship the OpenCode Zen / models.dev-aligned model slug lists. */
const MODELS_DEV_ZEN_ANCHOR_PROVIDERS = new Set(["opencode", "opencode-go"]);

/**
 * Family slug prefixes shared by models.dev `opencode` + `opencode-go` catalogs and ZenMux-style
 * aggregations (no concrete dated SKUs; only stable vendor slug stems for benchmark_basis tagging).
 */
const MODELS_DEV_ZEN_CATALOG_PREFIX_RX =
  /(^|[-_/])(glm|minimax|deepseek|qwen|qwq|kimi|mimo|grok)(?=[0-9]|[$._-]|$)/i;

function tokenizeModelId(modelId) {
  const value = lower(modelId);
  if (!value) return { provider: "", tokens: [] };
  const segments = value.split("/").filter(Boolean);
  const provider = segments[0] || "";
  const remainder = segments.slice(1).join("/");
  const tokens = [
    ...segments.slice(1),
    ...remainder.split(/[\/_\-]+/).filter(Boolean),
  ];
  return { provider, tokens };
}

function inferFamily(modelId) {
  const { provider, tokens } = tokenizeModelId(modelId);
  if (!provider && tokens.length === 0) return "other";

  for (const rule of FAMILY_RULES) {
    if (tokens.some((token) => rule.tokens.includes(token))) return rule.family;
  }

  for (const rule of FAMILY_RULES) {
    if (rule.providers.includes(provider)) return rule.family;
  }

  const firstToken = tokens.find(Boolean);
  return firstToken || "other";
}

export function familyOf(modelId) {
  return inferFamily(modelId);
}

export function providerOf(modelId) {
  const value = String(modelId || "").trim();
  if (!value.includes("/")) return "unscoped";
  return lower(value.split("/")[0]) || "unscoped";
}

export function modelNameOf(modelId) {
  const value = lower(modelId);
  if (!value) return "";
  if (!value.includes("/")) return value;
  return value.split("/").slice(1).join("/");
}

function normalizePriceHintEntry(modelId, entry) {
  if (!entry?.hint) return null;
  const runtime = entry.hint.runtime || {};
  const evidence = entry.hint.evidence || {};
  return {
    model: String(modelId || "").trim(),
    key: entry.key,
    tier: runtime.tier || "unknown",
    blended_usd_per_mtok: Number(runtime.blended_usd_per_mtok) || null,
    input_usd_per_mtok: Number(runtime.input_usd_per_mtok) || null,
    output_usd_per_mtok: Number(runtime.output_usd_per_mtok) || null,
    cache_read_usd_per_mtok: Number(runtime.cache_read_usd_per_mtok) || null,
    runtime: {
      match_key: entry.key,
      family: runtime.family || null,
      pattern_basis: runtime.pattern_basis || "family_pattern",
      source: runtime.source || "models_dev_family_snapshot",
    },
    evidence: {
      evidence_model_id: evidence.evidence_model_id || null,
      source_url: evidence.source_url || null,
      source_label: evidence.source_label || null,
      evidence_type: evidence.evidence_type || "fact_snapshot",
      verified_at: evidence.verified_at || null,
      verified_by: evidence.verified_by || null,
      derivation: evidence.derivation || null,
      note: evidence.note || null,
    },
  };
}

export function priceHintOf(modelId) {
  const normalizedModel = modelNameOf(modelId);
  const family = familyOf(modelId);
  if (!normalizedModel) return null;
  for (const entry of STATIC_PRICE_HINTS) {
    if (entry.family && family !== entry.family) continue;
    if (!entry.match.test(normalizedModel)) continue;
    return normalizePriceHintEntry(modelId, entry);
  }
  return null;
}

export function lookupBenchmarkProfile(modelId) {
  const normalizedModel = modelNameOf(modelId);
  const matchedKeys = [];
  const ratings = cloneRatings(DEFAULT_RATINGS);
  const matchedProfileKeys = new Set();

  for (const entry of TOKEN_PROFILES) {
    if (!entry.match.test(normalizedModel)) continue;
    if (matchedProfileKeys.has(entry.key)) continue;
    matchedProfileKeys.add(entry.key);
    matchedKeys.push(entry.key);
    for (const [dimension, delta] of Object.entries(entry.ratings || {})) {
      ratings[dimension] = clampRating((ratings[dimension] || 0) + delta);
    }
  }

  const provider = providerOf(modelId);
  const zenCatalogAnchored =
    MODELS_DEV_ZEN_ANCHOR_PROVIDERS.has(provider) &&
    Boolean(normalizedModel) &&
    MODELS_DEV_ZEN_CATALOG_PREFIX_RX.test(normalizedModel);

  let benchmark_basis = "default_profile";
  if (matchedKeys.length > 0 && zenCatalogAnchored) {
    benchmark_basis = "token_profile+models_dev_zen";
  } else if (matchedKeys.length > 0) {
    benchmark_basis = "token_profile";
  } else if (zenCatalogAnchored) {
    benchmark_basis = "models_dev_zen";
  }

  return {
    model: String(modelId || "").trim(),
    provider,
    family: familyOf(modelId),
    benchmark_key: matchedKeys.length > 0 ? matchedKeys.join("+") : "default",
    benchmark_basis,
    ratings,
  };
}
