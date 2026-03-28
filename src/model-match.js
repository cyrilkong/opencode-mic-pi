import { spawn } from "node:child_process";
import { SCHEMA_VERSION, createId } from "./contracts.js";
import { readJson, writeJson } from "./fs-store.js";
import {
  familyOf,
  lookupBenchmarkProfile,
  modelNameOf,
  priceHintOf,
  priceTierOf,
  providerOf,
} from "./model-benchmarks.js";
import { writeRoleModelPreferences } from "./router-config.js";
import { STATE_PATHS } from "./paths.js";

export const MODEL_DISCOVERY_CHILD_ENV =
  "OPENCODE_ROUTER_MODEL_DISCOVERY_CHILD";
export const DISABLE_AUTO_REMATCH_ENV = "OPENCODE_ROUTER_DISABLE_AUTO_REMATCH";

function shouldDisableAutoRematch(env = process.env) {
  const disable = String(env?.[DISABLE_AUTO_REMATCH_ENV] || "").trim();
  const child = String(env?.[MODEL_DISCOVERY_CHILD_ENV] || "").trim();
  return disable === "1" || child === "1";
}

function detectBillingMode(explicitMode, configMode) {
  const fromEnvOrConfig =
    explicitMode ||
    configMode ||
    process.env.OPENCODE_ROUTER_BILLING_MODE ||
    "token_billing";
  const fromEnv = String(fromEnvOrConfig).trim();
  if (fromEnv === "request_billing") return "request_billing";
  return "token_billing";
}

function normalizeTimeoutMs(value, fallback = 20000) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1000) return fallback;
  return Math.min(parsed, 120000);
}

