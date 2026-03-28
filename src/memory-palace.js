import { SCHEMA_VERSION, TASK_STATUS, createId } from "./contracts.js"
import { appendJsonLine, compactJsonLines, readJson, readJsonLines, writeJson } from "./fs-store.js"
import {
  buildMemoryPalacePrompt,
  getMemoryPalaceViewModel,
  readMemoryPalaceIndex,
  rememberAgentTurn,
  rememberDispatchContinuity,
} from "./memory-palace-index.js"
import { STATE_PATHS } from "./paths.js"
import { renderBookView, renderUpView } from "./presentation/commands/index.js"

const DEFAULT_WORKBOARD_STAGE = "routing_complete"
const DEFAULT_WORKBOARD_STATUS = "ready_for_pi"
const DEFAULT_NEXT_STEP = "Wait for Pi execution."
const DEFAULT_INTERACTION_FRONTSTAGE = "mic"
const DEFAULT_INTERACTION_LOOP = "mic_frontstage"
const DEFAULT_RELAY_STATUS = "idle"
const DECISION_LEDGER_LIMIT = 240
const OUTCOME_SNAPSHOTS_LIMIT = 240
const RESEARCH_MEMORY_LIMIT = 120
const RESEARCH_FOCUS_LIMIT = 5

export function readState(filePath, fallback) {
  return readJson(filePath, fallback)
}

export function writeIntakeCard(card) {
  return writeJson(STATE_PATHS.intakeCard, card)
}

export function readIntakeCard() {
  return readJson(STATE_PATHS.intakeCard, null)
}

export function writeDispatchPacket(packet) {
  return writeJson(STATE_PATHS.dispatchPacket, packet)
}

export function readDispatchPacket() {
  return readJson(STATE_PATHS.dispatchPacket, null)
}

export function writeRelayBridge(relayBridge) {
  return writeJson(STATE_PATHS.relayBridge, normalizeRelayBridge(relayBridge))
}

export function readRelayBridge() {
  return normalizeRelayBridge(readJson(STATE_PATHS.relayBridge, null))
}

export function queueOrchestrationRelay({
  summary,
  packetID = null,
  sessionID = null,
  sourceAgent = "mic",
  targetAgent = "pi",
} = {}) {
  return updateRelayBridge({
    orchestration_request: buildRelayEntry({
      kind: "orchestration_request",
      status: "pending",
      sourceAgent,
      targetAgent,
      summary,
      packetID,
      sessionID,
    }),
  })
}

export function recordOrchestrationRelayResult({
  summary,
  packetID = null,
  sessionID = null,
  sourceAgent = "pi",
  targetAgent = "mic",
  status = "progress",
} = {}) {
  return updateRelayBridge({
    orchestration_result: buildRelayEntry({
      kind: "orchestration_result",
      status,
      sourceAgent,
      targetAgent,
      summary,
      packetID,
      sessionID,
    }),
  })
}

export function queueBacklogRelay({
  summary,
  packetID = null,
  sessionID = null,
  sourceAgent = "pi",
  targetAgent = "mic",
} = {}) {
  return updateRelayBridge({
    backlog_request: buildRelayEntry({
      kind: "backlog_request",
      status: "pending",
      sourceAgent,
      targetAgent,
      summary,
      packetID,
      sessionID,
    }),
  })
}

export function recordBacklogRelayResult({
  summary,
  packetID = null,
  sessionID = null,
  sourceAgent = "mic",
  targetAgent = "pi",
  status = "progress",
} = {}) {
  return updateRelayBridge({
    backlog_result: buildRelayEntry({
      kind: "backlog_result",
      status,
      sourceAgent,
      targetAgent,
      summary,
      packetID,
      sessionID,
    }),
  })
}

export function writeInteractionMode(interactionMode) {
  return writeJson(STATE_PATHS.interactionMode, normalizeInteractionMode(interactionMode))
}

export function readInteractionMode() {
  return normalizeInteractionMode(readJson(STATE_PATHS.interactionMode, null))
}

export function updateInteractionMode(update = {}) {
  const current = readInteractionMode()
  return writeInteractionMode({
    ...current,
    ...update,
    updated_at: new Date().toISOString(),
  })
}

