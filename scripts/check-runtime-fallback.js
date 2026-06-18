const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJsonLines(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

function backupFiles(paths) {
  const backup = new Map()
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      backup.set(filePath, { exists: true, content: fs.readFileSync(filePath, "utf8") })
    } else {
      backup.set(filePath, { exists: false, content: "" })
    }
  }
  return backup
}

function clearFiles(paths) {
  for (const filePath of paths) {
    try {
      fs.unlinkSync(filePath)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }
}

function restoreFiles(backup) {
  for (const [filePath, entry] of backup.entries()) {
    if (entry.exists) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, entry.content, "utf8")
      continue
    }
    try {
      fs.unlinkSync(filePath)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }
}

function buildAssistantErrorEvent({
  id,
  sessionID,
  parentID,
  agent,
  providerID,
  modelID,
  errorName,
  errorData,
}) {
  return {
    event: {
      type: "message.updated",
      properties: {
        info: {
          id,
          sessionID,
          role: "assistant",
          parentID,
          providerID,
          modelID,
          mode: "primary",
          agent,
          path: { cwd: "/", root: "/" },
          time: { created: Date.now() },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          error: {
            name: errorName,
            data: errorData || {},
          },
        },
      },
    },
  }
}

async function transformMessages(plugin, message, parts) {
  const normalizedMessage = {
    id: "user-msg",
    sessionID: "session-1",
    role: "user",
    agent: "mic",
    model: { providerID: "fixture", modelID: "fixture-model" },
    time: { created: Date.now() },
    ...message,
  }
  const output = {
    message: normalizedMessage,
    parts: Array.isArray(parts) ? parts : [],
  }
  await plugin["chat.message"](
    {
      sessionID: normalizedMessage.sessionID,
      agent: normalizedMessage.agent,
      messageID: normalizedMessage.id,
      model: normalizedMessage.model,
    },
    output,
  )
  return output
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-fallback-home-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-fallback-data-"))
  process.env.HOME = tempHome
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  delete process.env.OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const { OpenCodeRouterPlugin } = await import(pluginUrl)
  const { STATE_PATHS } = await import(pathsUrl)

  const trackedStateFiles = [
    STATE_PATHS.modelMatch,
    STATE_PATHS.modelDiscoveryAudit,
    STATE_PATHS.outcomeSnapshots,
  ]
  const stateSnapshot = backupFiles(trackedStateFiles)
  clearFiles(trackedStateFiles)

  const oldEnv = {
    OPENCODE_CONFIG: process.env.OPENCODE_CONFIG,
    OPENCODE_ROUTER_CONFIG: process.env.OPENCODE_ROUTER_CONFIG,
    OPENCODE_BIN: process.env.OPENCODE_BIN,
  }

  const tempDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-fallback-"))
  const tempOpencodeConfigPath = path.resolve(tempDir, "opencode.json")
  const tempRouterConfigPath = path.resolve(tempDir, "opencode-router.json")
  const tempOpencodeBinPath = path.resolve(tempDir, "mock-opencode")
  const fixtureProvider = "provider-alpha"
  const primaryModel = "model-primary"
  const fallbackModel = "model-backup"
  const tempOpencodeConfig = {
    provider: {
      [fixtureProvider]: {
        models: {
          [primaryModel]: { name: "" },
          [fallbackModel]: { name: "" },
        },
      },
    },
  }
  const tempRouterConfig = {}
  fs.writeFileSync(tempOpencodeConfigPath, `${JSON.stringify(tempOpencodeConfig, null, 2)}\n`)
  fs.writeFileSync(tempRouterConfigPath, `${JSON.stringify(tempRouterConfig, null, 2)}\n`)
  fs.writeFileSync(
    tempOpencodeBinPath,
    `#!/bin/sh\nif [ "$1" = "models" ]; then\n  printf '%s\\n' "${fixtureProvider}/${primaryModel}" "${fixtureProvider}/${fallbackModel}"\n  exit 0\nfi\nprintf 'unexpected command\\n' >&2\nexit 1\n`,
    "utf8",
  )
  fs.chmodSync(tempOpencodeBinPath, 0o755)

  process.env.OPENCODE_CONFIG = tempOpencodeConfigPath
  process.env.OPENCODE_ROUTER_CONFIG = tempRouterConfigPath
  process.env.OPENCODE_BIN = tempOpencodeBinPath

  const promptCalls = []
  const logs = []

  try {
    const client = {
      app: { log: async (payload) => logs.push(payload) },
      session: { prompt: async (payload) => promptCalls.push(payload) },
      tui: { toast: { show: async () => {} } },
    }
    const plugin = await OpenCodeRouterPlugin({ client })
    assert(typeof plugin["chat.message"] === "function", "expected chat.message hook to exist")

    await transformMessages(
      plugin,
      {
        id: "user-msg-1",
        sessionID: "session-1",
        role: "user",
        agent: "mic",
        model: { providerID: fixtureProvider, modelID: primaryModel },
        time: { created: Date.now() },
      },
      [{ type: "text", text: "Implement runtime fallback now." }],
    )

    await plugin.event(buildAssistantErrorEvent({
      id: "assistant-msg-1",
      sessionID: "session-1",
      parentID: "user-msg-1",
      agent: "mic",
      providerID: fixtureProvider,
      modelID: primaryModel,
      errorName: "APIError",
      errorData: { message: "401 invalid token", statusCode: 401, isRetryable: false },
    }))

    assert(promptCalls.length === 1, "expected one runtime fallback retry prompt submission")
    const firstRetry = promptCalls[0]
    assert(firstRetry?.path?.id === "session-1", "expected fallback retry prompt to target same session")
    assert(firstRetry?.body?.agent === "mic", "expected fallback retry to target same agent")
    assert(firstRetry?.body?.messageID === "user-msg-1", "expected fallback retry to bind original parent message")
    assert(firstRetry?.body?.model?.providerID === fixtureProvider, "expected fallback provider to be resolved")
    assert(firstRetry?.body?.model?.modelID === fallbackModel, "expected next fallback model to be selected")
    assert(
      Array.isArray(firstRetry?.body?.parts) && firstRetry.body.parts[0]?.text === "Implement runtime fallback now.",
      "expected fallback retry to replay original prompt parts",
    )

    await plugin.event(buildAssistantErrorEvent({
      id: "assistant-msg-2",
      sessionID: "session-1",
      parentID: "user-msg-1",
      agent: "mic",
      providerID: fixtureProvider,
      modelID: fallbackModel,
      errorName: "APIError",
      errorData: { message: "provider outage", statusCode: 503, isRetryable: true },
    }))

    assert(promptCalls.length === 1, "expected fallback exhaustion to stop additional retry submissions")
    const outcomes = readJsonLines(STATE_PATHS.outcomeSnapshots)
    assert(
      outcomes.some((entry) => entry.kind === "model_fallback"),
      "expected model_fallback outcome snapshot",
    )
    assert(
      outcomes.some((entry) => entry.kind === "model_fallback_exhausted"),
      "expected model_fallback_exhausted outcome snapshot",
    )
    assert(logs.length > 0, "expected fallback path to produce logs")
    process.stdout.write("PASS: runtime fallback auto-retries with next model and stops when fallback chain is exhausted\n")
  } finally {
    restoreFiles(stateSnapshot)
    process.env.OPENCODE_CONFIG = oldEnv.OPENCODE_CONFIG
    process.env.OPENCODE_ROUTER_CONFIG = oldEnv.OPENCODE_ROUTER_CONFIG
    process.env.OPENCODE_BIN = oldEnv.OPENCODE_BIN
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