function normalizeModelList(models = []) {
  return [
    ...new Set(
      (Array.isArray(models) ? models : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ];
}

function parseModelsFromStdout(stdoutText) {
  return normalizeModelList(
    String(stdoutText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[0])
      .filter(Boolean),
  );
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function modelDiscoveryFingerprint(models = []) {
  return stableStringify(
    normalizeModelList(models).sort((a, b) => a.localeCompare(b)),
  );
}

function createAuditRecord({
  status,
  models = [],
  timeoutMs,
  durationMs,
  opencodeBin,
  errorCode = null,
  errorMessage = null,
  exitCode = null,
  signal = null,
} = {}) {
  return {
    audit_id: createId("mda"),
    audited_at: new Date().toISOString(),
    status,
    command: "opencode models",
    command_bin: opencodeBin,
    timeout_ms: timeoutMs,
    duration_ms: durationMs,
    error_code: errorCode,
    error_message: errorMessage,
    exit_code: exitCode,
    signal,
    models: normalizeModelList(models),
    model_count: Array.isArray(models) ? normalizeModelList(models).length : 0,
    fingerprint: modelDiscoveryFingerprint(models),
  };
}

export function readModelDiscoveryAudit() {
  return readJson(STATE_PATHS.modelDiscoveryAudit, null);
}

export function writeModelDiscoveryAudit(audit) {
  if (!audit || typeof audit !== "object") return null;
  return writeJson(STATE_PATHS.modelDiscoveryAudit, audit);
}

function discoverAvailableModelsSync({
  opencodeBin = process.env.OPENCODE_BIN || "opencode",
  timeoutMs = normalizeTimeoutMs(
    process.env.OPENCODE_ROUTER_MODEL_DISCOVERY_TIMEOUT_MS,
    20000,
  ),
} = {}) {
  const startedAt = Date.now();
  const childEnv = {
    ...process.env,
    [MODEL_DISCOVERY_CHILD_ENV]: "1",
    [DISABLE_AUTO_REMATCH_ENV]: "1",
  };
  const child = spawn(opencodeBin, ["models"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch (error) {
        // ignore kill failure
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    child.on("error", (error) => {
      const durationMs = Date.now() - startedAt;
      finalize({
        models: [],
        timeout_ms: timeoutMs,
        duration_ms: durationMs,
        failed: true,
        timed_out: false,
        error_code: error?.code || null,
        error_message: error?.message || null,
        status: null,
        signal: null,
        stderr: String(stderr || "").trim() || null,
      });
    });

    child.on("close", (code, signal) => {
      const durationMs = Date.now() - startedAt;
      const models = parseModelsFromStdout(stdout);
      const failed = timedOut || (typeof code === "number" && code !== 0);
      finalize({
        models,
        timeout_ms: timeoutMs,
        duration_ms: durationMs,
        failed,
        timed_out: timedOut,
        error_code: timedOut ? "ETIMEDOUT" : null,
        error_message: timedOut
          ? `opencode models timed out after ${timeoutMs}ms`
          : null,
        status: typeof code === "number" ? code : null,
        signal: signal || null,
        stderr: String(stderr || "").trim() || null,
      });
    });
  });
}

export async function refreshVerifiedModelDiscoveryAudit({
  routerConfig = {},
  opencodeBin = process.env.OPENCODE_BIN || "opencode",
} = {}) {
  const timeoutMs = normalizeTimeoutMs(
    routerConfig?.opencode_models_timeout_ms ||
      process.env.OPENCODE_ROUTER_MODEL_DISCOVERY_TIMEOUT_MS,
    20000,
  );
  const discovery = await discoverAvailableModelsSync({
    opencodeBin,
    timeoutMs,
  });

  if (discovery.models.length > 0) {
    return writeModelDiscoveryAudit(
      createAuditRecord({
        status: "verified",
        models: discovery.models,
        timeoutMs,
        durationMs: discovery.duration_ms,
        opencodeBin,
        exitCode: discovery.status,
        signal: discovery.signal,
      }),
    );
  }

  if (discovery.timed_out) {
    return writeModelDiscoveryAudit(
      createAuditRecord({
        status: "timed_out",
        models: [],
        timeoutMs,
        durationMs: discovery.duration_ms,
        opencodeBin,
        errorCode: discovery.error_code,
        errorMessage: discovery.error_message,
        exitCode: discovery.status,
        signal: discovery.signal,
      }),
    );
  }

  return writeModelDiscoveryAudit(
    createAuditRecord({
      status: "failed",
      models: [],
      timeoutMs,
      durationMs: discovery.duration_ms,
      opencodeBin,
      errorCode:
        discovery.error_code ||
        (discovery.status !== null ? `EXIT_${discovery.status}` : "FAILED"),
      errorMessage:
        discovery.error_message ||
        discovery.stderr ||
        "opencode models returned no verified models",
      exitCode: discovery.status,
      signal: discovery.signal,
    }),
  );
}

export function isAutoRematchDisabled(env = process.env) {
  return shouldDisableAutoRematch(env);
}

function resolveModelPool({
  availableModels,
  availableModelsSource = "provided",
  availableModelsVerified = true,
  discoveryAudit = null,
} = {}) {
  const warnings = [];

  if (Array.isArray(availableModels)) {
    const provided = normalizeModelList(availableModels);
    if (provided.length === 0) {
      warnings.push(
        "provided model pool is empty; no models available for matching",
      );
    }
    return {
      models: provided,
      source: availableModelsSource,
      verified: availableModelsVerified === true,
      verification: {
        command: null,
        timeout_ms: null,
        status:
          availableModelsVerified === true
            ? "caller_asserted"
            : "runtime_config_derived",
      },
      warnings,
      audit: null,
    };
  }

  const audit =
    discoveryAudit && typeof discoveryAudit === "object"
      ? {
          audit_id: discoveryAudit.audit_id || null,
          audited_at: discoveryAudit.audited_at || null,
          status: discoveryAudit.status || "unknown",
          timeout_ms: Number.isFinite(discoveryAudit.timeout_ms)
            ? discoveryAudit.timeout_ms
            : null,
          duration_ms: Number.isFinite(discoveryAudit.duration_ms)
            ? discoveryAudit.duration_ms
            : null,
          model_count: Number.isFinite(discoveryAudit.model_count)
            ? discoveryAudit.model_count
            : null,
          fingerprint: discoveryAudit.fingerprint || null,
          error_code: discoveryAudit.error_code || null,
          error_message: discoveryAudit.error_message || null,
          previous_verified_at: discoveryAudit.previous_verified_at || null,
        }
      : null;

  if (audit?.status === "verified") {
    const verifiedModels = normalizeModelList(discoveryAudit?.models || []);
    if (verifiedModels.length > 0) {
      return {
        models: verifiedModels,
        source: "opencode_models_verified_audit",
        verified: true,
        verification: {
          command: "opencode models",
          timeout_ms: audit.timeout_ms,
          status: "verified",
        },
        warnings,
        audit,
      };
    }
    warnings.push(
      "verified model discovery audit has no models; no models available for matching",
    );
  } else if (audit?.status === "timed_out") {
    warnings.push(
      `verified model discovery timed out after ${audit.timeout_ms || "unknown"}ms; no verified model pool available`,
    );
  } else if (audit?.status === "failed") {
    warnings.push(
      "verified model discovery failed; no verified model pool available",
    );
  } else {
    warnings.push(
      "verified model discovery audit missing; run /pi-rematch-token or /pi-rematch-request to refresh verified model pool",
    );
  }

  return {
    models: [],
    source: "verified_discovery_required",
    verified: false,
    verification: {
      command: "opencode models",
      timeout_ms: audit?.timeout_ms || null,
      status: audit?.status || "missing",
    },
    warnings,
    audit,
  };
}

function finalizeWarnings({
  warnings = [],
  unmatchedSelectorCounts = {},
  emptyPreferredRoles = [],
  suppressSelectorWarnings = false,
} = {}) {
  const next = [...warnings];
  if (!suppressSelectorWarnings) {
    const selectorSummary = Object.entries(unmatchedSelectorCounts)
      .filter(([, count]) => Number.isInteger(count) && count > 0)
      .map(([role, count]) => `${role}(${count})`);
    if (selectorSummary.length > 0) {
      next.push(
        `Preference selectors unmatched in current model pool: ${selectorSummary.join(", ")}`,
      );
    }
    if (emptyPreferredRoles.length > 0) {
      next.push(
        `No preferred selectors matched for roles: ${emptyPreferredRoles.join(", ")}`,
      );
    }
  }
  return next;
}

const PRICE_TIER_RANK = {
  economy: 1,
  mid: 2,
  premium: 3,
  unknown: 99,
};

const DEFAULT_ROLE_PRICE_PROFILE = {
  input: 0.33,
  output: 0.33,
  cache_read: 0,
  sensitivity: 0.1,
};

const DEFAULT_REQUEST_TIER_PENALTIES = {
  economy: 0,
  mid: 0.015,
  premium: 0.05,
  unknown: 0.02,
};

const ROLE_STRATEGIES = {
  token_billing: {
    mic: {
      weights: {
        instruction: 0.31,
        speed: 0.23,
        cost_efficiency: 0.2,
        output_quality: 0.12,
        context: 0.06,
        reasoning: 0.05,
        long_context: 0.03,
      },
      price_profile: {
        input: 0.58,
        output: 0.12,
        cache_read: 0.05,
        sensitivity: 0.22,
      },
      price_cap_tier: "economy",
      price_cap_penalty: 0.14,
      provider_bonus_cap: 0.1,
      fallback_count: 3,
    },
    pi: {
      weights: {
        reasoning: 0.24,
        coding: 0.18,
        instruction: 0.14,
        context: 0.13,
        long_context: 0.11,
        output_quality: 0.12,
        speed: 0.03,
        cost_efficiency: 0.05,
      },
      price_profile: {
        input: 0.28,
        output: 0.42,
        cache_read: 0.05,
        sensitivity: 0.12,
      },
      provider_bonus_cap: 0.11,
      fallback_count: 4,
    },
    "co-pi": {
      weights: {
        reasoning: 0.23,
        instruction: 0.17,
        context: 0.15,
        output_quality: 0.14,
        coding: 0.1,
        speed: 0.08,
        cost_efficiency: 0.11,
        long_context: 0.02,
      },
      price_profile: {
        input: 0.36,
        output: 0.28,
        cache_read: 0.08,
        sensitivity: 0.24,
      },
      price_cap_tier: "mid",
      price_cap_penalty: 0.12,
      provider_bonus_cap: 0.09,
      fallback_count: 4,
    },
    wise: {
      weights: {
        reasoning: 0.31,
        context: 0.14,
        long_context: 0.17,
        instruction: 0.12,
        output_quality: 0.22,
        coding: 0.02,
        cost_efficiency: 0.02,
      },
      price_profile: {
        input: 0.22,
        output: 0.5,
        cache_read: 0.04,
        sensitivity: 0.05,
      },
      provider_bonus_cap: 0.08,
      fallback_count: 5,
    },
    dev: {
      weights: {
        coding: 0.31,
        reasoning: 0.2,
        instruction: 0.09,
        context: 0.09,
        long_context: 0.08,
        output_quality: 0.12,
        speed: 0.03,
        cost_efficiency: 0.08,
      },
      price_profile: {
        input: 0.3,
        output: 0.42,
        cache_read: 0.04,
        sensitivity: 0.12,
      },
      provider_bonus_cap: 0.11,
      fallback_count: 4,
    },
    desi: {
      weights: {
        instruction: 0.24,
        output_quality: 0.26,
        reasoning: 0.16,
        context: 0.12,
        speed: 0.08,
        cost_efficiency: 0.08,
        long_context: 0.04,
        coding: 0.02,
      },
      price_profile: {
        input: 0.28,
        output: 0.34,
        cache_read: 0.02,
        sensitivity: 0.09,
      },
      provider_bonus_cap: 0.09,
      fallback_count: 3,
    },
    doc: {
      weights: {
        instruction: 0.27,
        output_quality: 0.21,
        context: 0.16,
        long_context: 0.16,
        reasoning: 0.12,
        speed: 0.03,
        cost_efficiency: 0.03,
        coding: 0.02,
      },
      price_profile: {
        input: 0.24,
        output: 0.44,
        cache_read: 0.03,
        sensitivity: 0.11,
      },
      provider_bonus_cap: 0.1,
      fallback_count: 3,
    },
    map: {
      weights: {
        context: 0.27,
        long_context: 0.27,
        speed: 0.17,
        coding: 0.08,
        instruction: 0.07,
        reasoning: 0.04,
        output_quality: 0.03,
        cost_efficiency: 0.07,
      },
      price_profile: {
        input: 0.48,
        output: 0.1,
        cache_read: 0.26,
        sensitivity: 0.16,
      },
      provider_bonus_cap: 0.07,
      fallback_count: 3,
    },
    scout: {
      weights: {
        speed: 0.28,
        context: 0.16,
        instruction: 0.12,
        long_context: 0.11,
        cost_efficiency: 0.18,
        output_quality: 0.06,
        reasoning: 0.06,
        multimodal: 0.03,
      },
      price_profile: {
        input: 0.42,
        output: 0.12,
        cache_read: 0.26,
        sensitivity: 0.2,
      },
      price_cap_tier: "mid",
      price_cap_penalty: 0.1,
      provider_bonus_cap: 0.08,
      fallback_count: 3,
    },
    debug: {
      weights: {
        coding: 0.32,
        reasoning: 0.27,
        context: 0.12,
        long_context: 0.05,
        instruction: 0.07,
        output_quality: 0.1,
        speed: 0.03,
        cost_efficiency: 0.04,
      },
      price_profile: {
        input: 0.3,
        output: 0.42,
        cache_read: 0.04,
        sensitivity: 0.08,
      },
      provider_bonus_cap: 0.1,
      fallback_count: 4,
    },
    check: {
      weights: {
        reasoning: 0.24,
        output_quality: 0.21,
        instruction: 0.17,
        coding: 0.12,
        context: 0.12,
        long_context: 0.07,
        cost_efficiency: 0.04,
        speed: 0.03,
      },
      price_profile: {
        input: 0.26,
        output: 0.36,
        cache_read: 0.04,
        sensitivity: 0.1,
      },
      provider_bonus_cap: 0.09,
      fallback_count: 3,
    },
    vis: {
      weights: {
        multimodal: 0.46,
        output_quality: 0.18,
        reasoning: 0.12,
        instruction: 0.08,
        context: 0.06,
        speed: 0.04,
        cost_efficiency: 0.06,
      },
      price_profile: {
        input: 0.24,
        output: 0.26,
        cache_read: 0.02,
        sensitivity: 0.08,
      },
      provider_bonus_cap: 0.08,
      fallback_count: 2,
    },
    snap: {
      weights: {
        speed: 0.31,
        instruction: 0.24,
        output_quality: 0.12,
        cost_efficiency: 0.18,
        context: 0.07,
        reasoning: 0.03,
        multimodal: 0.05,
      },
      price_profile: {
        input: 0.44,
        output: 0.14,
        cache_read: 0.06,
        sensitivity: 0.18,
      },
      price_cap_tier: "mid",
      price_cap_penalty: 0.1,
      provider_bonus_cap: 0.08,
      fallback_count: 2,
    },
  },
  request_billing: {
    mic: {
      weights: {
        instruction: 0.24,
        output_quality: 0.1,
        speed: 0.27,
        reasoning: 0.04,
        context: 0.04,
        long_context: 0.01,
        cost_efficiency: 0.29,
        coding: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.18,
        premium: 0.3,
        unknown: 0.05,
      },
      price_cap_tier: "economy",
      price_cap_penalty: 0.1,
      provider_bonus_cap: 0.08,
      fallback_count: 3,
    },
    pi: {
      weights: {
        reasoning: 0.3,
        coding: 0.18,
        instruction: 0.13,
        context: 0.12,
        long_context: 0.13,
        output_quality: 0.11,
        speed: 0.02,
        cost_efficiency: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.005,
        premium: 0.018,
        unknown: 0.01,
      },
      provider_bonus_cap: 0.09,
      fallback_count: 4,
    },
    "co-pi": {
      weights: {
        reasoning: 0.27,
        instruction: 0.18,
        context: 0.18,
        output_quality: 0.16,
        coding: 0.08,
        speed: 0.07,
        long_context: 0.04,
        cost_efficiency: 0.02,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.004,
        premium: 0.015,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.08,
      fallback_count: 4,
    },
    wise: {
      weights: {
        reasoning: 0.34,
        long_context: 0.18,
        context: 0.14,
        output_quality: 0.21,
        instruction: 0.11,
        coding: 0.01,
        cost_efficiency: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.002,
        premium: 0.008,
        unknown: 0.004,
      },
      provider_bonus_cap: 0.06,
      fallback_count: 5,
    },
    dev: {
      weights: {
        coding: 0.34,
        reasoning: 0.22,
        long_context: 0.12,
        context: 0.09,
        output_quality: 0.1,
        instruction: 0.08,
        speed: 0.04,
        cost_efficiency: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.004,
        premium: 0.015,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.09,
      fallback_count: 4,
    },
    desi: {
      weights: {
        output_quality: 0.31,
        instruction: 0.27,
        reasoning: 0.16,
        context: 0.13,
        speed: 0.07,
        long_context: 0.04,
        coding: 0.01,
        cost_efficiency: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.005,
        premium: 0.015,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.07,
      fallback_count: 3,
    },
    doc: {
      weights: {
        instruction: 0.28,
        output_quality: 0.23,
        long_context: 0.19,
        context: 0.14,
        reasoning: 0.1,
        speed: 0.03,
        coding: 0.02,
        cost_efficiency: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.004,
        premium: 0.012,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.08,
      fallback_count: 3,
    },
    map: {
      weights: {
        long_context: 0.32,
        context: 0.29,
        speed: 0.15,
        coding: 0.08,
        instruction: 0.07,
        reasoning: 0.04,
        output_quality: 0.03,
        cost_efficiency: 0.02,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.003,
        premium: 0.01,
        unknown: 0.006,
      },
      provider_bonus_cap: 0.06,
      fallback_count: 3,
    },
    scout: {
      weights: {
        speed: 0.22,
        context: 0.2,
        instruction: 0.18,
        long_context: 0.14,
        output_quality: 0.12,
        reasoning: 0.1,
        multimodal: 0.02,
        cost_efficiency: 0.02,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.004,
        premium: 0.014,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.07,
      fallback_count: 3,
    },
    debug: {
      weights: {
        coding: 0.31,
        reasoning: 0.3,
        context: 0.12,
        long_context: 0.07,
        instruction: 0.06,
        output_quality: 0.08,
        speed: 0.03,
        cost_efficiency: 0.03,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.004,
        premium: 0.014,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.08,
      fallback_count: 4,
    },
    check: {
      weights: {
        reasoning: 0.28,
        output_quality: 0.23,
        instruction: 0.18,
        context: 0.11,
        coding: 0.09,
        long_context: 0.08,
        speed: 0.02,
        cost_efficiency: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.003,
        premium: 0.012,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.07,
      fallback_count: 3,
    },
    vis: {
      weights: {
        multimodal: 0.45,
        output_quality: 0.21,
        reasoning: 0.14,
        instruction: 0.08,
        context: 0.07,
        speed: 0.04,
        cost_efficiency: 0.01,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.004,
        premium: 0.012,
        unknown: 0.008,
      },
      provider_bonus_cap: 0.06,
      fallback_count: 2,
    },
    snap: {
      weights: {
        speed: 0.29,
        instruction: 0.26,
        output_quality: 0.17,
        context: 0.1,
        reasoning: 0.07,
        multimodal: 0.05,
        long_context: 0.03,
        cost_efficiency: 0.03,
      },
      request_tier_penalties: {
        economy: 0,
        mid: 0.006,
        premium: 0.02,
        unknown: 0.01,
      },
      provider_bonus_cap: 0.08,
      fallback_count: 2,
    },
  },
};

function normalizeWeights(weights = {}) {
  const sanitized = Object.fromEntries(
    Object.entries(weights).map(([dimension, weight]) => [
      dimension,
      Math.max(0, Number(weight) || 0),
    ]),
  );
  const total = Object.values(sanitized).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return sanitized;
  return Object.fromEntries(
    Object.entries(sanitized).map(([dimension, weight]) => [
      dimension,
      Number((weight / total).toFixed(6)),
    ]),
  );
}

function normalizeTierPenalties(penalties = {}) {
  return {
    economy: Math.max(0, Number(penalties.economy) || 0),
    mid: Math.max(0, Number(penalties.mid) || 0),
    premium: Math.max(0, Number(penalties.premium) || 0),
    unknown: Math.max(0, Number(penalties.unknown) || 0),
  };
}

function resolveRoleStrategy(role, billingMode) {
  const mode =
    billingMode === "request_billing" ? "request_billing" : "token_billing";
  const modeStrategies = ROLE_STRATEGIES[mode] || ROLE_STRATEGIES.token_billing;
  const strategy =
    modeStrategies[role] ||
    modeStrategies.pi ||
    ROLE_STRATEGIES.token_billing.pi;
  return {
    weights: normalizeWeights(strategy.weights || {}),
    price_profile: {
      ...DEFAULT_ROLE_PRICE_PROFILE,
      ...(strategy.price_profile || {}),
    },
    request_tier_penalties: normalizeTierPenalties(
      strategy.request_tier_penalties || DEFAULT_REQUEST_TIER_PENALTIES,
    ),
    provider_bonus_cap: Math.max(0, Number(strategy.provider_bonus_cap) || 0),
    fallback_count: Math.max(
      1,
      Number.parseInt(String(strategy.fallback_count || "3"), 10) || 3,
    ),
    price_cap_tier: strategy.price_cap_tier || null,
    price_cap_penalty: Math.max(0, Number(strategy.price_cap_penalty) || 0),
  };
}

function pricePenaltyForRole(modelId, roleStrategy, billingMode) {
  const priceHint = priceHintOf(modelId);
  const priceTier = priceHint?.tier || "unknown";

  if (billingMode !== "token_billing") {
    const tierPenalties =
      roleStrategy?.request_tier_penalties || DEFAULT_REQUEST_TIER_PENALTIES;
    const basePenalty =
      Number(tierPenalties[priceTier] ?? tierPenalties.unknown ?? 0) || 0;
    const capPenalty =
      roleStrategy?.price_cap_tier &&
      (PRICE_TIER_RANK[priceTier] || PRICE_TIER_RANK.unknown) >
        (PRICE_TIER_RANK[roleStrategy.price_cap_tier] ||
          PRICE_TIER_RANK.unknown)
        ? Math.max(0, Number(roleStrategy.price_cap_penalty) || 0)
        : 0;
    return {
      price_penalty: Number((basePenalty + capPenalty).toFixed(4)),
      price_hint: priceHint,
      price_tier: priceTier,
      price_sensitivity: 0,
      price_cap_penalty: Number(capPenalty.toFixed(4)),
      role_price_profile: {
        mode: "request_multiplier",
        tier_penalties: tierPenalties,
        preferred_cap_tier: roleStrategy?.price_cap_tier || null,
      },
      billing_penalty_mode: "request_multiplier",
    };
  }

  const rolePriceProfile =
    roleStrategy?.price_profile || DEFAULT_ROLE_PRICE_PROFILE;
  const sensitivity = rolePriceProfile.sensitivity || 0.1;
  if (!priceHint?.blended_usd_per_mtok || priceHint.blended_usd_per_mtok <= 0) {
    return {
      price_penalty: 0,
      price_hint: priceHint,
      price_tier: priceTier,
      price_sensitivity: sensitivity,
      price_cap_penalty: 0,
      role_price_profile: rolePriceProfile,
      billing_penalty_mode: "token_metered",
    };
  }

  const blendedEstimate =
    Math.max(0, priceHint.input_usd_per_mtok || 0) *
      (rolePriceProfile.input || 0) +
    Math.max(0, priceHint.output_usd_per_mtok || 0) *
      (rolePriceProfile.output || 0) +
    Math.max(0, priceHint.cache_read_usd_per_mtok || 0) *
      (rolePriceProfile.cache_read || 0);
  const effectivePrice = Math.max(
    1,
    blendedEstimate > 0 ? blendedEstimate : priceHint.blended_usd_per_mtok,
  );
  const basePenalty = Math.log10(effectivePrice) * sensitivity;
  const capPenalty =
    roleStrategy?.price_cap_tier &&
    (PRICE_TIER_RANK[priceTier] || PRICE_TIER_RANK.unknown) >
      (PRICE_TIER_RANK[roleStrategy.price_cap_tier] || PRICE_TIER_RANK.unknown)
      ? Math.max(0, Number(roleStrategy.price_cap_penalty) || 0)
      : 0;

  return {
    price_penalty: Number((basePenalty + capPenalty).toFixed(4)),
    price_hint: priceHint,
    price_tier: priceTier,
    price_sensitivity: sensitivity,
    price_cap_penalty: Number(capPenalty.toFixed(4)),
    role_price_profile: rolePriceProfile,
    billing_penalty_mode: "token_metered",
  };
}

function filterRoleCandidates(models, role) {
  const filtered = [...models];
  if (role === "vis") {
    const multimodalCandidates = filtered.filter((model) => {
      const profile = lookupBenchmarkProfile(model);
      return Number(profile?.ratings?.multimodal || 0) >= 4;
    });
    if (multimodalCandidates.length > 0) return multimodalCandidates;
  }
  return filtered;
}

function providerPreferenceScore(
  modelId,
  providerPreferences = [],
  roleStrategy = null,
) {
  const provider = providerOf(modelId);
  const family = familyOf(modelId);
  const normalized = (providerPreferences || [])
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const exactIndex = normalized.findIndex((item) => item === provider);
  const familyIndex = normalized.findIndex((item) => item === family);
  const baseExactBonus =
    exactIndex >= 0 ? Math.max(0, 0.18 - exactIndex * 0.04) : 0;
  const baseFamilyBonus =
    familyIndex >= 0 ? Math.max(0, 0.09 - familyIndex * 0.02) : 0;
  const capped = Math.max(0, Number(roleStrategy?.provider_bonus_cap) || 0);
  const raw = Math.max(baseExactBonus, baseFamilyBonus);
  if (capped > 0) return Math.min(raw, capped);
  if (raw > 0) return raw;
  return 0;
}

function scoreModelForRole(
  modelId,
  role,
  billingMode,
  providerPreferences = [],
) {
  const profile = lookupBenchmarkProfile(modelId);
  const roleStrategy = resolveRoleStrategy(role, billingMode);
  const weights = roleStrategy.weights;
  const capabilityScore = Object.entries(weights).reduce(
    (sum, [dimension, weight]) => {
      return sum + (profile.ratings?.[dimension] || 0) * weight;
    },
    0,
  );
  const providerBonus = providerPreferenceScore(
    modelId,
    providerPreferences,
    roleStrategy,
  );
  const pricing = pricePenaltyForRole(modelId, roleStrategy, billingMode);
  return {
    model: modelId,
    score: Number(
      (capabilityScore + providerBonus - pricing.price_penalty).toFixed(4),
    ),
    capability_score: Number(capabilityScore.toFixed(4)),
    provider_bonus: Number(providerBonus.toFixed(4)),
    price_penalty: pricing.price_penalty,
    price_tier: pricing.price_tier,
    price_sensitivity: pricing.price_sensitivity,
    price_cap_penalty: pricing.price_cap_penalty,
    price_hint: pricing.price_hint,
    role_price_profile: pricing.role_price_profile,
    billing_penalty_mode: pricing.billing_penalty_mode,
    applied_weights: weights,
    benchmark: profile,
  };
}

function sortModelsByRole(
  models,
  role,
  billingMode,
  exclusions = [],
  providerPreferences = [],
) {
  return [...models]
    .filter((model) => !exclusions.includes(model))
    .filter((model) => filterRoleCandidates(models, role).includes(model))
    .map((model) =>
      scoreModelForRole(model, role, billingMode, providerPreferences),
    )
    .sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));
}

function resolveModelSelector(
  selector,
  {
    models = [],
    role,
    billingMode,
    exclusions = [],
    providerPreferences = [],
  } = {},
) {
  const value = String(selector || "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  const explicitName = value.startsWith("*/") ? value.slice(2) : value;
  const isProviderScoped = value.includes("/") && !value.startsWith("*/");

  const candidates = models.filter((model) => {
    if (exclusions.includes(model)) return false;
    const normalizedModel = String(model || "")
      .trim()
      .toLowerCase();
    if (isProviderScoped) return normalizedModel === value;
    return modelNameOf(model) === explicitName;
  });

  if (candidates.length === 0) return null;
  return (
    sortModelsByRole(candidates, role, billingMode, [], providerPreferences)[0]
      ?.model || null
  );
}

function buildRoleDescriptor(
  modelId,
  role,
  billingMode,
  providerPreferences = [],
) {
  if (!modelId)
    return {
      model: null,
      default_model: null,
      provider: null,
      family: null,
      family_recommendation: null,
    };
  const scored = scoreModelForRole(
    modelId,
    role,
    billingMode,
    providerPreferences,
  );
  return {
    model: modelId,
    default_model: modelId,
    provider: providerOf(modelId),
    family: scored.benchmark.family,
    family_recommendation: scored.benchmark.family,
    rating: Number(scored.score.toFixed(2)),
    capability_score: Number(scored.capability_score.toFixed(2)),
    provider_bonus: scored.provider_bonus,
    price_penalty: scored.price_penalty,
    price_tier: scored.price_tier,
    price_hint: scored.price_hint,
    role_price_profile: scored.role_price_profile,
    benchmark_basis: scored.benchmark.benchmark_basis,
    benchmark_key: scored.benchmark.benchmark_key,
    dimensions: scored.benchmark.ratings,
    applied_weights: scored.applied_weights,
  };
}

export function recommendRoleModels({
  availableModels,
  availableModelsSource = "provided",
  availableModelsVerified = true,
  billingMode = null,
  routerConfig = {},
  configSource = null,
  discoveryAudit = null,
} = {}) {
  const effectiveBillingMode = detectBillingMode(
    billingMode,
    routerConfig?.billing_mode,
  );
  const modelPool = resolveModelPool({
    availableModels,
    availableModelsSource,
    availableModelsVerified,
    discoveryAudit,
  });
  const warnings = [];
  const warningSet = new Set();
  const unmatchedSelectorCounts = {};
  const emptyPreferredRoles = [];
  const staleSelectorCounts = {};
  const addWarning = (message) => {
    if (!message || warningSet.has(message)) return;
    warningSet.add(message);
    warnings.push(message);
  };
  for (const warning of modelPool.warnings || []) {
    addWarning(warning);
  }
  const effectiveModels = modelPool.models;

  const roles = [
    "mic",
    "pi",
    "co-pi",
    "wise",
    "dev",
    "desi",
    "doc",
    "map",
    "scout",
    "debug",
    "check",
    "vis",
    "snap",
  ];
  const picks = {};

  const roleModelPreferences = routerConfig?.role_model_preferences || {};
  const providerPreferences = routerConfig?.provider_preferences || [];
  const forceCrossModelFamilyForCopi =
    routerConfig?.force_cross_model_family_for_copi !== false;

  function resolvePrimary(role, { exclusions = [] } = {}) {
    const orderedSelectors = Array.isArray(roleModelPreferences?.[role])
      ? roleModelPreferences[role]
      : [];
    for (const selector of orderedSelectors) {
      const resolvedOverride = resolveModelSelector(selector, {
        models: effectiveModels,
        role,
        billingMode: effectiveBillingMode,
        exclusions: exclusions.filter(Boolean),
        providerPreferences,
      });
      if (resolvedOverride) return resolvedOverride;
      unmatchedSelectorCounts[role] = (unmatchedSelectorCounts[role] || 0) + 1;
      staleSelectorCounts[role] = (staleSelectorCounts[role] || 0) + 1;
    }
    return (
      sortModelsByRole(
        effectiveModels,
        role,
        effectiveBillingMode,
        exclusions.filter(Boolean),
        providerPreferences,
      )[0]?.model || null
    );
  }

  picks.mic = resolvePrimary("mic");
  picks.pi = resolvePrimary("pi");

  if (!picks["co-pi"]) {
    const piFamily = familyOf(picks.pi);
    const candidates = sortModelsByRole(
      effectiveModels,
      "co-pi",
      effectiveBillingMode,
      [],
      providerPreferences,
    );

    picks["co-pi"] =
      candidates.find((entry) => {
        if (!forceCrossModelFamilyForCopi) return true;
        return familyOf(entry.model) !== piFamily;
      })?.model ||
      candidates[0]?.model ||
      resolvePrimary("co-pi");
  }

  picks.wise = resolvePrimary("wise") || picks.pi;

  for (const role of roles) {
    if (picks[role]) continue;
    picks[role] = resolvePrimary(role) || null;
  }

  function resolveFallback(role, count = 4) {
    const preferred = Array.isArray(roleModelPreferences?.[role])
      ? roleModelPreferences[role]
      : [];
    const resolvedPreferred = [];
    for (const selector of preferred) {
      const resolved = resolveModelSelector(selector, {
        models: effectiveModels,
        role,
        billingMode: effectiveBillingMode,
        exclusions: [picks[role], ...resolvedPreferred].filter(Boolean),
        providerPreferences,
      });
      if (!resolved) continue;
      resolvedPreferred.push(resolved);
    }
    const validPreferred = [...new Set(resolvedPreferred)];
    if (preferred.length > 0 && validPreferred.length === 0) {
      emptyPreferredRoles.push(role);
    }
    if (validPreferred.length > 0) return validPreferred.slice(0, count);
    return sortModelsByRole(
      effectiveModels,
      role,
      effectiveBillingMode,
      [picks[role]],
      providerPreferences,
    )
      .slice(0, count)
      .map((entry) => entry.model);
  }

  const staleSelectorSummary = Object.entries(staleSelectorCounts)
    .filter(([, count]) => Number.isInteger(count) && count > 0)
    .map(([role, count]) => `${role}(${count})`);
  if (modelPool.verified === true && staleSelectorSummary.length > 0) {
    addWarning(
      `Stale config selectors (not in verified discovery): ${staleSelectorSummary.join(", ")}`,
    );
  }

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    recommendation_id: createId("mm"),
    billing_mode: effectiveBillingMode,
    config_source: configSource,
    config_applied: Boolean(configSource),
    warnings: finalizeWarnings({
      warnings,
      unmatchedSelectorCounts,
      emptyPreferredRoles: [...new Set(emptyPreferredRoles)],
      suppressSelectorWarnings: effectiveModels.length === 0,
    }),
    benchmark_policy:
      "dual-track role strategy scoring with token-metered cost penalty, request-multiplier tier penalty, and provider preference as capped soft ranking only",
    provider_preferences_note:
      "preferences are user intent only, not model inventory facts",
    model_pool_source: modelPool.source,
    model_pool_verified: modelPool.verified,
    model_pool_verification: modelPool.verification,
    model_discovery_audit: modelPool.audit,
    available_models: effectiveModels,
    provider_preferences: providerPreferences,
    roles: Object.fromEntries(
      Object.entries(picks).map(([role, model]) => [
        role,
        buildRoleDescriptor(
          model,
          role,
          effectiveBillingMode,
          providerPreferences,
        ),
      ]),
    ),
    fallback: Object.fromEntries(
      roles.map((role) => [
        role,
        resolveFallback(role, resolveRoleStrategy(role, effectiveBillingMode).fallback_count),
      ]),
    ),
  };
}

export function recomputeAndPersistModelMatch({
  routerConfig = {},
  configSource = null,
  availableModels,
  availableModelsSource = "provided",
  availableModelsVerified = true,
  billingMode = null,
  discoveryAudit = null,
  syncRouterConfig = false,
  syncRouterConfigPath = undefined,
  syncRouterConfigBackup = true,
} = {}) {
  const recommendation = recommendRoleModels({
    availableModels,
    availableModelsSource,
    availableModelsVerified,
    billingMode,
    routerConfig,
    configSource,
    discoveryAudit,
  });
  writeModelMatch(recommendation);
  if (syncRouterConfig) {
    const preferences = Object.fromEntries(
      Object.entries(recommendation.roles || {})
        .map(([role, descriptor]) => {
          const primary =
            descriptor?.default_model || descriptor?.model || null;
          const fallbacks = Array.isArray(recommendation?.fallback?.[role])
            ? recommendation.fallback[role]
            : [];
          const chain = [primary, ...fallbacks].filter(
            (model) => typeof model === "string" && model.trim().length > 0,
          );
          return [role, [...new Set(chain)]];
        })
        .filter(([, chain]) => Array.isArray(chain) && chain.length > 0),
    );
    try {
      writeRoleModelPreferences({
        preferences,
        billingMode: recommendation?.billing_mode || undefined,
        targetPath: syncRouterConfigPath,
        sourcePath: configSource,
        backup: syncRouterConfigBackup !== false,
      });
    } catch (error) {
      // best-effort sync; do not block
    }
  }
  return recommendation;
}

export function writeModelMatch(recommendation) {
  return writeJson(STATE_PATHS.modelMatch, recommendation);
}

export function readModelMatch() {
  return readJson(STATE_PATHS.modelMatch, null);
}

export function explainRecommendation(recommendation) {
  const pi =
    recommendation?.roles?.pi?.default_model ||
    recommendation?.roles?.pi?.model ||
    "(none)";
  const copi =
    recommendation?.roles?.["co-pi"]?.default_model ||
    recommendation?.roles?.["co-pi"]?.model ||
    "(none)";
  const wise =
    recommendation?.roles?.wise?.default_model ||
    recommendation?.roles?.wise?.model ||
    "(none)";
  const source = recommendation?.config_source
    ? `Config source: ${recommendation.config_source}`
    : "Config source: (default)";
  const warnings =
    Array.isArray(recommendation?.warnings) &&
    recommendation.warnings.length > 0
      ? `Warnings: ${recommendation.warnings.join(" | ")}`
      : "Warnings: none";
  const providerPrefs =
    Array.isArray(recommendation?.provider_preferences) &&
    recommendation.provider_preferences.length > 0
      ? recommendation.provider_preferences.join(", ")
      : "(none)";
  const auditStatus =
    recommendation?.model_discovery_audit?.status ||
    recommendation?.model_pool_verification?.status ||
    "missing";
  const auditAt = recommendation?.model_discovery_audit?.audited_at || "(none)";
  return [
    `Billing mode: ${recommendation?.billing_mode || "token_billing"}`,
    source,
    `Provider preferences: ${providerPrefs}`,
    `Verified discovery audit: status=${auditStatus} at=${auditAt}`,
    `Pi: ${pi} (family=${recommendation?.roles?.pi?.family_recommendation || "unknown"}, rating=${recommendation?.roles?.pi?.rating || "n/a"})`,
    `Co-pi: ${copi} (family=${recommendation?.roles?.["co-pi"]?.family_recommendation || "unknown"}, rating=${recommendation?.roles?.["co-pi"]?.rating || "n/a"})`,
    `Wise: ${wise} (family=${recommendation?.roles?.wise?.family_recommendation || "unknown"}, rating=${recommendation?.roles?.wise?.rating || "n/a"})`,
    `Fallback (Pi): ${(recommendation?.fallback?.pi || []).join(", ") || "(none)"}`,
    warnings,
    "Model matching uses verified discovered model IDs as facts; config/provider/billing are intent-only ranking signals.",
  ].join("\n");
}
