const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const optimizeScript = path.resolve(repoRoot, "scripts", "optimize-model-match.js")
  const routerConfigPath = path.resolve(repoRoot, "opencode-router.schema.json")
  const tempDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-optimize-"))
  const opencodeConfigPath = path.resolve(tempDir, "opencode.json")
  const dataDir = path.resolve(tempDir, "data")
  const fixtureProvider = "provider-alpha"
  const primaryModel = "model-primary"
  const backupModel = "model-backup"

  const fixtureConfig = {
    agent: {
      mic: { mode: "primary", model: `${fixtureProvider}/${primaryModel}`, prompt: "{file:/tmp/mic.md}" },
      pi: { mode: "primary", model: `${fixtureProvider}/${primaryModel}`, prompt: "{file:/tmp/pi.md}" },
      custom: { mode: "subagent", prompt: "{file:/tmp/custom.md}" },
    },
    provider: {
      [fixtureProvider]: {
        models: {
          [primaryModel]: { name: "" },
          [backupModel]: { name: "" },
        },
      },
    },
  }

  fs.writeFileSync(opencodeConfigPath, `${JSON.stringify(fixtureConfig, null, 2)}\n`)

  const run = spawnSync(process.execPath, [optimizeScript, "--write"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENCODE_CONFIG: opencodeConfigPath,
      OPENCODE_ROUTER_CONFIG: routerConfigPath,
      OPENCODE_ROUTER_DATA_DIR: dataDir,
      OPENCODE_BIN: "__opencode_missing_binary__",
    },
  })

  if (run.stdout) process.stdout.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  assert((run.status ?? 1) === 0, "optimize-model-match --write should exit 0")

  const updated = JSON.parse(fs.readFileSync(opencodeConfigPath, "utf8"))
  assert(!updated?.agent?.mic, "expected router-managed mic definition to be removed from opencode config")
  assert(!updated?.agent?.pi, "expected router-managed pi definition to be removed from opencode config")
  assert(updated?.agent?.custom?.prompt, "expected non-router custom agent settings to be preserved")
  for (const builtin of ["plan", "general", "build", "explore"]) {
    assert(updated?.agent?.[builtin]?.disable === true, `expected builtin ${builtin} disable=true`)
    assert(!Object.prototype.hasOwnProperty.call(updated?.agent?.[builtin] || {}, "mode"), `expected builtin ${builtin} mode to be unmanaged`)
    assert(!Object.prototype.hasOwnProperty.call(updated?.agent?.[builtin] || {}, "hidden"), `expected builtin ${builtin} hidden to be unmanaged`)
  }

  const backups = fs.readdirSync(tempDir).filter((file) => file.startsWith("opencode.json.bak-"))
  assert(backups.length >= 1, "expected backup file before cleanup rewrite")

  process.stdout.write("PASS: optimize-models write mode cleans pinned models and router agent definitions with backup\n")
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}