export function captureFrontstageAgent(agentID, reason = "frontstage_turn") {
  const frontstageAgent = normalizeFrontstageAgent(agentID)
  if (!frontstageAgent) return readInteractionMode()
  return updateInteractionMode({
    frontstage_agent: frontstageAgent,
    active_loop: deriveInteractionLoop(frontstageAgent),
    reason,
  })
}

function updateRelayBridge(update = {}) {
  const current = readRelayBridge()
  return writeRelayBridge({
    ...current,
    ...update,
    updated_at: new Date().toISOString(),
  })
}

export function createWorkboard(packet, routePlan) {
  const items = (routePlan?.task_routes || []).map((taskRoute, index) => ({
    id: taskRoute.id,
    tag: taskRoute.tag,
    title: taskRoute.task,
    owner: taskRoute.worker,
    status: index === 0 ? TASK_STATUS.ACTIVE : TASK_STATUS.PENDING,
  }))

  return normalizeWorkboard({
    schema_version: SCHEMA_VERSION,
    workboard_id: createId("wb"),
    packet_id: packet?.packet_id || null,
    stage: DEFAULT_WORKBOARD_STAGE,
    status: items.length > 0 ? "working" : DEFAULT_WORKBOARD_STATUS,
    shape: routePlan.shape,
    risk: routePlan.risk,
    lane: routePlan.lane,
    debate_gate: routePlan.debate_gate || { enabled: false, reason: "No debate gate data.", topics: [], round_limit: 0 },
    disagreement_map: routePlan.disagreement_map || { enabled: false, status: "none", reason: "No disagreement map data.", unresolved_points: [] },
    primary_workers: routePlan.primary_workers,
    support_workers: routePlan.support_workers,
    advisory_workers: routePlan.advisory_workers,
    items,
    blockers: [],
    next_step: buildNextStep(packet, routePlan),
    updated_at: new Date().toISOString(),
  })
}

export function writeWorkboard(workboard) {
  return writeJson(STATE_PATHS.workboard, normalizeWorkboard(workboard))
}

export function readWorkboard() {
  return normalizeWorkboard(readJson(STATE_PATHS.workboard, null))
}

export function appendDecision(entry) {
  const decision = appendJsonLine(STATE_PATHS.decisionLedger, {
    decision_id: createId("dec"),
    created_at: new Date().toISOString(),
    ...entry,
  })
  compactJsonLines(STATE_PATHS.decisionLedger, DECISION_LEDGER_LIMIT)
  return decision
}

export function appendOutcome(entry) {
  const snapshot = appendJsonLine(STATE_PATHS.outcomeSnapshots, {
    snapshot_id: createId("snap"),
    created_at: new Date().toISOString(),
    ...entry,
  })
  compactJsonLines(STATE_PATHS.outcomeSnapshots, OUTCOME_SNAPSHOTS_LIMIT)
  return snapshot
}

export function appendDispatchRecords(packet, routePlan) {
  const decision = appendDecision({
    kind: "route_plan",
    packet_id: packet?.packet_id || null,
    summary: `${routePlan?.lane || "standard"} lane via ${(routePlan?.primary_workers || []).join(", ") || "pi"}`,
    detail: routePlan,
  })

  const outcome = appendOutcome({
    kind: "dispatch",
    packet_id: packet?.packet_id || null,
    summary: `Packet dispatched to Pi in ${routePlan?.lane || "standard"} lane.`,
  })

  rememberDispatchKnowledge(packet, routePlan)
  rememberDisagreementKnowledge(packet, routePlan)
  rememberDispatchContinuity(packet, routePlan)

  return { decision, outcome }
}

export function buildResumeCapsule(packet, workboard) {
  const memoryFocus = readResearchMemory(RESEARCH_FOCUS_LIMIT).map((item) => item.summary)
  return normalizeResumeCapsule({
    schema_version: SCHEMA_VERSION,
    packet_id: packet?.packet_id || null,
    stage: workboard?.stage || "intake_ready",
    status: workboard?.status || "waiting",
    next_step: workboard?.next_step || DEFAULT_NEXT_STEP,
    current_focus: workboard?.items?.filter((item) => item.status !== TASK_STATUS.DONE).slice(0, 3) || [],
    memory_focus: memoryFocus,
    updated_at: new Date().toISOString(),
  }, workboard)
}

