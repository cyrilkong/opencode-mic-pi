const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function buildAssistantEvent(text) {
  return {
    event: {
      type: "message.updated",
      properties: {
        role: "assistant",
        content: [{ type: "text", text }],
      },
    },
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const policyUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match-policy.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href

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
  const { STATE_PATHS } = await import(pathsUrl)

  const configPath = resolveGlobalConfigPath()
  const policyPath = resolveGlobalModelMatchPolicyPath()
  let promptCount = 0
  let toastCount = 0

  const client = {
    app: { log: async () => {} },
    session: { prompt: async () => { promptCount += 1 } },
    tui: { toast: { show: async () => { toastCount += 1 } } },
  }

  await OpenCodeRouterPlugin({ client })

  assert(fs.existsSync(configPath), "plugin init should seed ~/.config/opencode/opencode-router.json when missing")
  assert(fs.existsSync(policyPath), "plugin init should seed ~/.config/opencode/opencode-router-model-match.md when missing")
  assert(promptCount === 0, "plugin init should not inject session prompts")
  assert(toastCount === 0, "plugin init should stay silent in TUI")

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
  assert(promptCount === 0, "repeated plugin init should not inject session prompts")
  assert(toastCount === 0, "repeated plugin init should stay silent in TUI")

  fs.writeFileSync(
    configPath,
    `${JSON.stringify({
      billing_mode: null,
      provider_preferences: [],
      role_model_preferences: {},
      seed_global_surfaces_on_init: false,
      ui_notifications: false,
    }, null, 2)}\n`,
    "utf8",
  )
  fs.rmSync(policyPath, { force: true })
  promptCount = 0
  toastCount = 0

  const readyFixture = fs.readFileSync(path.resolve(repoRoot, "fixtures/intake/valid-ready-mic-output.md"), "utf8")
  const plugin = await OpenCodeRouterPlugin({ client })
  assert(!fs.existsSync(policyPath), "seed_global_surfaces_on_init=false should prevent policy auto-seeding during init")
  await plugin.event(buildAssistantEvent(readyFixture))
  assert(fs.existsSync(STATE_PATHS.dispatchPacket), "ready Mic turn should still create a dispatch packet when notifications are disabled")
  assert(promptCount === 0, "ui_notifications=false should not cause session prompt noise")
  assert(toastCount === 0, "ui_notifications=false should suppress ready toasts")

  process.stdout.write("PASS: plugin init auto-seeds editable config + policy surfaces silently without overwriting later edits\n")
  process.stdout.write("PASS: init seed and UI notification switches suppress seeding/toasts when disabled\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
