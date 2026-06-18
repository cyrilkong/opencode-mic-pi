import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { modelNameOf, providerOf } from "./model-benchmarks.js"

/**
 * model-evidence.js
 *
 * Loader and lookup helpers for offline-built, snapshot-bound multi-source
 * evidence catalogs (SWE-bench / LLM-IQ-style / etc.). The router runtime
 * consumes these to drive **rank** among already-eligible models, while
 * naming/token heuristics are demoted to exclusion-only signals (see
 * `src/model-match.js`).
 *
 * Public surface:
 *   - loadEvidenceCatalog({ explicitPath?, env?, discoveryAudit?, sourceWeights? })
 *   - lookupEvidenceEntry(catalog, modelId)
 *   - fuseEvidenceSources(entry, { fusionMode?, sourceWeights? })
 */

export const SCHEMA_VERSION = 2
export const NEUTRAL_EVIDENCE_RATING = 3

const DEFAULT_FILE_PREFIX = "model-evidence"
const DEFAULT_FILE_SUFFIX = ".json"
const ENV_FILE = "OPENCODE_ROUTER_EVIDENCE_JSON"
const ENV_DIR = "OPENCODE_ROUTER_EVIDENCE_DIR"
const BUNDLED_DEFAULT_DIR_NAME = "evidence"

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : ""
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function fingerprintShort(fingerprint) {
  const text = String(fingerprint || "").trim()
  if (!text) return ""
  return text.replace(/[^a-z0-9]+/gi, "").slice(0, 12)
}

function defaultsBundleDir() {
  const here = path.dirname(new URL(import.meta.url).pathname)
  return path.resolve(here, "..", "defaults", BUNDLED_DEFAULT_DIR_NAME)
}

function expandHome(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.startsWith("~")) {
    return targetPath
  }
  return path.resolve(os.homedir(), targetPath.slice(1).replace(/^[\/]+/, ""))
}

function resolveCandidatePath(value) {
  const trimmed = nonEmptyString(value)
  if (!trimmed) return null
  return path.resolve(expandHome(trimmed))
}

function listCatalogCandidatesInDir(dirPath) {
  if (!dirPath) return []
  try {
    if (!fs.existsSync(dirPath)) return []
    const entries = fs.readdirSync(dirPath)
    return entries
      .filter((name) => typeof name === "string" && name.toLowerCase().endsWith(DEFAULT_FILE_SUFFIX))
      .filter((name) => name.toLowerCase().startsWith(DEFAULT_FILE_PREFIX))
      .map((name) => path.resolve(dirPath, name))
  } catch (error) {
    return []
  }
}

