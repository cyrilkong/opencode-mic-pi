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

function buildAssistantEvent({ text, agent = "dev", sessionID = "continuity-session", parentID = "continuity-user-1" }) {
  return {
    event: {
      type: "message.updated",
      properties: {
        info: {
          id: "assistant-msg-1",
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

async function transformMessages(plugin, message, parts) {
  const output = {
    messages: [{ info: message, parts }],
  }
  await plugin["experimental.chat.messages.transform"]({}, output)
  return output.messages[0]
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-continuity-home-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-continuity-data-"))
  process.env.HOME = tempHome
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  process.env.OPENCODE_ROUTER_DISABLE_AUTO_REMATCH = "1"
  delete process.env.OPENCODE_ROUTER_CONFIG
  delete process.env.OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const memoryUrl = pathToFileURL(path.resolve(repoRoot, "src", "memory-palace.js")).href
  const { OpenCodeRouterPlugin } = await import(pluginUrl)
  const { STATE_PATHS } = await import(pathsUrl)
  const { readMemoryPalaceIndex } = await import(memoryUrl)

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
    const ready = fs.readFileSync(path.resolve(repoRoot, "fixtures/intake/valid-ready-mic-output.md"), "utf8")
    const client = {
      app: { log: async () => {} },
      session: { prompt: async () => {} },
      tui: { toast: { show: async () => {} } },
    }
    const plugin = await OpenCodeRouterPlugin({ client })

    await plugin.event({
      event: {
        type: "message.updated",
        properties: {
          role: "assistant",
          content: [{ type: "text", text: ready }],
        },
      },
    })

    try {
      await plugin["command.execute.before"]({ command: "pi-dispatch", sessionID: "continuity-session" })
    } catch (error) {
      if (error?.message !== "__OPENCODE_ROUTER_COMMAND_HANDLED__") throw error
    }

    const output = await transformMessages(
      plugin,
      {
        id: "continuity-user-1",
        sessionID: "continuity-session",
        role: "user",
        agent: "dev",
      },
      [{ type: "text", text: "Continue the implementation without restarting repo discovery." }],
    )

    const injectedPart = output.parts.find((part) => part?.metadata?.source === "opencode-router.memory-palace")
    assert(injectedPart, "expected hidden memory palace prompt part to be injected")
    assert(injectedPart.ignored === true, "expected memory palace part to stay hidden/ignored")
    assert(injectedPart.text.includes("[Router Memory Palace]"), "expected memory palace heading in injected part")
    assert(injectedPart.text.includes("Project anchor:"), "expected project anchor in injected part")
    assert(injectedPart.text.includes("Interaction loop:"), "expected injected part to include interaction loop")
    assert(injectedPart.text.includes("Frontstage agent:"), "expected injected part to include frontstage agent")
    assert(injectedPart.text.includes("Relay bridge:"), "expected injected part to include relay bridge state")
    assert(injectedPart.text.includes("Working state: ACTIVE"), "expected injected part to mark active working state")
    assert(injectedPart.text.includes("Ordered route to revisit before doing fresh discovery:"), "expected injected part to provide ordered route")
    assert(injectedPart.text.includes("[Your Minimal Index: Dev]"), "expected per-agent index block in injected part")
    assert(injectedPart.text.includes("Working-state rule:"), "expected injected part to carry no-interrupt working-state rule")

    await plugin.event(buildAssistantEvent({
      agent: "dev",
      text: "What changed\n- Implemented the first continuity index for same-project sessions.\nValidation\n- Verified memory is injected before follow-up work.",
    }))

    const memoryPalace = readMemoryPalaceIndex()
    assert(memoryPalace?.agent_indexes?.dev?.last_summary, "expected dev agent index to capture last summary")
    const devFindings = Array.isArray(memoryPalace?.agent_indexes?.dev?.recent_findings)
      ? memoryPalace.agent_indexes.dev.recent_findings.map((entry) => entry.summary)
      : []
    assert(
      devFindings.some((line) => /continuity index/i.test(line)),
      "expected dev agent index to retain reusable findings from prior work",
    )

    const secondOutput = await transformMessages(
      plugin,
      {
        id: "continuity-user-2",
        sessionID: "continuity-session-2",
        role: "user",
        agent: "dev",
      },
      [{ type: "text", text: "Pick up the same project again." }],
    )
    const secondInjected = secondOutput.parts.find((part) => part?.metadata?.source === "opencode-router.memory-palace")
    assert(secondInjected?.text.includes("continuity index"), "expected later session to receive prior dev continuity finding")
    assert(secondInjected?.text.includes("Working-state rule:"), "expected later session to preserve working-state guard")

    process.stdout.write("PASS: memory palace injects per-agent continuity and preserves same-project reusable findings across sessions\n")
  } catch (error) {
    failed = true
    process.stdout.write(`FAIL: memory palace continuity :: ${error.message}\n`)
  } finally {
    restoreFiles(snapshot)
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