export function updateWorkboardFromAgentTurn({ agentID, text, packet = null } = {}) {
  const normalizedAgent = nonEmptyString(agentID)
  const visibleText = nonEmptyString(text)
  const workboard = readWorkboard()
  if (!workboard || !normalizedAgent || !visibleText) return null

  const nextItems = Array.isArray(workboard.items) ? workboard.items.map((item) => ({ ...item })) : []
  const ownedItems = nextItems.filter((item) => item.owner === normalizedAgent)
  if (ownedItems.length === 0) return workboard

  const signal = detectWorkSignal(visibleText)
  const activeOwned = nextItems.find((item) => item.owner === normalizedAgent && item.status === TASK_STATUS.ACTIVE)
  const candidate = activeOwned || nextItems.find((item) => item.owner === normalizedAgent && item.status === TASK_STATUS.PENDING)
  if (!candidate) return workboard

  if (candidate.status === TASK_STATUS.PENDING) {
    candidate.status = TASK_STATUS.ACTIVE
  }

  if (signal.type === "blocked") {
    candidate.status = TASK_STATUS.BLOCKED
  } else if (signal.type === "done") {
    candidate.status = TASK_STATUS.DONE
  } else {
    candidate.status = TASK_STATUS.ACTIVE
  }

  if (!nextItems.some((item) => item.status === TASK_STATUS.ACTIVE)) {
    const nextPending = nextItems.find((item) => item.status === TASK_STATUS.PENDING)
    if (nextPending && signal.type !== "blocked") {
      nextPending.status = TASK_STATUS.ACTIVE
    }
  }

  const nextBlockers = Array.isArray(workboard.blockers) ? [...workboard.blockers] : []
  if (signal.type === "blocked" && signal.blocker && !nextBlockers.includes(signal.blocker)) {
    nextBlockers.push(signal.blocker)
  }

  const updated = normalizeWorkboard({
    ...workboard,
    items: nextItems,
    blockers: nextBlockers,
    stage: deriveWorkboardStage(nextItems),
    status: deriveWorkboardStatus(nextItems, nextBlockers),
    next_step: deriveNextStep(nextItems, nextBlockers),
    updated_at: new Date().toISOString(),
  })

  writeWorkboard(updated)
  const activePacket = packet || readDispatchPacket()
  writeResumeCapsule(buildResumeCapsule(activePacket, updated))

  appendOutcome({
    kind: "workboard_progress",
    packet_id: activePacket?.packet_id || updated?.packet_id || null,
    summary: buildWorkboardProgressSummary(normalizedAgent, candidate, signal),
  })

  return updated
}

export function writeResumeCapsule(capsule) {
  return writeJson(STATE_PATHS.resumeCapsule, normalizeResumeCapsule(capsule))
}

export function readResumeCapsule() {
  return normalizeResumeCapsule(readJson(STATE_PATHS.resumeCapsule, null))
}

export function readDecisionLedger(limit = 20) {
  const size = Number.isInteger(limit) && limit > 0 ? limit : 20
  return readJsonLines(STATE_PATHS.decisionLedger).slice(-size)
}

export function readOutcomeSnapshots(limit = 20) {
  const size = Number.isInteger(limit) && limit > 0 ? limit : 20
  return readJsonLines(STATE_PATHS.outcomeSnapshots).slice(-size)
}

export function readResearchMemory(limit = 12) {
  const state = normalizeResearchMemory(readJson(STATE_PATHS.researchMemory, null))
  const size = Number.isInteger(limit) && limit > 0 ? limit : 12
  if (!state) return []
  return state.items.slice(0, size)
}

