const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const bootstrapScript = path.resolve(repoRoot, "scripts", "bootstrap.js")
  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-home-"))

  const run = spawnSync(process.execPath, [bootstrapScript, "--write", "--overwrite"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: tempHome,
    },
  })

  if (run.stdout) process.stdout.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  assert((run.status ?? 1) === 0, "bootstrap --write should exit 0")

  const configPath = path.resolve(tempHome, ".config", "opencode", "opencode-router.json")
  assert(fs.existsSync(configPath), "expected bootstrap to install ~/.config/opencode/opencode-router.json")

  const installedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
  assert(installedConfig.billing_mode === null, "expected billing_mode default to be null")
  assert(Array.isArray(installedConfig.provider_preferences), "expected provider_preferences in installed config")
  assert(installedConfig.provider_preferences.length === 0, "expected provider_preferences to default to empty array")
  assert(installedConfig.role_model_preferences && typeof installedConfig.role_model_preferences === "object", "expected role_model_preferences in installed config")
  assert(!Object.prototype.hasOwnProperty.call(installedConfig, "manage_agents"), "expected static plugin defaults like manage_agents to stay implicit in user config seed")
  const opencodeConfigPath = path.resolve(tempHome, ".config", "opencode", "opencode.json")
  assert(!fs.existsSync(opencodeConfigPath), "bootstrap should not manage opencode.json for model preferences")
  assert(!fs.existsSync(path.resolve(tempHome, ".config", "opencode", "agents")), "bootstrap should not install agent files")
  assert(!fs.existsSync(path.resolve(tempHome, ".config", "opencode", "commands")), "bootstrap should not install command files")
  assert(!fs.existsSync(path.resolve(tempHome, ".config", "opencode", "plugins")), "bootstrap should not install plugin wrapper files")
  const rollbackBackupPath = `${configPath}.bak`
  assert(!fs.existsSync(rollbackBackupPath), "initial bootstrap should not create rollback backup when target did not exist")

  const mutatedConfig = { ...installedConfig, billing_mode: "request_billing" }
  fs.writeFileSync(configPath, `${JSON.stringify(mutatedConfig, null, 2)}\n`, "utf8")

  const overwriteRun = spawnSync(process.execPath, [bootstrapScript, "--write", "--overwrite"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: tempHome,
    },
  })
  if (overwriteRun.stdout) process.stdout.write(overwriteRun.stdout)
  if (overwriteRun.stderr) process.stderr.write(overwriteRun.stderr)
  assert((overwriteRun.status ?? 1) === 0, "bootstrap overwrite should exit 0")
  assert(fs.existsSync(rollbackBackupPath), "bootstrap overwrite should keep one rollback backup")
  const rollbackConfig = JSON.parse(fs.readFileSync(rollbackBackupPath, "utf8"))
  assert(rollbackConfig.billing_mode === "request_billing", "rollback backup should preserve the overwritten full config")
  const backupSiblings = fs.readdirSync(path.dirname(configPath)).filter((file) => file.startsWith("opencode-router.json.bak"))
  assert(backupSiblings.length === 1 && backupSiblings[0] === "opencode-router.json.bak", "bootstrap should keep exactly one stable rollback backup file")

  process.stdout.write("PASS: bootstrap only installs opencode-router.json and leaves plugin surfaces self-contained\n")
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}
