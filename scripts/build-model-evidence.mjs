#!/usr/bin/env node
/**
 * scripts/build-model-evidence.mjs
 *
 * Multi-source evidence bundle builder for opencode-router. Ingests one or
 * more public tables (SWE-bench / SWE-variants, LLM-IQ-style rankings,
 * other agentic harnesses) declared in `evidence-sources.yaml` (or
 * `--source-spec <path>`), normalizes per-source rows to OpenCode model ids,
 * fuses them with weighted-mean (or per-source-confidence) reduction, and
 * writes a snapshot-bound artifact named `model-evidence.<shortFingerprint>.json`.
 *
 * Network is **not** required: when an entry's `kind` is `local-json` /
 * `local-yaml` / `inline`, the script reads from disk only. Use `kind: url`
 * to opt into a deliberate fetch from a URL during a maintainer-driven build.
 *
 * Pool binding:
 *   - `--pool-fingerprint <fingerprint>` (required when audit JSON is not present)
 *   - or `--audit-path <path/to/model-discovery-audit.json>` to read fingerprint
 *
 * Usage:
 *   node scripts/build-model-evidence.mjs \
 *     --source-spec ./evidence-sources.yaml \
 *     --audit-path ~/.local/share/opencode/plugins/opencode-router/global/model-discovery-audit.json \
 *     --out defaults/evidence
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { SCHEMA_VERSION as EVIDENCE_SCHEMA_VERSION } from "../src/model-evidence.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=")
      if (eqIdx !== -1) {
        args[token.slice(2, eqIdx)] = token.slice(eqIdx + 1)
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        args[token.slice(2)] = argv[++i]
      } else {
        args[token.slice(2)] = true
      }
    } else {
      args._.push(token)
    }
  }
  return args
}

/**
 * Minimal YAML reader sufficient for the documented evidence-sources.yaml
 * shape (no anchors / merge keys, no flow style, no multi-line scalars).
 * Strategy: convert lines into (indent, kind, text) tokens and recursively
 * build structures. Two kinds:
 *   - `mapping`  : `key: value` or `key:`
 *   - `sequence` : `- value` or `- key: value`
 */
