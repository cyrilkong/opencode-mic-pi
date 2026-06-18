const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
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

function buildAssistantEvents(
  text,
  messageID = "assistant-msg-1",
  sessionID = "plugin-event-session",
  { pathInfo = { cwd: "/", root: "/" }, chunks = null } = {},
) {
  const textChunks = Array.isArray(chunks) && chunks.length > 0 ? chunks : [text]
  const events = [
    {
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: messageID,
            sessionID,
            role: "assistant",
            parentID: "user-msg-1",
            agent: "mic",
            providerID: "fixture",
            modelID: "fixture-model",
            mode: "primary",
            path: pathInfo,
            time: { created: Date.now() },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          },
        },
      },
    },
  ]

  let aggregate = ""
  for (const [index, chunk] of textChunks.entries()) {
    aggregate += chunk
    events.push({
      event: {
        type: "message.part.updated",
        properties: {
          delta: chunk,
          part: {
            id: `${messageID}-part-1`,
            sessionID,
            messageID,
            type: "text",
            text: aggregate,
          },
        },
      },
    })
  }

  return events
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-event-home-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-event-data-"))
  process.env.HOME = tempHome
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  process.env.OPENCODE_ROUTER_DISABLE_AUTO_REMATCH = "1"
  delete process.env.OPENCODE_ROUTER_CONFIG
  delete process.env.OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const { OpenCodeRouterPlugin } = await import(pluginUrl)
  const { STATE_PATHS, getStateScope, buildProjectStateKey } = await import(pathsUrl)

  const trackedStateFiles = [
    STATE_PATHS.modelMatch,
    STATE_PATHS.intakeCard,
    STATE_PATHS.dispatchPacket,
    STATE_PATHS.interactionMode,
    STATE_PATHS.relayBridge,
    STATE_PATHS.outcomeSnapshots,
    STATE_PATHS.sessionLanguage,
    STATE_PATHS.memoryPalace,
  ]
  const snapshot = backupFiles(trackedStateFiles)
  clearFiles(trackedStateFiles)

  let failed = false

  try {
    const nonReady = fs.readFileSync(path.resolve(repoRoot, "fixtures/intake/non-ready-mic-output.md"), "utf8")
    const ready = fs.readFileSync(path.resolve(repoRoot, "fixtures/intake/valid-ready-mic-output.md"), "utf8")

    const client = {
      app: { log: async () => {} },
      session: { prompt: async () => {} },
      tui: { toast: { show: async () => {} } },
    }

    const plugin = await OpenCodeRouterPlugin({ client })

    for (const event of buildAssistantEvents(nonReady, "assistant-msg-non-ready", "plugin-event-session", {
      pathInfo: { cwd: repoRoot, root: repoRoot },
    })) {
      await plugin.event(event)
    }
    const intakeAfterNonReady = readJsonOrNull(STATE_PATHS.intakeCard)
    const dispatchAfterNonReady = readJsonOrNull(STATE_PATHS.dispatchPacket)
    if (!intakeAfterNonReady) throw new Error("non-ready turn should write intake card")
    if (dispatchAfterNonReady) throw new Error("non-ready turn should not create dispatch packet")
    process.stdout.write("PASS: non-ready turn updates intake without creating dispatch packet\n")

    const scopeAfterAssistant = getStateScope()
    if (scopeAfterAssistant.projectKey !== buildProjectStateKey(repoRoot)) {
      throw new Error("assistant path should re-scope state to the active project root")
    }
    process.stdout.write("PASS: assistant message path re-scopes router state to the active project\n")

    const readyChunks = [
      ready.slice(0, Math.floor(ready.length / 3)),
      ready.slice(Math.floor(ready.length / 3), Math.floor((ready.length * 2) / 3)),
      ready.slice(Math.floor((ready.length * 2) / 3)),
    ]
    for (const event of buildAssistantEvents(ready, "assistant-msg-ready", "plugin-event-session", {
      pathInfo: { cwd: repoRoot, root: repoRoot },
      chunks: readyChunks,
    })) {
      await plugin.event(event)
    }
    const firstPacket = readJsonOrNull(STATE_PATHS.dispatchPacket)
    if (!firstPacket?.packet_id) throw new Error("ready turn should create dispatch packet")
    const firstReadyCount = readJsonLines(STATE_PATHS.outcomeSnapshots).filter((line) => line.kind === "intake_ready").length
    if (firstReadyCount < 1) throw new Error("ready turn should append intake_ready outcome")
    process.stdout.write("PASS: chunked ready turn creates dispatch packet and outcome snapshot\n")

    for (const event of buildAssistantEvents(ready, "assistant-msg-ready-repeat", "plugin-event-session", {
      pathInfo: { cwd: repoRoot, root: repoRoot },
      chunks: readyChunks,
    })) {
      await plugin.event(event)
    }
    const secondPacket = readJsonOrNull(STATE_PATHS.dispatchPacket)
    const secondReadyCount = readJsonLines(STATE_PATHS.outcomeSnapshots).filter((line) => line.kind === "intake_ready").length
    if (secondPacket?.packet_id !== firstPacket.packet_id) {
      throw new Error("repeated identical ready turn should not replace packet")
    }
    if (secondReadyCount !== firstReadyCount) {
      throw new Error("repeated identical ready turn should not append duplicate intake_ready snapshot")
    }
    process.stdout.write("PASS: repeated ready turn is de-duplicated\n")
  } catch (error) {
    failed = true
    process.stdout.write(`FAIL: plugin event flow :: ${error.message}\n`)
  } finally {
    restoreFiles(snapshot)
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
