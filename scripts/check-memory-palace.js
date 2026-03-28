const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const commandsUrl = pathToFileURL(path.resolve(repoRoot, "src", "commands.js")).href
  const intakeUrl = pathToFileURL(path.resolve(repoRoot, "src", "intake.js")).href
  const memoryUrl = pathToFileURL(path.resolve(repoRoot, "src", "memory-palace.js")).href
  const fsStoreUrl = pathToFileURL(path.resolve(repoRoot, "src", "fs-store.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href

  const { createCommandHandlers } = await import(commandsUrl)
  const { buildIntakeCard, buildDispatchPacket } = await import(intakeUrl)
  const {
    appendDecision,
    appendOutcome,
    buildResumeCapsule,
    readMemoryPalaceIndex,
    readDecisionLedger,
    readDispatchPacket,
    readOutcomeSnapshots,
    readResumeCapsule,
    readWorkboard,
    updateWorkboardFromAgentTurn,
    writeDispatchPacket,
    writeIntakeCard,
    writeResumeCapsule,
    writeWorkboard,
  } = await import(memoryUrl)
  const { readJsonLines } = await import(fsStoreUrl)
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
  ]
  const snapshot = backupFiles(trackedStateFiles)
  clearFiles(trackedStateFiles)

  let failed = false
  const injectedMessages = []
  const client = {
    app: { log: async () => {} },
    tui: { toast: { show: async () => {} } },
    session: {
      prompt: async (payload) => {
        const text = payload?.body?.parts?.find((part) => part.type === "text")?.text || ""
        injectedMessages.push(text)
      },
    },
  }

  try {
    const intakeRaw = fs.readFileSync(path.resolve(repoRoot, "fixtures/intake/valid-ready-mic-output.md"), "utf8")
    const card = buildIntakeCard(intakeRaw)
    const packet = buildDispatchPacket(card)
    assert(packet?.packet_id, "expected fixture to produce dispatch packet")
    writeDispatchPacket(packet)

    const handlers = createCommandHandlers({ client })
    await handlers["pi-dispatch"]({ sessionID: "test-session" })

    const dispatchAfter = readDispatchPacket()
    const workboard = readWorkboard()
    const capsule = readResumeCapsule()
    const decisions = readDecisionLedger(10)
    const outcomes = readOutcomeSnapshots(10)
    const memoryPalace = readMemoryPalaceIndex()
    const interactionMode = JSON.parse(fs.readFileSync(STATE_PATHS.interactionMode, "utf8"))
    const relayBridge = JSON.parse(fs.readFileSync(STATE_PATHS.relayBridge, "utf8"))
    const researchMemory = fs.existsSync(STATE_PATHS.researchMemory)
      ? JSON.parse(fs.readFileSync(STATE_PATHS.researchMemory, "utf8"))?.items || []
      : []

    assert(Boolean(dispatchAfter?.dispatched_at), "expected dispatched_at after /pi-dispatch")
    assert(Boolean(workboard?.workboard_id), "expected workboard to be written")
    assert(Boolean(workboard?.stage), "expected workboard.stage")
    assert(Boolean(workboard?.next_step), "expected workboard.next_step")
    assert(Array.isArray(workboard?.items) && workboard.items.length > 0, "expected workboard items")
    assert(workboard.items[0]?.status === "active", "expected first dispatched item to become active")
    assert(Boolean(capsule?.stage), "expected resume capsule stage")
    assert(Boolean(capsule?.next_step), "expected resume capsule next_step")
    assert(decisions.length > 0, "expected decision ledger entry")
    assert(outcomes.length > 0, "expected outcome snapshot entry")
    assert(Array.isArray(researchMemory) && researchMemory.length > 0, "expected research memory notes")
    assert(Array.isArray(memoryPalace?.project_anchors) && memoryPalace.project_anchors.length > 0, "expected memory palace project anchors")
    assert(interactionMode.active_loop === "mic_frontstage", "expected default dispatch flow to keep mic-frontstage loop")
    assert(interactionMode.last_handoff === "mic_to_pi", "expected dispatch to record mic_to_pi handoff")
    assert(relayBridge.orchestration_request?.status === "pending", "expected dispatch to queue orchestration relay request")
    assert(
      Object.keys(memoryPalace?.agent_indexes || {}).some((agentID) => ["doc", "dev", "pi"].includes(agentID)),
      "expected memory palace to track at least one active agent index",
    )
    assert(
      decisions.some((entry) => entry.kind === "route_plan" && entry.packet_id === packet.packet_id),
      "expected route_plan decision for dispatch packet",
    )
    assert(
      outcomes.some((entry) => entry.kind === "dispatch" && entry.packet_id === packet.packet_id),
      "expected dispatch snapshot for dispatch packet",
    )
    process.stdout.write("PASS: /pi-dispatch writes workboard, resume capsule, decision, and outcome together\n")

    clearFiles([STATE_PATHS.dispatchPacket, STATE_PATHS.workboard, STATE_PATHS.resumeCapsule, STATE_PATHS.interactionMode, STATE_PATHS.relayBridge, STATE_PATHS.decisionLedger, STATE_PATHS.outcomeSnapshots, STATE_PATHS.researchMemory, STATE_PATHS.memoryPalace])
    writeIntakeCard(card)
    await handlers["pi-dispatch"]({ sessionID: "test-session" })
    const fallbackDispatch = readDispatchPacket()
    assert(Boolean(fallbackDispatch?.packet_id), "expected /pi-dispatch fallback to rebuild packet from ready intake card")
    assert(Boolean(fallbackDispatch?.dispatched_at), "expected fallback dispatch packet to be marked dispatched")
    process.stdout.write("PASS: /pi-dispatch falls back to ready intake card when dispatch packet is missing\n")

    await handlers["pi-up"]({ sessionID: "test-session" })
    const upView = injectedMessages[injectedMessages.length - 1] || ""
    const upLines = upView.split(/\r?\n/).filter(Boolean)
    assert(upView.includes("[Pi Up]"), "expected /pi-up header")
    assert(upView.includes("Loop:"), "expected /pi-up loop line")
    assert(upView.includes("Relay:"), "expected /pi-up relay line")
    assert(upView.includes("Stage:"), "expected /pi-up stage")
    assert(upView.includes("Working:"), "expected /pi-up working-state line")
    assert(upView.includes("Focus:"), "expected /pi-up focus line")
    assert(upView.includes("Next:"), "expected /pi-up next step")
    assert(upView.includes("Palace:"), "expected /pi-up memory palace status line")
    assert(upLines.length <= 13, "expected /pi-up concise output")
    process.stdout.write("PASS: /pi-up is concise and stable\n")

    await handlers["pi-book"]({ sessionID: "test-session" })
    const bookView = injectedMessages[injectedMessages.length - 1] || ""
    assert(bookView.includes("[Dispatch Packet]"), "expected /pi-book dispatch packet section")
    assert(bookView.includes("[Workboard]"), "expected /pi-book workboard section")
    assert(bookView.includes("[Disagreement Map]"), "expected /pi-book disagreement map section")
    assert(bookView.includes("[Decision Ledger]"), "expected /pi-book decision ledger section")
    assert(bookView.includes("[Outcome Snapshots]"), "expected /pi-book snapshots section")
    assert(bookView.includes("[Research Memory]"), "expected /pi-book research memory section")
    assert(bookView.includes("[Memory Palace]"), "expected /pi-book memory palace section")
    assert(bookView.includes("[Relay Bridge]"), "expected /pi-book relay bridge section")
    assert(bookView.includes("[Agent Indexes]"), "expected /pi-book agent indexes section")
    assert(bookView.includes("Interaction loop:"), "expected /pi-book interaction loop line")
    assert(bookView.includes("Frontstage agent:"), "expected /pi-book frontstage agent line")
    assert(bookView.includes("Working state:"), "expected /pi-book working-state line")
    assert(bookView.includes("Ordered revisit route:"), "expected /pi-book ordered revisit route")
    process.stdout.write("PASS: /pi-book includes packet, workboard, decisions, snapshots, research memory, and memory palace indexes\n")

    const progressed = updateWorkboardFromAgentTurn({
      agentID: workboard.items[0]?.owner,
      text: "What changed\n- Implemented the assigned work.\nValidation\n- Verified the result locally.",
      packet: readDispatchPacket(),
    })
    assert(progressed?.items?.some((item) => item.status === "done"), "expected workboard lifecycle to mark completed item as done")
    assert(progressed?.status === "working", "expected workboard to remain working while pending tasks remain")
    assert(String(progressed?.next_step || "").includes("Continue active work") || String(progressed?.next_step || "").includes("Start the next queued task"), "expected workboard next_step to advance after progress")

    const blockedOwner = progressed?.items?.find((item) => item.status === "active")?.owner || progressed?.items?.find((item) => item.status === "pending")?.owner
    const blocked = updateWorkboardFromAgentTurn({
      agentID: blockedOwner,
      text: "Blocked: waiting on user confirmation before I can proceed.",
      packet: readDispatchPacket(),
    })
    assert(blocked?.items?.some((item) => item.status === "blocked"), "expected blocked signal to mark workboard item blocked")
    assert(blocked?.status === "blocked", "expected blocked workboard status")
    assert(Array.isArray(blocked?.blockers) && blocked.blockers.length > 0, "expected blocker text to be captured")
    process.stdout.write("PASS: workboard lifecycle auto-updates active, done, and blocked states from agent turns\n")

    writeWorkboard({
      packet_id: "pkt-shape-check",
      items: [{ title: "one task" }],
      blockers: [123, "blocked by api key"],
    })
    const normalizedBoard = readWorkboard()
    assert(Boolean(normalizedBoard.stage), "expected normalized workboard stage")
    assert(Boolean(normalizedBoard.next_step), "expected normalized workboard next_step")
    assert(normalizedBoard.items[0].status === "pending", "expected normalized task status")
    assert(normalizedBoard.items[0].owner === "pi", "expected normalized task owner")

    writeResumeCapsule({ packet_id: "pkt-shape-check" })
    const normalizedCapsule = readResumeCapsule()
    assert(Boolean(normalizedCapsule.stage), "expected normalized resume capsule stage")
    assert(Boolean(normalizedCapsule.next_step), "expected normalized resume capsule next_step")
    process.stdout.write("PASS: memory-palace state shape normalization is stable\n")

    for (let index = 0; index < 300; index += 1) {
      appendDecision({ kind: "compact-test", summary: `decision-${index}` })
      appendOutcome({ kind: "compact-test", summary: `outcome-${index}` })
    }
    const decisionLines = readJsonLines(STATE_PATHS.decisionLedger)
    const outcomeLines = readJsonLines(STATE_PATHS.outcomeSnapshots)
    assert(decisionLines.length <= 240, "expected decision ledger to be compacted")
    assert(outcomeLines.length <= 240, "expected outcome snapshots to be compacted")
    process.stdout.write("PASS: memory-palace JSONL compaction keeps bounded history\n")
  } catch (error) {
    failed = true
    process.stdout.write(`FAIL: memory-palace checks :: ${error.message}\n`)
  } finally {
    restoreFiles(snapshot)
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