function parseSimpleYaml(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, ""))
    .map((line) => line.replace(/[ \t]+$/g, ""))

  const tokens = []
  for (const raw of lines) {
    if (!raw.trim()) continue
    const indent = raw.match(/^\s*/)?.[0].length || 0
    const body = raw.slice(indent)
    if (body.startsWith("- ") || body === "-") {
      const rest = body.slice(1).trim()
      tokens.push({ indent, kind: "seq", body: rest })
    } else {
      tokens.push({ indent, kind: "map", body })
    }
  }

  let cursor = 0

  function peek() {
    return cursor < tokens.length ? tokens[cursor] : null
  }

  function parseMapping(parentIndent) {
    const result = {}
    while (cursor < tokens.length) {
      const token = tokens[cursor]
      if (token.indent < parentIndent) break
      if (token.indent > parentIndent) break
      if (token.kind !== "map") break
      const idx = token.body.indexOf(":")
      if (idx === -1) {
        cursor += 1
        continue
      }
      const key = token.body.slice(0, idx).trim()
      const value = token.body.slice(idx + 1).trim()
      cursor += 1
      if (value === "") {
        const next = peek()
        if (next && next.indent > parentIndent) {
          if (next.kind === "seq") {
            result[key] = parseSequence(next.indent)
          } else {
            result[key] = parseMapping(next.indent)
          }
        } else {
          result[key] = null
        }
      } else {
        result[key] = coerceScalar(value)
      }
    }
    return result
  }

  function parseSequence(parentIndent) {
    const result = []
    while (cursor < tokens.length) {
      const token = tokens[cursor]
      if (token.indent < parentIndent) break
      if (token.indent > parentIndent) break
      if (token.kind !== "seq") break
      cursor += 1
      const inlineBody = token.body
      if (!inlineBody) {
        // Next deeper line may be a mapping/sequence describing this item.
        const next = peek()
        if (next && next.indent > parentIndent) {
          if (next.kind === "seq") {
            result.push(parseSequence(next.indent))
          } else {
            result.push(parseMapping(next.indent))
          }
        } else {
          result.push(null)
        }
        continue
      }
      // Inline form: `- key: value` or `- scalar`
      const idx = inlineBody.indexOf(":")
      if (idx === -1) {
        result.push(coerceScalar(inlineBody))
        continue
      }
      const inlineKey = inlineBody.slice(0, idx).trim()
      const inlineVal = inlineBody.slice(idx + 1).trim()
      const item = {}
      // Treat the inline `key: value` as the first key of a synthetic
      // mapping at indent = parentIndent + 2 (the column after "- ").
      const childIndent = parentIndent + 2
      if (inlineVal === "") {
        const next = peek()
        if (next && next.indent > parentIndent) {
          if (next.kind === "seq") {
            item[inlineKey] = parseSequence(next.indent)
          } else {
            item[inlineKey] = parseMapping(next.indent)
          }
        } else {
          item[inlineKey] = null
        }
      } else {
        item[inlineKey] = coerceScalar(inlineVal)
      }
      // Continue absorbing additional sibling map keys that belong to this list item.
      while (cursor < tokens.length) {
        const continuation = tokens[cursor]
        if (continuation.indent <= parentIndent) break
        if (continuation.kind !== "map") break
        if (continuation.indent !== childIndent) break
        const subIdx = continuation.body.indexOf(":")
        if (subIdx === -1) {
          cursor += 1
          continue
        }
        const subKey = continuation.body.slice(0, subIdx).trim()
        const subVal = continuation.body.slice(subIdx + 1).trim()
        cursor += 1
        if (subVal === "") {
          const subNext = peek()
          if (subNext && subNext.indent > childIndent) {
            if (subNext.kind === "seq") {
              item[subKey] = parseSequence(subNext.indent)
            } else {
              item[subKey] = parseMapping(subNext.indent)
            }
          } else {
            item[subKey] = null
          }
        } else {
          item[subKey] = coerceScalar(subVal)
        }
      }
      result.push(item)
    }
    return result
  }

  const first = peek()
  if (!first) return {}
  if (first.kind === "seq") return parseSequence(first.indent)
  return parseMapping(first.indent)
}

function coerceScalar(value) {
  if (value === "true" || value === "false") return value === "true"
  if (value === "null") return null
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function readPoolFingerprint(args) {
  const fromArg = nonEmptyString(args["pool-fingerprint"])
  if (fromArg) return fromArg
  const auditPath = nonEmptyString(args["audit-path"])
  if (!auditPath) {
    throw new Error(
      "pool fingerprint required: pass --pool-fingerprint <hash> or --audit-path <model-discovery-audit.json>",
    )
  }
  const resolved = path.resolve(auditPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`audit file not found: ${resolved}`)
  }
  try {
    const audit = JSON.parse(fs.readFileSync(resolved, "utf8"))
    const fingerprint = nonEmptyString(audit?.fingerprint)
    if (!fingerprint) throw new Error("audit file is missing fingerprint")
    return fingerprint
  } catch (error) {
    throw new Error(`failed to read audit fingerprint: ${error.message}`)
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : ""
}

function fingerprintShort(fingerprint) {
  return String(fingerprint || "").replace(/[^a-z0-9]+/gi, "").slice(0, 12) || "unknown"
}

function loadSourceSpec(specPath) {
  if (!specPath) {
    return {
      schema_version: EVIDENCE_SCHEMA_VERSION,
      sources: [],
      fusion: { mode: "weighted_mean", weights: {} },
      models: {},
    }
  }
  const resolved = path.resolve(specPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`source spec not found: ${resolved}`)
  }
  const text = fs.readFileSync(resolved, "utf8")
  if (resolved.endsWith(".json")) {
    return JSON.parse(text)
  }
  return parseSimpleYaml(text)
}

