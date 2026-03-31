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
  const { STATE_PATHS } = await import(pathsUrl)

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

    await plugin.event(buildAssistantEvent(nonReady))
    const intakeAfterNonReady = readJsonOrNull(STATE_PATHS.intakeCard)
    const dispatchAfterNonReady = readJsonOrNull(STATE_PATHS.dispatchPacket)
    if (!intakeAfterNonReady) throw new Error("non-ready turn should write intake card")
    if (dispatchAfterNonReady) throw new Error("non-ready turn should not create dispatch packet")
    process.stdout.write("PASS: non-ready turn updates intake without creating dispatch packet\n")

    await plugin.event(buildAssistantEvent(ready))
    const firstPacket = readJsonOrNull(STATE_PATHS.dispatchPacket)
    if (!firstPacket?.packet_id) throw new Error("ready turn should create dispatch packet")
    const firstReadyCount = readJsonLines(STATE_PATHS.outcomeSnapshots).filter((line) => line.kind === "intake_ready").length
    if (firstReadyCount < 1) throw new Error("ready turn should append intake_ready outcome")
    process.stdout.write("PASS: first ready turn creates dispatch packet and outcome snapshot\n")

    await plugin.event(buildAssistantEvent(ready))
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
