const path = require("node:path")
const os = require("node:os")
const fs = require("node:fs")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const contractsUrl = pathToFileURL(path.resolve(repoRoot, "src", "contracts.js")).href

  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-command-short-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-command-short-data-"))
  process.env.HOME = tempHome
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  process.env.OPENCODE_ROUTER_DISABLE_AUTO_REMATCH = "1"
  delete process.env.OPENCODE_ROUTER_CONFIG
  delete process.env.OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN

  const { OpenCodeRouterPlugin } = await import(pluginUrl)
  const { ROUTER_COMMAND_HANDLED } = await import(contractsUrl)

  const promptMessages = []
  const client = {
    app: { log: async () => {} },
    tui: { toast: { show: async () => {} } },
    session: {
      prompt: async (payload) => {
        const text = payload?.body?.parts?.find((part) => part.type === "text")?.text || ""
        promptMessages.push(text)
      },
    },
  }

  const plugin = await OpenCodeRouterPlugin({ client })

  for (const command of ["pi-dispatch", "pi-up", "pi-book"]) {
    const output = { parts: [{ type: "text", text: "stale" }] }
    let handled = false
    try {
      await plugin["command.execute.before"]({ command, sessionID: "test-session" }, output)
    } catch (error) {
      handled = String(error?.message || "") === ROUTER_COMMAND_HANDLED
    }
    assert(handled, `expected ${command} to short-circuit with handled sentinel`)
    assert(Array.isArray(output.parts) && output.parts.length === 0, `expected ${command} command hook output parts to be cleared`)
  }

  const dispatchView = promptMessages[0] || ""
  const upView = promptMessages[1] || ""
  const bookView = promptMessages[2] || ""
  assert(dispatchView.includes("Cannot run /pi-dispatch: no ready Mic packet found."), "expected /pi-dispatch failure to inject command output before short-circuit")
  assert(upView.includes("[Pi Up]"), "expected /pi-up to inject Pi Up view before short-circuit")
  assert(bookView.includes("[Dispatch Packet]"), "expected /pi-book to inject Pi Book view before short-circuit")
  process.stdout.write("PASS: command hook short-circuits /pi-dispatch, /pi-up, and /pi-book after injecting command output\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