function defaultModelKey(row, idMapping = {}) {
  if (!row || typeof row !== "object") return null
  const explicit = nonEmptyString(row.opencode_model_id) || nonEmptyString(row.model_id)
  if (explicit) return explicit
  const provider = nonEmptyString(row.provider)
  const name = nonEmptyString(row.model)
  if (provider && name) return `${provider}/${name}`
  if (idMapping[name]) return idMapping[name]
  return null
}

function normalizeRowScores(row) {
  const result = {}
  for (const key of ["coding_score", "agentic_score", "reasoning_score", "quality_score", "confidence"]) {
    const value = Number(row?.[key])
    if (Number.isFinite(value)) result[key] = value
  }
  return Object.keys(result).length > 0 ? result : null
}

function normalizePercentTo5(value) {
  // SWE / IQ rankings often come as percentages (0..100). Map to 1..5 rating
  // scale used elsewhere in the router. Pass-through values that already look
  // like ratings (<= 5).
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric <= 5 && numeric >= 0) return numeric
  if (numeric <= 100) return Math.max(1, Math.min(5, 1 + (numeric / 100) * 4))
  return null
}

function ingestSourceRows({ sourceId, rows = [], idMapping = {}, scoreScale = "auto" }) {
  const ingested = {}
  for (const row of rows) {
    const modelId = defaultModelKey(row, idMapping)
    if (!modelId) continue
    const raw = normalizeRowScores(row)
    if (!raw) continue
    if (scoreScale === "percent") {
      if ("coding_score" in raw) raw.coding_score = normalizePercentTo5(raw.coding_score)
      if ("agentic_score" in raw) raw.agentic_score = normalizePercentTo5(raw.agentic_score)
      if ("reasoning_score" in raw) raw.reasoning_score = normalizePercentTo5(raw.reasoning_score)
    }
    ingested[modelId] = ingested[modelId] || { by_source: {}, aliases: [] }
    ingested[modelId].by_source[sourceId] = raw
  }
  return ingested
}

