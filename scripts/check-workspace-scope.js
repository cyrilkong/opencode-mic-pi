const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const { STATE_PATHS, getStateScope } = await import(pathsUrl)

  const expectedKeys = [
    "intakeCard",
    "dispatchPacket",
    "workboard",
    "decisionLedger",
    "outcomeSnapshots",
    "resumeCapsule",
    "sessionLanguage",
    "interactionMode",
    "relayBridge",
    "modelMatch",
    "modelDiscoveryAudit",
    "researchMemory",
    "memoryPalace",
  ]
  const actualKeys = Object.keys(STATE_PATHS)

  assert(actualKeys.length === expectedKeys.length, `expected ${expectedKeys.length} canonical state keys, got ${actualKeys.length}`)
  for (const key of expectedKeys) {
    assert(actualKeys.includes(key), `expected canonical state key ${key}`)
    assert(!STATE_PATHS[key].includes(`${path.sep}.opencode${path.sep}`), `expected canonical state key ${key} under app-data roots`)
  }
  assert(!actualKeys.includes("developmentBacklog"), "developmentBacklog must not be part of canonical runtime state")

  const pluginSource = fs.readFileSync(path.resolve(repoRoot, "plugins", "opencode-router.js"), "utf8")
  assert(!pluginSource.includes("buildEngineeringBacklog"), "plugin runtime must not generate development backlog artifacts")
  assert(!pluginSource.includes("developmentBacklog"), "plugin runtime must not address developmentBacklog state")
  assert(!pluginSource.includes("NON_CANONICAL_RUNTIME_PATHS"), "plugin runtime should not retain legacy non-canonical runtime cleanup logic")

  const pathsSource = fs.readFileSync(path.resolve(repoRoot, "src", "paths.js"), "utf8")
  assert(!/STATE_PATHS\s*=\s*{[\s\S]*developmentBacklog/.test(pathsSource), "STATE_PATHS must stay limited to canonical runtime state")
  assert(!pathsSource.includes("PROJECT_SURFACE_STATE_PATHS"), "paths module should not retain removed state exports")
  assert(!pathsSource.includes("LEGACY_STATE_PATHS"), "paths module should not retain removed state exports")
  assert(!pathsSource.includes("NON_CANONICAL_RUNTIME_PATHS"), "paths module should not retain removed state exports")

  const scope = getStateScope()
  assert(path.resolve(scope.globalDir) !== path.resolve(scope.projectDir), "expected split global/project app-data state roots")

  process.stdout.write("PASS: canonical state stays under app-data roots only\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