function expandGlobLike(pattern) {
  const trimmed = nonEmptyString(pattern)
  if (!trimmed) return []
  const expanded = expandHome(trimmed)
  // Minimal glob support: only handles `<dir>/*.json` style and exact paths.
  if (expanded.includes("*")) {
    const dir = path.dirname(expanded)
    const filePattern = path.basename(expanded)
    if (!fs.existsSync(dir)) return []
    try {
      const entries = fs.readdirSync(dir)
      const regex = new RegExp(
        "^" + filePattern.replace(/[.+^${}()|\[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
      )
      return entries
        .filter((name) => regex.test(name))
        .map((name) => path.resolve(dir, name))
    } catch (error) {
      return []
    }
  }
  return [path.resolve(expanded)]
}

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8")
    return { value: JSON.parse(raw), error: null }
  } catch (error) {
    return { value: null, error }
  }
}

function normalizeSources(sources = []) {
  if (!Array.isArray(sources)) return []
  return sources
    .filter(isPlainObject)
    .map((entry) => ({
      id: nonEmptyString(entry.id),
      url: nonEmptyString(entry.url),
      retrieved_at: nonEmptyString(entry.retrieved_at),
      license_note: nonEmptyString(entry.license_note),
    }))
    .filter((entry) => entry.id)
}

function normalizeFusion(fusion, sources = []) {
  const mode =
    isPlainObject(fusion) && nonEmptyString(fusion.mode) ? nonEmptyString(fusion.mode) : "weighted_mean"
  const rawWeights = isPlainObject(fusion?.weights) ? fusion.weights : {}
  const weights = {}
  for (const source of sources) {
    const value = Number(rawWeights?.[source.id])
    weights[source.id] = Number.isFinite(value) && value > 0 ? value : 1
  }
  return { mode, weights }
}

function normalizeSourceScore(value) {
  if (!isPlainObject(value)) return null
  const result = {}
  for (const key of [
    "coding_score",
    "agentic_score",
    "reasoning_score",
    "quality_score",
    "confidence",
  ]) {
    const num = Number(value?.[key])
    if (Number.isFinite(num)) result[key] = num
  }
  return Object.keys(result).length > 0 ? result : null
}

function normalizeFusedRow(value) {
  if (!isPlainObject(value)) return null
  const result = {}
  for (const key of ["coding_evidence", "agentic_evidence", "reasoning_evidence", "confidence"]) {
    const num = Number(value?.[key])
    if (Number.isFinite(num)) result[key] = num
  }
  return Object.keys(result).length > 0 ? result : null
}

function normalizeAliases(aliases) {
  if (!Array.isArray(aliases)) return []
  return [
    ...new Set(
      aliases
        .map((entry) => String(entry || "").trim())
        .filter((entry) => entry.length > 0),
    ),
  ]
}

function normalizeModelEntry(modelId, entry) {
  if (!isPlainObject(entry)) return null
  const bySourceRaw = isPlainObject(entry.by_source) ? entry.by_source : {}
  const by_source = {}
  for (const [sourceId, value] of Object.entries(bySourceRaw)) {
    const normalized = normalizeSourceScore(value)
    if (normalized) by_source[String(sourceId)] = normalized
  }
  return {
    model: String(modelId || "").trim(),
    aliases: normalizeAliases(entry.aliases),
    by_source,
    fused: normalizeFusedRow(entry.fused),
    notes: typeof entry.notes === "string" ? entry.notes.trim() : null,
  }
}

function normalizeCatalog(raw, { sourcePath } = {}) {
  if (!isPlainObject(raw)) {
    return {
      schema_version: null,
      pool_fingerprint: null,
      pool_verified_at: null,
      model_count: null,
      sources: [],
      fusion: { mode: "weighted_mean", weights: {} },
      models: {},
      aliases: {},
      source_path: sourcePath || null,
      source_basename: sourcePath ? path.basename(sourcePath) : null,
    }
  }

  const sources = normalizeSources(raw.sources || [])
  const fusion = normalizeFusion(raw.fusion || {}, sources)
  const modelsRaw = isPlainObject(raw.models) ? raw.models : {}
  const models = {}
  const aliases = {}
  for (const [modelId, value] of Object.entries(modelsRaw)) {
    const normalized = normalizeModelEntry(modelId, value)
    if (!normalized) continue
    const canonical = normalized.model
    if (!canonical) continue
    models[canonical] = normalized
    for (const alias of normalized.aliases) {
      aliases[alias] = canonical
    }
  }

  return {
    schema_version: Number(raw.schema_version) || null,
    pool_fingerprint: nonEmptyString(raw.pool_fingerprint) || null,
    pool_verified_at: nonEmptyString(raw.pool_verified_at) || null,
    model_count: Number.isFinite(raw.model_count) ? Number(raw.model_count) : null,
    sources,
    fusion,
    models,
    aliases,
    source_path: sourcePath || null,
    source_basename: sourcePath ? path.basename(sourcePath) : null,
  }
}

function chooseFromCandidates({ candidates, discoveryAudit }) {
  const seen = new Set()
  const ordered = candidates
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => {
      if (seen.has(candidate)) return false
      seen.add(candidate)
      return fs.existsSync(candidate)
    })

  const fingerprintShortValue = fingerprintShort(discoveryAudit?.fingerprint)
  if (fingerprintShortValue) {
    const matchByName = ordered.find((candidate) =>
      path.basename(candidate).toLowerCase().includes(fingerprintShortValue.toLowerCase()),
    )
    if (matchByName) return matchByName
  }
  return ordered[0] || null
}

function buildFingerprintBindingResult(catalog, discoveryAudit) {
  const auditFingerprint = nonEmptyString(discoveryAudit?.fingerprint)
  const catalogFingerprint = nonEmptyString(catalog?.pool_fingerprint)
  if (!catalogFingerprint && !auditFingerprint) {
    return { match: false, reason: "no_audit_or_catalog_fingerprint" }
  }
  if (!catalogFingerprint) {
    return { match: false, reason: "catalog_fingerprint_missing" }
  }
  if (!auditFingerprint) {
    return { match: false, reason: "audit_fingerprint_missing" }
  }
  return {
    match: catalogFingerprint === auditFingerprint,
    reason: catalogFingerprint === auditFingerprint ? "match" : "fingerprint_mismatch",
    catalog_fingerprint: catalogFingerprint,
    audit_fingerprint: auditFingerprint,
  }
}