async function loadRowsForSource(source, baseDir = process.cwd()) {
  const kind = nonEmptyString(source?.kind) || "local-json"
  if (kind === "inline") {
    return Array.isArray(source?.rows) ? source.rows : []
  }
  if (kind === "local-json") {
    const filePath = path.resolve(baseDir, nonEmptyString(source?.path) || "")
    if (!fs.existsSync(filePath)) {
      throw new Error(`local-json source not found: ${filePath}`)
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"))
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : []
  }
  if (kind === "local-yaml") {
    const filePath = path.resolve(baseDir, nonEmptyString(source?.path) || "")
    if (!fs.existsSync(filePath)) {
      throw new Error(`local-yaml source not found: ${filePath}`)
    }
    const parsed = parseSimpleYaml(fs.readFileSync(filePath, "utf8"))
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : []
  }
  if (kind === "url") {
    const url = nonEmptyString(source?.url)
    if (!url) throw new Error("url source requires `url` property")
    const response = await fetch(url, { redirect: "follow" })
    if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText} ${url}`)
    const body = await response.text()
    try {
      const parsed = JSON.parse(body)
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : []
    } catch (error) {
      // Treat as YAML / TSV fallback when response is not JSON.
      try {
        const yaml = parseSimpleYaml(body)
        return Array.isArray(yaml) ? yaml : Array.isArray(yaml?.rows) ? yaml.rows : []
      } catch {
        throw new Error(`unsupported url body for ${url}; only JSON / YAML supported`)
      }
    }
  }
  throw new Error(`unknown source kind: ${kind}`)
}

function fusedRowFromBySource({ bySource = {}, weights = {} }) {
  const acc = (key) => {
    let weightSum = 0
    let valueSum = 0
    for (const [sourceId, row] of Object.entries(bySource)) {
      const score = Number(row?.[key])
      if (!Number.isFinite(score)) continue
      const baseWeight = Number.isFinite(weights[sourceId]) ? Math.max(0, weights[sourceId]) : 1
      const confidence = Number.isFinite(row.confidence) ? Math.max(0, Math.min(1, Number(row.confidence))) : 1
      const effective = baseWeight * confidence
      if (effective <= 0) continue
      weightSum += effective
      valueSum += effective * score
    }
    if (weightSum <= 0) return null
    return Number((valueSum / weightSum).toFixed(4))
  }

  const confidences = Object.values(bySource)
    .map((row) => Number(row?.confidence))
    .filter((value) => Number.isFinite(value))
  const confidence = confidences.length > 0
    ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(4))
    : null

  return {
    coding_evidence: acc("coding_score"),
    agentic_evidence: acc("agentic_score"),
    reasoning_evidence: acc("reasoning_score"),
    confidence,
  }
}

async function buildBundle({ args }) {
  const specPath = nonEmptyString(args["source-spec"])
  const spec = loadSourceSpec(specPath)
  const baseDir = specPath ? path.dirname(path.resolve(specPath)) : REPO_ROOT
  const fingerprint = readPoolFingerprint(args)
  const sources = Array.isArray(spec.sources) ? spec.sources : []
  const fusionWeights = (spec.fusion && spec.fusion.weights) || {}

  const aggregated = {}
  const sourceManifest = []
  for (const source of sources) {
    const id = nonEmptyString(source.id)
    if (!id) continue
    const rows = await loadRowsForSource(source, baseDir)
    const idMapping = (source.id_mapping && typeof source.id_mapping === "object") ? source.id_mapping : {}
    const ingested = ingestSourceRows({ sourceId: id, rows, idMapping, scoreScale: source.score_scale })
    for (const [modelId, payload] of Object.entries(ingested)) {
      aggregated[modelId] = aggregated[modelId] || { by_source: {}, aliases: [] }
      Object.assign(aggregated[modelId].by_source, payload.by_source)
    }
    sourceManifest.push({
      id,
      url: nonEmptyString(source.url) || null,
      retrieved_at: nonEmptyString(source.retrieved_at) || new Date().toISOString(),
      license_note: nonEmptyString(source.license_note) || null,
      kind: nonEmptyString(source.kind) || "local-json",
      row_count: rows?.length || 0,
    })
  }

  const models = {}
  for (const [modelId, payload] of Object.entries(aggregated)) {
    const fused = fusedRowFromBySource({ bySource: payload.by_source, weights: fusionWeights })
    models[modelId] = {
      by_source: payload.by_source,
      fused,
      aliases: payload.aliases || [],
    }
  }

  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    pool_fingerprint: fingerprint,
    pool_verified_at: nonEmptyString(args["pool-verified-at"]) || new Date().toISOString(),
    model_count: Object.keys(models).length,
    sources: sourceManifest,
    fusion: {
      mode: nonEmptyString(spec?.fusion?.mode) || "weighted_mean",
      weights: fusionWeights,
    },
    models,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) {
    process.stdout.write(
      "Usage: build-model-evidence.mjs --source-spec ./evidence-sources.yaml \\\n" +
        "  --audit-path <model-discovery-audit.json> [--pool-fingerprint <hash>] \\\n" +
        "  [--out defaults/evidence] [--pool-verified-at <iso>]\n",
    )
    return
  }
  const outDir = path.resolve(REPO_ROOT, nonEmptyString(args.out) || "defaults/evidence")
  fs.mkdirSync(outDir, { recursive: true })
  const bundle = await buildBundle({ args })
  const fingerprint = bundle.pool_fingerprint
  const filename = `model-evidence.${fingerprintShort(fingerprint)}.json`
  const target = path.resolve(outDir, filename)
  fs.writeFileSync(target, `${JSON.stringify(bundle, null, 2)}\n`, "utf8")
  process.stdout.write(`wrote ${target} (${bundle.model_count} models, ${bundle.sources.length} sources)\n`)
}

main().catch((error) => {
  process.stderr.write(`build-model-evidence: ${error.message}\n`)
  process.exit(1)
})
