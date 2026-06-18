const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

function buildAssistantEvent({ text, agent, sessionID = "relay-session", parentID = "relay-user-1", id = "relay-assistant-1" }) {
  return {
    event: {
      type: "message.updated",
      properties: {
        info: {
          id,
          sessionID,
          role: "assistant",
          parentID,
          agent,
          content: [{ type: "text", text }],
        },
      },
    },
  }
}

function buildUserEvent({ text, sessionID = "relay-session", id = "relay-user-2" }) {
  return {
    event: {
      type: "message.updated",
      properties: {
        id,
        sessionID,
        role: "user",
        content: [{ type: "text", text }],
      },
    },
  }
}

async function transformMessages(plugin, message, parts) {
  const normalizedMessage = {
    id: "relay-user-msg",
    sessionID: "relay-session",
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
  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-relay-home-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-relay-data-"))
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
    STATE_PATHS.intakeCard,
    STATE_PATHS.dispatchPacket,
    STATE_PATHS.workboard,
    STATE_PATHS.resumeCapsule,
    STATE_PATHS.interactionMode,
    STATE_PATHS.relayBridge,
    STATE_PATHS.decisionLedger,
    STATE_PATHS.outcomeSnapshots,
    STATE_PATHS.researchMemory,
    STATE_PATHS.memoryPalace,
    STATE_PATHS.sessionLanguage,
  ]
  const snapshot = backupFiles(trackedStateFiles)
  clearFiles(trackedStateFiles)

  let failed = false

  try {
    const readyMic = fs.readFileSync(path.resolve(repoRoot, "fixtures/intake/valid-ready-mic-output.md"), "utf8")
    const pendingMic = fs.readFileSync(path.resolve(repoRoot, "fixtures/intake/rich-pending-mic-output.md"), "utf8")

    const client = {
      app: { log: async () => {} },
      session: { prompt: async () => {} },
      tui: { toast: { show: async () => {} } },
    }
    const plugin = await OpenCodeRouterPlugin({ client })

    await plugin.event(buildAssistantEvent({
      text: readyMic,
      agent: "mic",
      parentID: "relay-user-0",
      id: "relay-mic-ready",
    }))

    try {
      await plugin["command.execute.before"]({ command: "pi-dispatch", sessionID: "relay-session" })
    } catch (error) {
      if (error?.message !== "__OPENCODE_ROUTER_COMMAND_HANDLED__") throw error
    }

    let relayBridge = JSON.parse(fs.readFileSync(STATE_PATHS.relayBridge, "utf8"))
    assert(relayBridge.orchestration_request?.status === "pending", "expected pending orchestration request after /pi-dispatch")
    assert(relayBridge.orchestration_request?.source_agent === "mic", "expected orchestration request source_agent=mic")
    assert(relayBridge.orchestration_request?.target_agent === "pi", "expected orchestration request target_agent=pi")

    await plugin.event(buildAssistantEvent({
      text: "What happened\n- Implemented the first execution step and validated the result.",
      agent: "pi",
      id: "relay-pi-progress",
    }))

    relayBridge = JSON.parse(fs.readFileSync(STATE_PATHS.relayBridge, "utf8"))
    assert(relayBridge.orchestration_result?.status === "completed", "expected pi backstage result to update orchestration relay")
    assert(relayBridge.orchestration_result?.source_agent === "pi", "expected orchestration result source_agent=pi")
    assert(relayBridge.orchestration_result?.target_agent === "mic", "expected orchestration result target_agent=mic")

    await transformMessages(
      plugin,
      {
        id: "relay-frontstage-pi",
        sessionID: "relay-session",
        role: "user",
        agent: "pi",
      },
      [{ type: "text", text: "Actually change the scope and add QA verification." }],
    )

    await plugin.event(buildUserEvent({
      text: "Actually change the scope and add QA verification.",
      sessionID: "relay-session",
    }))

    relayBridge = JSON.parse(fs.readFileSync(STATE_PATHS.relayBridge, "utf8"))
    assert(relayBridge.backlog_request?.status === "pending", "expected backlog drift to queue pi->mic relay request")
    assert(relayBridge.backlog_request?.source_agent === "pi", "expected backlog request source_agent=pi")
    assert(relayBridge.backlog_request?.target_agent === "mic", "expected backlog request target_agent=mic")

    await plugin.event(buildAssistantEvent({
      text: pendingMic,
      agent: "mic",
      id: "relay-mic-reconcile",
    }))

    relayBridge = JSON.parse(fs.readFileSync(STATE_PATHS.relayBridge, "utf8"))
    const interactionMode = JSON.parse(fs.readFileSync(STATE_PATHS.interactionMode, "utf8"))
    assert(relayBridge.backlog_result?.status === "progress", "expected mic reconcile turn to record backlog relay result")
    assert(relayBridge.backlog_result?.source_agent === "mic", "expected backlog result source_agent=mic")
    assert(relayBridge.backlog_result?.target_agent === "pi", "expected backlog result target_agent=pi")
    assert(interactionMode.frontstage_agent === "pi", "expected pi to remain frontstage during backstage mic reconcile")
    assert(interactionMode.active_loop === "pi_frontstage", "expected pi_frontstage loop after backstage mic reconcile")

    process.stdout.write("PASS: relay bridge records mic->pi orchestration and pi->mic backlog reconcile flows\n")
  } catch (error) {
    failed = true
    process.stdout.write(`FAIL: relay bridge :: ${error.message}\n`)
  } finally {
    restoreFiles(snapshot)
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