export function rememberResearchNotes(entries = [], source = "router") {
  const now = new Date().toISOString()
  const state = normalizeResearchMemory(readJson(STATE_PATHS.researchMemory, null)) || {
    schema_version: SCHEMA_VERSION,
    memory_type: "research_memory",
    updated_at: now,
    items: [],
  }

  const current = Array.isArray(state.items) ? state.items : []
  const indexed = new Map(current.map((item) => [memoryKey(item.summary), item]))
  const normalizedEntries = Array.isArray(entries) ? entries.map((entry) => normalizeMemoryNote(entry, source)).filter(Boolean) : []

  for (const note of normalizedEntries) {
    const key = memoryKey(note.summary)
    if (!key) continue
    const existing = indexed.get(key)
    if (!existing) {
      indexed.set(key, note)
      continue
    }

    indexed.set(key, {
      ...existing,
      priority: pickHigherPriority(existing.priority, note.priority),
      tags: mergeUniqueStrings(existing.tags, note.tags),
      packet_id: existing.packet_id || note.packet_id || null,
      detail: existing.detail || note.detail || "",
      source: existing.source || note.source || source,
      last_seen_at: now,
    })
  }

  const ranked = [...indexed.values()]
    .sort((a, b) => {
      const priorityDelta = priorityWeight(b.priority) - priorityWeight(a.priority)
      if (priorityDelta !== 0) return priorityDelta
      return String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || ""))
    })
    .slice(0, RESEARCH_MEMORY_LIMIT)

  const next = {
    schema_version: SCHEMA_VERSION,
    memory_type: "research_memory",
    updated_at: now,
    items: ranked,
  }
  writeJson(STATE_PATHS.researchMemory, next)
  return next.items
}

export function rememberDispatchKnowledge(packet, routePlan) {
  const notes = []
  if (packet?.as_is?.agent_readable) {
    notes.push({
      summary: packet.as_is.agent_readable,
      detail: packet?.as_is?.verbatim || "",
      priority: "critical",
      tags: ["user_requirement", routePlan?.lane || "lane_unknown"],
      packet_id: packet?.packet_id || null,
    })
  }

  for (const task of Array.isArray(packet?.task_list) ? packet.task_list : []) {
    if (!task?.task) continue
    notes.push({
      summary: `Task: ${task.task}`,
      priority: "high",
      tags: [task.tag || "task", "dispatch_task"],
      packet_id: packet?.packet_id || null,
    })
  }

  for (const question of Array.isArray(packet?.questions?.items) ? packet.questions.items : []) {
    notes.push({
      summary: `Question: ${question}`,
      priority: "high",
      tags: ["open_question"],
      packet_id: packet?.packet_id || null,
    })
  }

  if (routePlan?.lane || routePlan?.risk) {
    notes.push({
      summary: `Routing memory: lane=${routePlan?.lane || "standard"} risk=${routePlan?.risk || "L2"}`,
      priority: "normal",
      tags: ["route_plan", routePlan?.lane || "standard"],
      packet_id: packet?.packet_id || null,
    })
  }

  if (notes.length === 0) return []
  return rememberResearchNotes(notes, "dispatch")
}

export function buildBookView() {
  const packet = readDispatchPacket()
  const workboard = readWorkboard()
  const capsule = readResumeCapsule()
  const decisions = readDecisionLedger(8)
  const snapshots = readOutcomeSnapshots(5)
  const researchMemory = readResearchMemory(12)
  const progress = buildProgress(workboard)
  const memoryPalace = getMemoryPalaceViewModel()
  const interactionMode = readInteractionMode()
  const relayBridge = readRelayBridge()
  return renderBookView({
    packet,
    workboard,
    capsule,
    decisions,
    snapshots,
    researchMemory,
    progress,
    memoryPalace,
    interactionMode,
    relayBridge,
  })
}

export function buildUpView() {
  const workboard = readWorkboard()
  const capsule = readResumeCapsule()
  const progress = buildProgress(workboard)
  const blockers = Array.isArray(workboard?.blockers) ? workboard.blockers.length : 0
  const packetID = workboard?.packet_id || capsule?.packet_id || "(none)"
  const stage = workboard?.stage || capsule?.stage || "intake_ready"
  const status = workboard?.status || capsule?.status || "waiting"
  const lane = workboard?.lane || "(none)"
  const risk = workboard?.risk || "(none)"
  const next = capsule?.next_step || workboard?.next_step || DEFAULT_NEXT_STEP
  const researchCount = readResearchMemory(999).length
  const memoryFocus = Array.isArray(capsule?.memory_focus) ? capsule.memory_focus : []
  const memoryPalace = getMemoryPalaceViewModel()
  const interactionMode = readInteractionMode()
  const relayBridge = readRelayBridge()
  return renderUpView({
    workboard,
    capsule,
    progress,
    blockers,
    packetID,
    stage,
    status,
    lane,
    risk,
    next,
    researchCount,
    memoryFocus,
    memoryPalace,
    interactionMode,
    relayBridge,
    defaultNextStep: DEFAULT_NEXT_STEP,
  })
}

