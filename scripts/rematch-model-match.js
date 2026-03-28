const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const args = new Set(process.argv.slice(2))
  const shouldWrite = !args.has("--check")
  const syncRouterConfig = args.has("--sync-router-config") || shouldWrite

  const repoRoot = path.resolve(__dirname, "..")
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const {
    explainRecommendation,
    readModelDiscoveryAudit,
    refreshVerifiedModelDiscoveryAudit,
    recommendRoleModels,
    recomputeAndPersistModelMatch,
  } = await import(modelMatchUrl)
  const { loadRouterConfig } = await import(routerConfigUrl)

  const routerConfigState = loadRouterConfig()
  const discoveryAudit = await refreshVerifiedModelDiscoveryAudit({
    routerConfig: routerConfigState.config,
  })
  const recommendation = shouldWrite
    ? recomputeAndPersistModelMatch({
      routerConfig: routerConfigState.config,
      configSource: routerConfigState.source,
      discoveryAudit,
      syncRouterConfig,
    })
    : recommendRoleModels({
      routerConfig: routerConfigState.config,
      configSource: routerConfigState.source,
      discoveryAudit || readModelDiscoveryAudit(),
    })

  process.stdout.write(`${shouldWrite ? "WROTE" : "CHECK"}: model-match ${shouldWrite ? "refreshed" : "previewed"}${syncRouterConfig ? " (router prefs synced)" : ""}\n`)
  process.stdout.write(`${explainRecommendation(recommendation)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
