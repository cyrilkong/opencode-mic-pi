const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { spawnSync } = require("node:child_process")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function importFresh(specifier) {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-research-"))
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  process.env.OPENCODE_ROUTER_PROJECT_ROOT = repoRoot

  const modelResearchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-research-rank.js")).href
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const authorityUrl = pathToFileURL(path.resolve(repoRoot, "src", "research-authority.js")).href

  const {
    researchBlendMeta,
    runResearchPhase,
    readResearchArtifact,
    validateResearchPayload,
    RESEARCH_ROLES,
  } = await importFresh(modelResearchUrl)
  const { recommendRoleModels } = await importFresh(modelMatchUrl)
  const { loadAuthorityAllowlist, validateResearchCitations } = await importFresh(authorityUrl)

  // 1) Blend metadata is fixed 7:3 research vs soft policy signal.
  const blend = researchBlendMeta()
  assert(blend.researchWeight === 7 && blend.userWeight === 3 && blend.total === 10, "expected 7:3 research blend weights")
  process.stdout.write("PASS: research blend meta is 7:3 (research vs policy soft signal)\n")

  // 2) Blog-only citations fail authority gate (T1+T2 count).
  const allowlist = loadAuthorityAllowlist(null)
  assert(!allowlist.error, `allowlist load: ${allowlist.error}`)
  const blogOnly = validateResearchCitations(
    [{ url: "https://medium.com/example", note: "blog" }],
    allowlist.entries,
    { strict: true, minT12: 1 },
  )
  assert(blogOnly.ok === false, "expected blog-only citations to fail validation")
  const mixed = validateResearchCitations(
    [
      { url: "https://medium.com/example", note: "blog" },
      { url: "https://arxiv.org/abs/1706.03762", note: "paper" },
    ],
    allowlist.entries,
    { strict: true, minT12: 1 },
  )
  assert(mixed.ok === true, "expected arxiv citation to satisfy min T1+T2 requirement")
  process.stdout.write("PASS: research citation authority rejects blog-only and accepts T2 arXiv\n")

  // 3) Bundled runner fails closed without mock / stub env (contract for production wiring).
  const runnerPath = path.resolve(repoRoot, "scripts", "run-model-research-runner.mjs")
  const stdin = JSON.stringify({
    pool: ["fixture/a"],
    roles: ["pi"],
    pool_fingerprint: "fp",
    prompts: { pi: "x" },
  })
  const closed = spawnSync(process.execPath, [runnerPath], {
    input: `${stdin}\n`,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENCODE_ROUTER_RESEARCH_MOCK: "0",
      OPENCODE_ROUTER_ALLOW_STUB_WEB_TOOLS: "0",
    },
  })
  assert((closed.status ?? 1) === 2, `expected runner exit 2 without web tools, got ${closed.status}`)
  const out = JSON.parse((closed.stdout || "{}").trim() || "{}")
  assert(out.web_tools_ok === false, "expected web_tools_ok false when runner is not wired")
  process.stdout.write("PASS: research runner fails closed without mock or stub web-tools env\n")

  // 4) Disabled / no-pool short-circuit: no sidecar write on disabled; no pool skips research.
  let disabledPhase = await runResearchPhase({
    routerConfig: { model_research_enabled: false },
    discoveryAudit: { fingerprint: "x", models: ["a/b"] },
  })
  assert(disabledPhase.skipped === "disabled", "expected disabled skip")
  let noPool = await runResearchPhase({
    routerConfig: { model_research_enabled: true },
    discoveryAudit: null,
  })
  assert(noPool.skipped === "no_pool", "expected no_pool when audit missing")
  const artAfterSkip = readResearchArtifact()
  assert(artAfterSkip === null, "expected no research artifact after skips")
  process.stdout.write("PASS: research phase skips when disabled or pool/audit missing (init-safe)\n")

  // 5) Mock runner + validation: full phase writes usable sidecar; recommendRoleModels consumes it.
  process.env.OPENCODE_ROUTER_RESEARCH_MOCK = "1"
  const fp = "research-routing-test-fp"
  const pool = ["aaa-evil/x", "zzz-good/y"]
  const progress = []
  const phaseResult = await runResearchPhase({
    routerConfig: {
      model_research_enabled: true,
      model_research_strict_web_tools: true,
    },
    discoveryAudit: { fingerprint: fp, models: pool },
    onProgress: ({ phase, detail }) => {
      progress.push({ phase, detail })
    },
  })
  assert(phaseResult.ran === true && phaseResult.ok === true, `expected research run ok, got ${JSON.stringify(phaseResult)}`)
  assert(progress.some((p) => p.phase === "research"), "expected progress callback during research phase")
  const written = readResearchArtifact()
  assert(written && written.ok === true && written.pool_fingerprint === fp, "expected research sidecar after mock run")

  const withResearch = recommendRoleModels({
    availableModels: pool,
    routerConfig: { model_research_enabled: true },
    discoveryAudit: { fingerprint: fp },
  })
  assert(
    withResearch.model_research?.enabled === true && withResearch.model_research?.usable === true,
    "expected model_research telemetry when artifact matches fingerprint",
  )

  const devPickAvoided = recommendRoleModels({
    availableModels: pool,
    routerConfig: {
      model_research_enabled: true,
      global_avoid_keywords: ["evil"],
    },
    discoveryAudit: { fingerprint: fp },
  })
  assert(
    devPickAvoided.roles?.dev?.default_model === "zzz-good/y",
    `expected hard global avoid to drop research-first pick; got ${devPickAvoided.roles?.dev?.default_model || "(none)"}`,
  )
  process.stdout.write("PASS: mock research run validates citations, persists sidecar, and hard avoids beat research order\n")

  // 5b) Lock skip: a live, non-stale lock blocks research with skipped="locked".
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const { STATE_PATHS } = await importFresh(pathsUrl)
  const lockPath = path.join(path.dirname(STATE_PATHS.modelResearch), ".model-research.lock")
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, started_at: Date.now() }),
    { flag: "wx" },
  )
  const lockedSkip = await runResearchPhase({
    routerConfig: { model_research_enabled: true, model_research_strict_web_tools: true },
    discoveryAudit: { fingerprint: fp, models: pool },
  })
  assert(lockedSkip.ran === false && lockedSkip.skipped === "locked", `expected skipped=locked, got ${JSON.stringify(lockedSkip)}`)
  process.stdout.write("PASS: research phase skips with skipped=locked when a live lock is held\n")
  fs.unlinkSync(lockPath)

  // 5c) Stale-lock reclaim: a lock held by a dead PID is reclaimed and research runs.
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: 999999, started_at: Date.now() - 200000 }),
    { flag: "wx" },
  )
  const reclaimedRun = await runResearchPhase({
    routerConfig: { model_research_enabled: true, model_research_strict_web_tools: true },
    discoveryAudit: { fingerprint: fp, models: pool },
  })
  assert(reclaimedRun.ran === true && reclaimedRun.ok === true, `expected stale-lock reclaim to run research, got ${JSON.stringify(reclaimedRun)}`)
  process.stdout.write("PASS: research phase reclaims a stale (dead-PID) lock and runs\n")

  // 5d) Research ok:false artifact surfaces a warning in recommendRoleModels.
  const researchArtifactPath = STATE_PATHS.modelResearch
  fs.mkdirSync(path.dirname(researchArtifactPath), { recursive: true })
  fs.writeFileSync(
    researchArtifactPath,
    JSON.stringify({ ok: false, error: "test_research_failure", pool_fingerprint: fp, web_tools_ok: false }),
  )
  const failedResearch = recommendRoleModels({
    availableModels: pool,
    routerConfig: { model_research_enabled: true },
    discoveryAudit: { fingerprint: fp },
  })
  assert(
    failedResearch.warnings.some((w) => w.includes("model-research: test_research_failure")),
    `expected model-research warning, got: ${(failedResearch.warnings || []).join("; ")}`,
  )
  process.stdout.write("PASS: research ok:false artifact surfaces a warning in recommendation\n")

  // 6) validateResearchPayload rejects malformed role payload (blog citations inside roles.pi).
  const badPayload = {
    web_tools_ok: true,
    roles: {},
  }
  for (const role of RESEARCH_ROLES) {
    badPayload.roles[role] = {
      ordered_ids: [...pool].sort((a, b) => a.localeCompare(b)),
      models: Object.fromEntries(
        pool.map((id) => [
          id,
          { coding: 3, agentic: 3, reasoning: 3 },
        ]),
      ),
      citations:
        role === "pi"
          ? [{ url: "https://substack.com/bad", note: "non-authoritative" }]
          : [
              { url: "https://arxiv.org/abs/1706.03762", note: "ok" },
              { url: "https://models.dev/", note: "ok" },
            ],
    }
  }
  const vBad = validateResearchPayload(badPayload, pool, { research_authority_strict: true }, allowlist)
  assert(vBad.ok === false && String(vBad.reason || "").includes("pi"), `expected pi citation failure, got ${vBad.reason}`)
  process.stdout.write("PASS: validateResearchPayload rejects role blocks with insufficient authority citations\n")

  // 7) Router config normalization round-trips research keys.
  const tempCfgDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-research-cfg-"))
  const cfgPath = path.resolve(tempCfgDir, "opencode-router.json")
  fs.writeFileSync(
    cfgPath,
    `${JSON.stringify(
      {
        provider_preferences: [],
        role_model_preferences: {},
        model_research_enabled: true,
        model_research_model: "custom/model",
        model_research_timeout_ms: 60000,
        model_research_strict_web_tools: false,
        min_authority_citations_per_role: 2,
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  process.env.OPENCODE_ROUTER_CONFIG = cfgPath
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const { loadRouterConfig } = await importFresh(routerConfigUrl)
  const loaded = loadRouterConfig()
  assert(loaded.config.model_research_enabled === true, "expected normalized model_research_enabled")
  assert(loaded.config.model_research_model === "custom/model", "expected normalized model_research_model")
  assert(loaded.config.model_research_timeout_ms === 60000, "expected normalized timeout clamp")
  assert(loaded.config.model_research_strict_web_tools === false, "expected normalized strict flag")
  assert(loaded.config.min_authority_citations_per_role === 2, "expected normalized min citations")
  process.stdout.write("PASS: router config normalizes model research fields\n")
}

main().catch((error) => {
  process.stderr.write(`FAIL: research routing :: ${error.message}\n`)
  process.exit(1)
})