export {
  buildMemoryPalacePrompt,
  readMemoryPalaceIndex,
  rememberAgentTurn,
}

function buildNextStep(packet, routePlan) {
  const firstWorkers = (routePlan?.primary_workers || []).slice(0, 2).join(", ") || "pi"
  return `Pi should continue from packet ${packet?.packet_id || "(none)"}, start the ${routePlan?.lane || "standard"} lane, and brief ${firstWorkers} first.`
}

function deriveWorkboardStage(items = []) {
  const list = Array.isArray(items) ? items : []
  if (list.length > 0 && list.every((item) => item.status === TASK_STATUS.DONE)) return "execution_complete"
  if (list.some((item) => item.status === TASK_STATUS.ACTIVE || item.status === TASK_STATUS.BLOCKED || item.status === TASK_STATUS.DONE)) {
    return "execution_in_progress"
  }
  return DEFAULT_WORKBOARD_STAGE
}

function deriveWorkboardStatus(items = [], blockers = []) {
  const list = Array.isArray(items) ? items : []
  if (list.length > 0 && list.every((item) => item.status === TASK_STATUS.DONE)) return "completed"
  if ((Array.isArray(blockers) ? blockers.length : 0) > 0 || list.some((item) => item.status === TASK_STATUS.BLOCKED)) {
    return "blocked"
  }
  if (list.some((item) => item.status === TASK_STATUS.ACTIVE || item.status === TASK_STATUS.DONE)) return "working"
  return DEFAULT_WORKBOARD_STATUS
}

function deriveNextStep(items = [], blockers = []) {
  const list = Array.isArray(items) ? items : []
  const active = list.find((item) => item.status === TASK_STATUS.ACTIVE)
  if (active) {
    return `Continue active work: ${active.owner} on ${active.title}.`
  }
  const blocked = list.find((item) => item.status === TASK_STATUS.BLOCKED)
  if (blocked) {
    const blockerHint = Array.isArray(blockers) && blockers.length > 0 ? ` Resolve blocker: ${blockers[0]}.` : ""
    return `Unblock ${blocked.owner} on ${blocked.title}.${blockerHint}`.trim()
  }
  const pending = list.find((item) => item.status === TASK_STATUS.PENDING)
  if (pending) {
    return `Start the next queued task: ${pending.owner} on ${pending.title}.`
  }
  if (list.length > 0 && list.every((item) => item.status === TASK_STATUS.DONE)) {
    return "All routed tasks are complete. Review results and decide closure."
  }
  return DEFAULT_NEXT_STEP
}

function normalizeWorkboard(value) {
  if (!value || typeof value !== "object") return null
  const tasks = Array.isArray(value.items) ? value.items : []

  return {
    schema_version: SCHEMA_VERSION,
    workboard_id: nonEmptyString(value.workboard_id) || createId("wb"),
    packet_id: nonEmptyString(value.packet_id) || null,
    stage: nonEmptyString(value.stage) || DEFAULT_WORKBOARD_STAGE,
    status: nonEmptyString(value.status) || DEFAULT_WORKBOARD_STATUS,
    shape: nonEmptyString(value.shape) || "mixed",
    risk: nonEmptyString(value.risk) || "L2",
    lane: nonEmptyString(value.lane) || "standard",
    debate_gate: normalizeDebateGate(value.debate_gate),
    disagreement_map: normalizeDisagreementMap(value.disagreement_map),
    primary_workers: normalizeStringArray(value.primary_workers),
    support_workers: normalizeStringArray(value.support_workers),
    advisory_workers: normalizeStringArray(value.advisory_workers),
    items: tasks.map(normalizeItem).filter(Boolean),
    blockers: normalizeStringArray(value.blockers),
    next_step: nonEmptyString(value.next_step) || DEFAULT_NEXT_STEP,
    updated_at: nonEmptyString(value.updated_at) || new Date().toISOString(),
  }
}

