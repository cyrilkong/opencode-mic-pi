const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function importFresh(specifier) {
  // Force a cache-busting query so changes to env vars (catalog precedence)
  // take effect when re-importing in the same process.
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const fixturePath = path.resolve(repoRoot, "fixtures", "evidence", "model-evidence.fixture-pool.json")
  assert(fs.existsSync(fixturePath), `expected fixture catalog at ${fixturePath}`)

  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-evidence-"))
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir

  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const evidenceUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-evidence.js")).href
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href

  const { recommendRoleModels } = await importFresh(modelMatchUrl)
  const evidenceModule = await importFresh(evidenceUrl)
  const { loadEvidenceCatalog, lookupEvidenceEntry, fuseEvidenceSources } = evidenceModule

  // 1) Loader resolves explicit catalog path and matches the discovery audit fingerprint.
  const loaded = loadEvidenceCatalog({
    routerConfig: { evidence_catalog_path: fixturePath },
    discoveryAudit: { fingerprint: "fixture-pool-fingerprint" },
  })
  assert(loaded.found === true, "expected loadEvidenceCatalog to find the fixture catalog")
  assert(loaded.binding.match === true, `expected fingerprint match, got ${loaded.binding.reason}`)
  assert(loaded.warnings.length === 0, `expected no warnings on fingerprint match, got: ${loaded.warnings.join("; ")}`)
  process.stdout.write("PASS: evidence catalog loader matches fingerprint and emits no warnings\n")

  const dependableEntry = lookupEvidenceEntry(loaded.catalog, "fixture/dependable-runner")
  assert(dependableEntry, "expected lookup hit for fixture/dependable-runner")
  const fused = fuseEvidenceSources(dependableEntry, {
    fusionMode: "weighted_mean",
    sourceWeights: {},
    baseWeights: loaded.catalog.fusion.weights,
  })
  assert(Number.isFinite(fused.coding_evidence) && fused.coding_evidence >= 4.5, `expected dependable coding evidence >= 4.5, got ${fused.coding_evidence}`)
  process.stdout.write("PASS: evidence fusion derives a fused coding score for the high-rank model\n")

  // 2) Fingerprint mismatch must yield neutral evidence + a warning, never name-token rank fallback.
  const mismatched = loadEvidenceCatalog({
    routerConfig: { evidence_catalog_path: fixturePath },
    discoveryAudit: { fingerprint: "different-pool" },
  })
  assert(mismatched.binding.match === false, "expected mismatch binding to be false")
  assert(mismatched.warnings.length > 0, "expected mismatch to surface a warning")
  assert(
    mismatched.warnings.some((line) => line.includes("fingerprint mismatch")),
    `expected mismatch warning mention, got: ${mismatched.warnings.join("; ")}`,
  )
  process.stdout.write("PASS: evidence catalog mismatch surfaces a warning and stays binding-disabled\n")

  // 3) End-to-end: when evidence_rank_strength = 0 (default) ordering uses legacy
  //    rating dimensions; when strength = 1 the fused evidence drives rank and
  //    name-token rank dimensions contribute zero. Use a single sort to assert.
  const fixturePool = ["fixture/dependable-runner", "fixture/codex-marketing", "fixture/swe-bench-only"]
  const auditFingerprint = "fixture-pool-fingerprint"

  const legacyOrder = recommendRoleModels({
    availableModels: fixturePool,
    routerConfig: {
      evidence_catalog_path: fixturePath,
      evidence_rank_strength: 0,
    },
    discoveryAudit: { fingerprint: auditFingerprint },
  })
  const legacyDevPick = legacyOrder?.roles?.dev?.default_model || null
  assert(typeof legacyDevPick === "string", "expected legacy dev pick to resolve")
  // With strength = 0, name tokens still drive rank, so the codex-marketing
  // SKU's `codex` substring boost typically out-ranks dependable-runner. We
  // do not strictly assert which one wins — only that switching strength to 1
  // *flips* the order toward the evidence-best model.

  const evidenceOrder = recommendRoleModels({
    availableModels: fixturePool,
    routerConfig: {
      evidence_catalog_path: fixturePath,
      evidence_rank_strength: 1,
    },
    discoveryAudit: { fingerprint: auditFingerprint },
  })
  const evidenceDev = evidenceOrder?.roles?.dev
  assert(evidenceDev?.default_model === "fixture/dependable-runner", `expected evidence-driven dev pick to be fixture/dependable-runner, got ${evidenceDev?.default_model || "(none)"}`)
  assert(evidenceDev.evidence_hit === true, "expected dev role to register evidence_hit when binding matches")
  assert(evidenceDev.pool_fingerprint_match === true, "expected dev role telemetry to confirm fingerprint match")
  assert(evidenceDev.evidence_basis === "matched", `expected matched basis, got ${evidenceDev.evidence_basis}`)
  assert(typeof evidenceDev.evidence_fusion === "object" && evidenceDev.evidence_fusion !== null, "expected evidence_fusion telemetry")
  assert(typeof evidenceDev.evidence_by_source === "object" && evidenceDev.evidence_by_source !== null, "expected evidence_by_source telemetry")
  assert(evidenceOrder?.evidence_catalog?.found === true, "expected recommendation evidence_catalog.found")
  assert(evidenceOrder.evidence_catalog.binding.match === true, "expected catalog binding match in recommendation")
  assert(evidenceOrder.evidence_catalog.evidence_rank_strength === 1, "expected reported evidence_rank_strength to round-trip")
  process.stdout.write("PASS: evidence_rank_strength=1 elevates the evidence-best model to dev role\n")

  // 4) Name-token rank dimensions must not influence ordering at strength=1.
  //    Build a pool where name tokens for the bottom model would otherwise win,
  //    then assert sort stability: dependable-runner stays at the top.
  const flippedPool = ["fixture/codex-marketing", "fixture/dependable-runner"]
  const evidenceFlippedOrder = recommendRoleModels({
    availableModels: flippedPool,
    routerConfig: {
      evidence_catalog_path: fixturePath,
      evidence_rank_strength: 1,
    },
    discoveryAudit: { fingerprint: auditFingerprint },
  })
  assert(
    evidenceFlippedOrder?.roles?.dev?.default_model === "fixture/dependable-runner",
    "expected dependable-runner to remain top regardless of pool insertion order",
  )
  process.stdout.write("PASS: name-token dimensions do not change sort when evidence drives rank\n")

  // 5) Fingerprint mismatch path leaves rank using neutral evidence + price/prefs
  //    only; do not let token-name rank dimensions reassert by accident.
  const mismatchOrder = recommendRoleModels({
    availableModels: fixturePool,
    routerConfig: {
      evidence_catalog_path: fixturePath,
      evidence_rank_strength: 1,
    },
    discoveryAudit: { fingerprint: "this-fingerprint-does-not-match" },
  })
  assert(mismatchOrder?.evidence_catalog?.binding?.match === false, "expected mismatch binding in recommendation")
  assert(
    mismatchOrder.warnings.some((line) => line.includes("model-evidence")),
    `expected mismatch warning to surface in recommendation.warnings, got: ${(mismatchOrder.warnings || []).join("; ")}`,
  )
  const mismatchDev = mismatchOrder?.roles?.dev
  assert(mismatchDev.evidence_hit === false, "expected evidence_hit=false on fingerprint mismatch")
  assert(mismatchDev.evidence_basis === "mismatch_neutral", `expected mismatch_neutral basis, got ${mismatchDev.evidence_basis}`)
  process.stdout.write("PASS: fingerprint mismatch routes to neutral evidence with explicit warning\n")

  // 6) Router-config normalization round-trips evidence fields.
  const { } = await importFresh(routerConfigUrl)
  // Use the public schema's normalization indirectly: write a config to a
  // temp file, set OPENCODE_ROUTER_CONFIG, reload.
  const tempConfigDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-evidence-config-"))
  const configPath = path.resolve(tempConfigDir, "opencode-router.json")
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        evidence_catalog_path: fixturePath,
        evidence_rank_strength: 0.7,
        evidence_source_weights: { swe: 0.7, llm_iq: 0.3 },
      },
      null,
      2,
    ),
    "utf8",
  )
  const priorConfig = process.env.OPENCODE_ROUTER_CONFIG
  process.env.OPENCODE_ROUTER_CONFIG = configPath
  try {
    const reloaded = await importFresh(routerConfigUrl)
    const state = reloaded.loadRouterConfig()
    assert(state.found === true, "expected reloaded router config to load")
    assert(state.config.evidence_catalog_path === fixturePath, "expected normalized evidence_catalog_path")
    assert(state.config.evidence_rank_strength === 0.7, `expected normalized evidence_rank_strength to round-trip, got ${state.config.evidence_rank_strength}`)
    assert(state.config.evidence_source_weights.swe === 0.7, "expected swe override to round-trip")
    assert(state.config.evidence_source_weights.llm_iq === 0.3, "expected llm_iq override to round-trip")
    process.stdout.write("PASS: router-config normalization round-trips evidence fields\n")
  } finally {
    if (priorConfig === undefined) {
      delete process.env.OPENCODE_ROUTER_CONFIG
    } else {
      process.env.OPENCODE_ROUTER_CONFIG = priorConfig
    }
    fs.rmSync(tempConfigDir, { recursive: true, force: true })
  }

  fs.rmSync(tempDataDir, { recursive: true, force: true })
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exit(1)
})
