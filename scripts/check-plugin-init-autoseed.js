const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const policyUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match-policy.js")).href

  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-init-home-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-init-data-"))

  process.env.HOME = tempHome
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  process.env.OPENCODE_ROUTER_DISABLE_AUTO_REMATCH = "1"
  delete process.env.OPENCODE_ROUTER_CONFIG
  delete process.env.OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN

  const { OpenCodeRouterPlugin } = await import(pluginUrl)
  const { resolveGlobalConfigPath } = await import(routerConfigUrl)
  const {
    resolveGlobalModelMatchPolicyPath,
  } = await import(modelMatchUrl)
  const {
    readBundledModelMatchPolicyTemplate,
  } = await import(policyUrl)

  const configPath = resolveGlobalConfigPath()
  const policyPath = resolveGlobalModelMatchPolicyPath()

  const client = {
    app: { log: async () => {} },
    session: { prompt: async () => {} },
    tui: { toast: { show: async () => {} } },
  }

  await OpenCodeRouterPlugin({ client })

  assert(fs.existsSync(configPath), "plugin init should seed ~/.config/opencode/opencode-router.json when missing")
  assert(fs.existsSync(policyPath), "plugin init should seed ~/.config/opencode/opencode-router-model-match.md when missing")

  const seededConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
  assert(seededConfig.billing_mode === null, "auto-seeded router config should keep billing_mode null by default")
  assert(!Object.prototype.hasOwnProperty.call(seededConfig, "manage_agents"), "auto-seeded router config should keep static plugin defaults implicit")

  const initialPolicy = fs.readFileSync(policyPath, "utf8")
  const bundledTemplate = readBundledModelMatchPolicyTemplate()
  assert(initialPolicy.includes("# Model Match Policy"), "auto-seeded policy should contain markdown template header")
  assert(initialPolicy.includes("### mic"), "auto-seeded policy should contain role sections")
  assert(initialPolicy.includes("*when request based billing override*"), "auto-seeded policy should contain inline billing override blocks")
  assert(initialPolicy === bundledTemplate, "auto-seeded user policy should come from the bundled plugin-default template")

  const preservedMarker = "\n<!-- preserved custom edit -->\n"
  fs.writeFileSync(policyPath, `${initialPolicy.trimEnd()}${preservedMarker}`, "utf8")

  await OpenCodeRouterPlugin({ client })

  const policyAfterSecondInit = fs.readFileSync(policyPath, "utf8")
  assert(policyAfterSecondInit.includes("<!-- preserved custom edit -->"), "plugin init should not overwrite an existing model-match policy file")

  process.stdout.write("PASS: plugin init auto-seeds editable config + policy surfaces without overwriting later edits\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