function normalizeInteractionMode(value) {
  const frontstageAgent = normalizeFrontstageAgent(value?.frontstage_agent) || DEFAULT_INTERACTION_FRONTSTAGE
  const activeLoop = normalizeInteractionLoop(value?.active_loop) || deriveInteractionLoop(frontstageAgent)
  return {
    schema_version: SCHEMA_VERSION,
    interaction_type: "interaction_mode",
    frontstage_agent: frontstageAgent,
    active_loop: activeLoop,
    paired_backstage_agent: derivePairedBackstageAgent(activeLoop),
    last_handoff: normalizeHandoff(value?.last_handoff),
    reason: nonEmptyString(value?.reason) || "default",
    updated_at: nonEmptyString(value?.updated_at) || new Date().toISOString(),
  }
}

function normalizeRelayBridge(value) {
  return {
    schema_version: SCHEMA_VERSION,
    bridge_type: "relay_bridge",
    orchestration_request: normalizeRelayEntry(value?.orchestration_request, "orchestration_request"),
    orchestration_result: normalizeRelayEntry(value?.orchestration_result, "orchestration_result"),
    backlog_request: normalizeRelayEntry(value?.backlog_request, "backlog_request"),
    backlog_result: normalizeRelayEntry(value?.backlog_result, "backlog_result"),
    updated_at: nonEmptyString(value?.updated_at) || new Date().toISOString(),
  }
}

function normalizeResumeCapsule(value, workboard = null) {
  if (!value || typeof value !== "object") {
    if (!workboard) return null
    return {
      schema_version: SCHEMA_VERSION,
      packet_id: workboard.packet_id || null,
      stage: workboard.stage || "intake_ready",
      status: workboard.status || "waiting",
      next_step: workboard.next_step || DEFAULT_NEXT_STEP,
      current_focus: (workboard.items || []).filter((item) => item.status !== TASK_STATUS.DONE).slice(0, 3),
      memory_focus: readResearchMemory(RESEARCH_FOCUS_LIMIT).map((item) => item.summary),
      updated_at: new Date().toISOString(),
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    packet_id: nonEmptyString(value.packet_id) || nonEmptyString(workboard?.packet_id) || null,
    stage: nonEmptyString(value.stage) || nonEmptyString(workboard?.stage) || "intake_ready",
    status: nonEmptyString(value.status) || nonEmptyString(workboard?.status) || "waiting",
    next_step: nonEmptyString(value.next_step) || nonEmptyString(workboard?.next_step) || DEFAULT_NEXT_STEP,
    current_focus: Array.isArray(value.current_focus) ? value.current_focus.slice(0, 3) : [],
    memory_focus: normalizeStringArray(value.memory_focus).slice(0, RESEARCH_FOCUS_LIMIT),
    updated_at: nonEmptyString(value.updated_at) || new Date().toISOString(),
  }
}

function normalizeDebateGate(value) {
  if (!value || typeof value !== "object") {
    return { enabled: false, reason: "No debate gate data.", topics: [], round_limit: 0 }
  }
  return {
    enabled: value.enabled === true,
    reason: nonEmptyString(value.reason) || "No debate gate data.",
    topics: normalizeStringArray(value.topics),
    round_limit: Number.isInteger(value.round_limit) ? Math.max(0, value.round_limit) : 0,
  }
}

function normalizeDisagreementMap(value) {
  if (!value || typeof value !== "object") {
    return {
      enabled: false,
      status: "none",
      reason: "No disagreement map data.",
      unresolved_points: [],
      alternatives: [],
      moderator: "pi",
      advisory_workers: [],
      round_limit: 0,
      decision_rule: "",
    }
  }
  return {
    enabled: value.enabled === true,
    status: nonEmptyString(value.status) || (value.enabled ? "open" : "none"),
    reason: nonEmptyString(value.reason) || "No disagreement map data.",
    unresolved_points: normalizeStringArray(value.unresolved_points).slice(0, 8),
    alternatives: Array.isArray(value.alternatives)
      ? value.alternatives
          .map((item, index) => ({
            id: nonEmptyString(item?.id) || `alt-${index + 1}`,
            label: nonEmptyString(item?.label),
          }))
          .filter((item) => item.label)
      : [],
    moderator: nonEmptyString(value.moderator) || "pi",
    advisory_workers: normalizeStringArray(value.advisory_workers).slice(0, 4),
    round_limit: Number.isInteger(value.round_limit) ? Math.max(0, value.round_limit) : 0,
    decision_rule: nonEmptyString(value.decision_rule) || "",
  }
}

function normalizeItem(item, index) {
  if (!item || typeof item !== "object") return null
  return {
    id: nonEmptyString(item.id) || `item-${index + 1}`,
    tag: nonEmptyString(item.tag) || null,
    title: nonEmptyString(item.title) || nonEmptyString(item.task) || "(untitled task)",
    owner: nonEmptyString(item.owner) || "pi",
    status: normalizeStatus(item.status),
  }
}

function normalizeStatus(value) {
  const allowed = new Set(Object.values(TASK_STATUS))
  return allowed.has(value) ? value : TASK_STATUS.PENDING
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => nonEmptyString(item)).filter(Boolean)
}