/**
 * Resolve and load the evidence catalog according to the documented precedence:
 *   1. routerConfig.evidence_catalog_path
 *   2. routerConfig.evidence_catalog_glob
 *   3. OPENCODE_ROUTER_EVIDENCE_JSON
 *   4. OPENCODE_ROUTER_EVIDENCE_DIR (scan for `model-evidence*.json`)
 *   5. bundled `defaults/evidence/model-evidence*.json`
 *
 * The bundle is then cross-checked against `discoveryAudit.fingerprint`. On
 * mismatch the loader returns warnings and an empty catalog payload so callers
 * can apply neutral evidence (no penalty, no token-name fallback).
 */
export function loadEvidenceCatalog({
  routerConfig = {},
  env = process.env,
  discoveryAudit = null,
  explicitPath = null,
} = {}) {
  const warnings = []
  const errors = []

  const explicit = resolveCandidatePath(explicitPath || routerConfig?.evidence_catalog_path)
  const globPattern = nonEmptyString(routerConfig?.evidence_catalog_glob)
  const envFile = resolveCandidatePath(env?.[ENV_FILE])
  const envDir = resolveCandidatePath(env?.[ENV_DIR])
  const bundledDir = defaultsBundleDir()

  const candidates = []
  if (explicit) candidates.push(explicit)
  if (globPattern) candidates.push(...expandGlobLike(globPattern))
  if (envFile) candidates.push(envFile)
  if (envDir) candidates.push(...listCatalogCandidatesInDir(envDir))
  candidates.push(...listCatalogCandidatesInDir(bundledDir))

  if (candidates.length === 0) {
    return {
      found: false,
      source: null,
      catalog: normalizeCatalog(null, { sourcePath: null }),
      binding: { match: false, reason: "no_evidence_catalog_configured" },
      warnings,
      errors,
    }
  }

  const sourcePath = chooseFromCandidates({ candidates, discoveryAudit })
  if (!sourcePath) {
    return {
      found: false,
      source: null,
      catalog: normalizeCatalog(null, { sourcePath: null }),
      binding: { match: false, reason: "no_existing_evidence_files" },
      warnings,
      errors,
    }
  }

  const { value, error } = readJsonSafe(sourcePath)
  if (error) {
    errors.push(`failed to read evidence catalog ${path.basename(sourcePath)}: ${error.message}`)
    return {
      found: true,
      source: sourcePath,
      catalog: normalizeCatalog(null, { sourcePath }),
      binding: { match: false, reason: "catalog_read_error" },
      warnings,
      errors,
    }
  }

  const catalog = normalizeCatalog(value, { sourcePath })
  const binding = buildFingerprintBindingResult(catalog, discoveryAudit)

  if (!binding.match) {
    warnings.push(
      `evidence catalog ${path.basename(sourcePath)} fingerprint mismatch (${binding.reason}); applying neutral evidence so naming-token signals do NOT drive rank`,
    )
  }

  return {
    found: true,
    source: sourcePath,
    catalog,
    binding,
    warnings,
    errors,
  }
}

function normalizeIdLowercase(value) {
  return String(value || "").trim().toLowerCase()
}

/**
 * Look up an evidence entry for a model id with the documented matching order:
 *   1. exact id match
 *   2. case-insensitive provider/model
 *   3. alias map
 *   4. lowercase model-name only fallback (no fuzzy regex)
 */
export function lookupEvidenceEntry(catalog, modelId) {
  if (!isPlainObject(catalog) || !isPlainObject(catalog.models)) return null
  const direct = catalog.models[modelId]
  if (direct) return direct

  const lowerId = normalizeIdLowercase(modelId)
  for (const [canonical, entry] of Object.entries(catalog.models)) {
    if (normalizeIdLowercase(canonical) === lowerId) return entry
  }

  const aliasHit = catalog.aliases?.[modelId]
  if (aliasHit && catalog.models[aliasHit]) return catalog.models[aliasHit]

  for (const [aliasKey, canonical] of Object.entries(catalog.aliases || {})) {
    if (normalizeIdLowercase(aliasKey) === lowerId) {
      const target = catalog.models[canonical]
      if (target) return target
    }
  }

  // provider/model + name-only fallback
  const provider = providerOf(modelId)
  const name = modelNameOf(modelId)
  if (provider && name) {
    const composite = `${provider}/${name}`.toLowerCase()
    for (const [canonical, entry] of Object.entries(catalog.models)) {
      if (canonical.toLowerCase() === composite) return entry
    }
  }
  if (name) {
    for (const [canonical, entry] of Object.entries(catalog.models)) {
      if (canonical.toLowerCase().endsWith(`/${name.toLowerCase()}`)) return entry
    }
  }

  return null
}

