import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")
const DEFAULT_ALLOWLIST = path.join(REPO_ROOT, "defaults", "research-authority-allowlist.json")

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^metadata\.google\.internal$/i,
]

function normalizeHost(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
}

export function hostLooksPrivate(hostname) {
  const h = normalizeHost(hostname)
  if (!h) return true
  return PRIVATE_HOST_PATTERNS.some((rx) => rx.test(h))
}

export function loadAuthorityAllowlist(explicitPath = null) {
  const resolved = explicitPath && fs.existsSync(explicitPath) ? explicitPath : DEFAULT_ALLOWLIST
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, "utf8"))
    const tiers = raw?.tiers && typeof raw.tiers === "object" ? raw.tiers : {}
    const flat = []
    for (const [tier, entries] of Object.entries(tiers)) {
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        const suffix = String(entry?.host_suffix || "")
          .trim()
          .toLowerCase()
        if (!suffix) continue
        flat.push({ tier, suffix })
      }
    }
    return { path: resolved, entries: flat, error: null }
  } catch (error) {
    return { path: resolved, entries: [], error: String(error?.message || error) }
  }
}

export function classifyCitationUrl(urlString, allowlistEntries) {
  let url
  try {
    url = new URL(String(urlString || "").trim())
  } catch {
    return { ok: false, tier: null, reason: "invalid_url" }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, tier: null, reason: "bad_scheme" }
  }
  const host = normalizeHost(url.hostname)
  if (hostLooksPrivate(host)) {
    return { ok: false, tier: null, reason: "private_host" }
  }
  for (const { tier, suffix } of allowlistEntries) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { ok: true, tier, reason: null }
    }
  }
  return { ok: false, tier: null, reason: "not_allowlisted" }
}

export function countAuthorityCitations(citations, allowlistEntries) {
  let t1 = 0
  let t2 = 0
  let t3 = 0
  const valid = []
  if (!Array.isArray(citations)) return { t1, t2, t3, valid }
  for (const c of citations) {
    const u = typeof c === "string" ? c : c?.url
    const cls = classifyCitationUrl(u, allowlistEntries)
    if (!cls.ok) continue
    valid.push(String(u).trim())
    if (cls.tier === "T1") t1 += 1
    else if (cls.tier === "T2") t2 += 1
    else if (cls.tier === "T3") t3 += 1
  }
  return { t1, t2, t3, valid, t12: t1 + t2 }
}

export function validateResearchCitations(citations, allowlistEntries, { strict = true, minT12 = 1 } = {}) {
  const { t12, valid } = countAuthorityCitations(citations, allowlistEntries)
  if (t12 < minT12) {
    return {
      ok: !strict,
      valid,
      reason: strict ? "insufficient_authority_citations" : "warn_low_citations",
      t12,
     }
  }
  return { ok: true, valid, reason: null, t12 }
}