function normalizeFrontstageAgent(value) {
  const normalized = nonEmptyString(value).toLowerCase()
  if (["mic", "pi", "snap"].includes(normalized)) return normalized
  return ""
}

function normalizeInteractionLoop(value) {
  const normalized = nonEmptyString(value).toLowerCase()
  if (["mic_frontstage", "pi_frontstage", "snap_direct"].includes(normalized)) return normalized
  return ""
}

function deriveInteractionLoop(frontstageAgent) {
  if (frontstageAgent === "pi") return "pi_frontstage"
  if (frontstageAgent === "snap") return "snap_direct"
  return "mic_frontstage"
}

function derivePairedBackstageAgent(activeLoop) {
  if (activeLoop === "mic_frontstage") return "pi"
  if (activeLoop === "pi_frontstage") return "mic"
  return null
}

function normalizeHandoff(value) {
  const normalized = nonEmptyString(value).toLowerCase()
  if (["mic_to_pi", "pi_to_mic"].includes(normalized)) return normalized
  return null
}

function buildRelayEntry({
  kind,
  status = "pending",
  sourceAgent,
  targetAgent,
  summary,
  packetID = null,
  sessionID = null,
} = {}) {
  return normalizeRelayEntry({
    relay_id: createId("relay"),
    kind,
    status,
    source_agent: sourceAgent,
    target_agent: targetAgent,
    summary,
    packet_id: packetID,
    session_id: sessionID,
    updated_at: new Date().toISOString(),
  }, kind)
}

function normalizeRelayEntry(value, fallbackKind = "relay") {
  if (!value || typeof value !== "object") return null
  const summary = nonEmptyString(value.summary)
  if (!summary) return null
  return {
    relay_id: nonEmptyString(value.relay_id) || createId("relay"),
    kind: nonEmptyString(value.kind) || fallbackKind,
    status: normalizeRelayStatus(value.status),
    source_agent: normalizeFrontstageAgent(value.source_agent) || nonEmptyString(value.source_agent) || "mic",
    target_agent: normalizeFrontstageAgent(value.target_agent) || nonEmptyString(value.target_agent) || "pi",
    summary,
    packet_id: nonEmptyString(value.packet_id) || null,
    session_id: nonEmptyString(value.session_id) || null,
    updated_at: nonEmptyString(value.updated_at) || new Date().toISOString(),
  }
}

function normalizeRelayStatus(value) {
  const normalized = nonEmptyString(value).toLowerCase()
  if (["idle", "pending", "progress", "completed", "blocked"].includes(normalized)) return normalized
  return DEFAULT_RELAY_STATUS
}

function nonEmptyString(value) {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return trimmed || ""
}

function buildProgress(workboard) {
  const items = Array.isArray(workboard?.items) ? workboard.items : []
  const total = items.length
  const done = items.filter((item) => item.status === TASK_STATUS.DONE).length
  const active = items.filter((item) => item.status === TASK_STATUS.ACTIVE).length
  const blocked = items.filter((item) => item.status === TASK_STATUS.BLOCKED).length
  return { total, done, active, blocked }
}