function applySourceWeightOverrides(baseWeights = {}, overrides = {}) {
  if (!isPlainObject(overrides) || Object.keys(overrides).length === 0) {
    return { ...baseWeights }
  }
  const merged = { ...baseWeights }
  for (const [sourceId, weight] of Object.entries(overrides)) {
    const numeric = Number(weight)
    if (Number.isFinite(numeric) && numeric >= 0) {
      merged[sourceId] = numeric
    }
  }
  return merged
}

/**
 * Fuse per-source numeric scores into rank-relevant evidence dimensions.
 * Returns:
 *   {
 *     coding_evidence,        // 1..5 rating-equivalent
 *     agentic_evidence,
 *     reasoning_evidence,
 *     confidence,
 *     by_source,              // raw normalized per-source scores
 *     fusion_mode,            // "weighted_mean" | "max_normalized_percentile"
 *     applied_weights,
 *     coverage,               // number of sources that contributed
 *   }
 */
export function fuseEvidenceSources(entry, { fusionMode = "weighted_mean", sourceWeights = {}, baseWeights = {} } = {}) {
  if (!isPlainObject(entry)) return null
  const fusionWeights = applySourceWeightOverrides(baseWeights, sourceWeights)

  if (entry.fused && (Number.isFinite(entry.fused.coding_evidence) || Number.isFinite(entry.fused.agentic_evidence))) {
    return {
      coding_evidence: Number.isFinite(entry.fused.coding_evidence)
        ? Number(entry.fused.coding_evidence)
        : NEUTRAL_EVIDENCE_RATING,
      agentic_evidence: Number.isFinite(entry.fused.agentic_evidence)
        ? Number(entry.fused.agentic_evidence)
        : NEUTRAL_EVIDENCE_RATING,
      reasoning_evidence: Number.isFinite(entry.fused.reasoning_evidence)
        ? Number(entry.fused.reasoning_evidence)
        : null,
      confidence: Number.isFinite(entry.fused.confidence) ? Number(entry.fused.confidence) : null,
      by_source: { ...(entry.by_source || {}) },
      fusion_mode: "precomputed",
      applied_weights: fusionWeights,
      coverage: Object.keys(entry.by_source || {}).length,
    }
  }

  const bySource = isPlainObject(entry.by_source) ? entry.by_source : {}
  const sourceIds = Object.keys(bySource)
  if (sourceIds.length === 0) return null

  const weighted = (key) => {
    let weightSum = 0
    let valueSum = 0
    let max = -Infinity
    for (const sourceId of sourceIds) {
      const row = bySource[sourceId] || {}
      const score = Number(row[key])
      if (!Number.isFinite(score)) continue
      const weight = Number.isFinite(fusionWeights[sourceId]) ? Math.max(0, fusionWeights[sourceId]) : 1
      const confidence = Number.isFinite(row.confidence) ? Math.max(0, Math.min(1, Number(row.confidence))) : 1
      const effectiveWeight = weight * confidence
      if (effectiveWeight <= 0) continue
      weightSum += effectiveWeight
      valueSum += effectiveWeight * score
      if (score > max) max = score
    }
    if (fusionMode === "max_normalized_percentile") {
      return Number.isFinite(max) ? max : null
    }
    if (weightSum <= 0) return null
    return valueSum / weightSum
  }

  const confidenceAvg = (() => {
    const confidences = sourceIds
      .map((id) => Number(bySource[id]?.confidence))
      .filter((value) => Number.isFinite(value))
    if (confidences.length === 0) return null
    return confidences.reduce((sum, value) => sum + value, 0) / confidences.length
  })()

  return {
    coding_evidence: weighted("coding_score") ?? NEUTRAL_EVIDENCE_RATING,
    agentic_evidence: weighted("agentic_score") ?? NEUTRAL_EVIDENCE_RATING,
    reasoning_evidence: weighted("reasoning_score"),
    confidence: confidenceAvg,
    by_source: { ...bySource },
    fusion_mode: fusionMode,
    applied_weights: fusionWeights,
    coverage: sourceIds.length,
  }
}

export function neutralEvidence() {
  return {
    coding_evidence: NEUTRAL_EVIDENCE_RATING,
    agentic_evidence: NEUTRAL_EVIDENCE_RATING,
    reasoning_evidence: null,
    confidence: null,
    by_source: {},
    fusion_mode: "neutral",
    applied_weights: {},
    coverage: 0,
  }
}

export function describeBindingForTelemetry(binding) {
  if (!isPlainObject(binding)) return { match: false, reason: "missing" }
  return {
    match: binding.match === true,
    reason: binding.reason || (binding.match ? "match" : "unknown"),
    catalog_fingerprint: binding.catalog_fingerprint || null,
    audit_fingerprint: binding.audit_fingerprint || null,
  }
}
