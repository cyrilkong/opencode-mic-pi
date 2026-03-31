const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function runScript(repoRoot, scriptName, args, env) {
  const result = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", scriptName), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  })
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${scriptName} failed: ${result.stderr || result.stdout || "unknown error"}`)
  }
  return result
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href

  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-reset-home-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-reset-data-"))
  const tempProjectRoot = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-reset-project-"))
  const env = {
    HOME: tempHome,
    OPENCODE_ROUTER_DATA_DIR: tempDataDir,
    OPENCODE_ROUTER_PROJECT_ROOT: tempProjectRoot,
  }

  const { resolveGlobalConfigPath } = await import(routerConfigUrl)
  const {
    renderDefaultModelMatchPolicyMarkdown,
    resolveGlobalModelMatchPolicyPath,
  } = await import(modelMatchUrl)
  const { getStateScope } = await import(pathsUrl)

  process.env.HOME = tempHome
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  process.env.OPENCODE_ROUTER_PROJECT_ROOT = tempProjectRoot

  const configPath = resolveGlobalConfigPath()
  const policyPath = resolveGlobalModelMatchPolicyPath()
  const scope = getStateScope()

  const postinstallSkipped = runScript(repoRoot, "bootstrap.js", ["--seed", "--silent", "--postinstall"], env)
  assert(postinstallSkipped.stdout === "", "silent postinstall skip should not print stdout")
  assert(postinstallSkipped.stderr === "", "silent postinstall skip should not print stderr")
  assert(!fs.existsSync(configPath), "postinstall seed should stay opt-in for router config")
  assert(!fs.existsSync(policyPath), "postinstall seed should stay opt-in for model-match policy")
  process.stdout.write("PASS: silent postinstall seed stays opt-in by default\n")

  const postinstallSeeded = runScript(
    repoRoot,
    "bootstrap.js",
    ["--seed", "--silent", "--postinstall"],
    { ...env, OPENCODE_ROUTER_POSTINSTALL_SEED: "1" },
  )
  assert(postinstallSeeded.stdout === "", "silent postinstall seed should not print stdout")
  assert(postinstallSeeded.stderr === "", "silent postinstall seed should not print stderr")
  assert(fs.existsSync(configPath), "postinstall seed opt-in should create router config")
  assert(fs.existsSync(policyPath), "postinstall seed opt-in should create model-match policy")
  process.stdout.write("PASS: postinstall seed only runs when explicitly enabled\n")

  fs.writeFileSync(configPath, `${JSON.stringify({ billing_mode: "request_billing", ui_notifications: false }, null, 2)}\n`, "utf8")
  fs.writeFileSync(policyPath, "# custom policy\n", "utf8")
  const profileReset = runScript(repoRoot, "reset-profile.js", ["--silent"], env)
  assert(profileReset.stdout === "", "silent reset-profile should not print stdout")
  assert(profileReset.stderr === "", "silent reset-profile should not print stderr")
  const resetConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
  const resetPolicy = fs.readFileSync(policyPath, "utf8")
  assert(resetConfig.billing_mode === null, "reset-profile should restore default router config template")
  assert(resetConfig.ui_notifications === undefined, "reset-profile should restore the minimal user-managed config surface")
  assert(resetPolicy === renderDefaultModelMatchPolicyMarkdown(), "reset-profile should restore bundled policy markdown")
  assert(fs.existsSync(`${configPath}.bak`), "reset-profile should preserve config rollback backup")
  assert(fs.existsSync(`${policyPath}.bak`), "reset-profile should preserve policy rollback backup")
  process.stdout.write("PASS: reset-profile restores defaults and keeps rollback backups\n")

  fs.mkdirSync(scope.projectDir, { recursive: true })
  fs.mkdirSync(scope.globalDir, { recursive: true })
  fs.writeFileSync(path.resolve(scope.projectDir, "marker.txt"), "project", "utf8")
  fs.writeFileSync(path.resolve(scope.globalDir, "marker.txt"), "global", "utf8")
  const resetProjectState = runScript(repoRoot, "reset-state.js", ["--silent"], env)
  assert(resetProjectState.stdout === "", "silent reset-state should not print stdout")
  assert(resetProjectState.stderr === "", "silent reset-state should not print stderr")
  assert(!fs.existsSync(scope.projectDir), "reset-state default should remove project state")
  assert(fs.existsSync(scope.globalDir), "reset-state default should keep global state")
  process.stdout.write("PASS: reset-state defaults to project scope\n")

  fs.mkdirSync(scope.projectDir, { recursive: true })
  fs.writeFileSync(path.resolve(scope.projectDir, "marker.txt"), "project", "utf8")
  const resetGlobalState = runScript(repoRoot, "reset-state.js", ["--global", "--silent"], env)
  assert(resetGlobalState.stdout === "", "silent global reset-state should not print stdout")
  assert(resetGlobalState.stderr === "", "silent global reset-state should not print stderr")
  assert(fs.existsSync(scope.projectDir), "reset-state --global should keep project state")
  assert(!fs.existsSync(scope.globalDir), "reset-state --global should remove global state")
  process.stdout.write("PASS: reset-state --global leaves project state intact\n")

  fs.mkdirSync(scope.globalDir, { recursive: true })
  fs.writeFileSync(path.resolve(scope.globalDir, "marker.txt"), "global", "utf8")
  const resetAllState = runScript(repoRoot, "reset-state.js", ["--all", "--silent"], env)
  assert(resetAllState.stdout === "", "silent all reset-state should not print stdout")
  assert(resetAllState.stderr === "", "silent all reset-state should not print stderr")
  assert(!fs.existsSync(scope.pluginRoot), "reset-state --all should remove the full plugin state root")
  process.stdout.write("PASS: reset-state --all clears the full plugin app-data namespace\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