function normalizeResearchMemory(value) {
  if (!value || typeof value !== "object") return null
  const items = Array.isArray(value.items) ? value.items.map((item) => normalizeMemoryNote(item, "state")).filter(Boolean) : []
  return {
    schema_version: SCHEMA_VERSION,
    memory_type: "research_memory",
    updated_at: nonEmptyString(value.updated_at) || new Date().toISOString(),
    items,
  }
}

function detectWorkSignal(text) {
  const value = nonEmptyString(text).toLowerCase()
  if (!value) return { type: "progress", blocker: "" }

  if (
    /(blocked|stuck|cannot proceed|can't proceed|waiting on|awaiting user|need user|needs user|missing access|permission denied|requires approval)/i.test(value)
  ) {
    return {
      type: "blocked",
      blocker: extractBlockerLine(text),
    }
  }

  if (
    /(what changed|validation|overall verdict|implemented|fixed|resolved|completed|finished|verified|rewrote|updated|created|added)/i.test(value)
  ) {
    return { type: "done", blocker: "" }
  }

  return { type: "progress", blocker: "" }
}

function extractBlockerLine(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => nonEmptyString(line))
    .filter(Boolean)
  const match = lines.find((line) =>
    /(blocked|stuck|cannot proceed|can't proceed|waiting on|awaiting user|need user|needs user|missing access|permission denied|requires approval)/i.test(line),
  )
  return match || "Execution is blocked and needs follow-up."
}

function buildWorkboardProgressSummary(agentID, item, signal) {
  const title = nonEmptyString(item?.title) || "task"
  if (signal.type === "blocked") {
    return `${agentID} is blocked on ${title}.`
  }
  if (signal.type === "done") {
    return `${agentID} completed ${title}.`
  }
  return `${agentID} is actively working on ${title}.`
}

function normalizeMemoryNote(value, fallbackSource = "router") {
  if (!value || typeof value !== "object") return null
  const summary = nonEmptyString(value.summary)
  if (!summary) return null
  const now = new Date().toISOString()
  return {
    note_id: nonEmptyString(value.note_id) || createId("rmem"),
    summary,
    detail: nonEmptyString(value.detail) || "",
    priority: normalizePriority(value.priority),
    tags: normalizeStringArray(value.tags).slice(0, 8),
    packet_id: nonEmptyString(value.packet_id) || null,
    source: nonEmptyString(value.source) || fallbackSource,
    created_at: nonEmptyString(value.created_at) || now,
    last_seen_at: nonEmptyString(value.last_seen_at) || now,
  }
}

function memoryKey(summary) {
  return nonEmptyString(summary).toLowerCase()
}

function normalizePriority(value) {
  const normalized = nonEmptyString(value).toLowerCase()
  if (normalized === "critical" || normalized === "high" || normalized === "normal") return normalized
  return "normal"
}

function priorityWeight(priority) {
  if (priority === "critical") return 3
  if (priority === "high") return 2
  return 1
}

function pickHigherPriority(a, b) {
  return priorityWeight(a) >= priorityWeight(b) ? normalizePriority(a) : normalizePriority(b)
}

function mergeUniqueStrings(a = [], b = []) {
  const merged = [...normalizeStringArray(a), ...normalizeStringArray(b)]
  return [...new Set(merged)]
}

function rememberDisagreementKnowledge(packet, routePlan) {
  const disagreementMap = routePlan?.disagreement_map
  if (!disagreementMap?.enabled) return []

  const notes = []
  for (const unresolved of disagreementMap.unresolved_points || []) {
    notes.push({
      summary: `Unresolved disagreement: ${unresolved}`,
      priority: "critical",
      tags: ["disagreement", "open_decision"],
      packet_id: packet?.packet_id || null,
    })
  }

  for (const alternative of disagreementMap.alternatives || []) {
    notes.push({
      summary: `Alternative: ${alternative.label}`,
      priority: "high",
      tags: ["disagreement_option", "route_choice"],
      packet_id: packet?.packet_id || null,
    })
  }

  if (notes.length === 0) return []
  return rememberResearchNotes(notes, "disagreement_map")
}
