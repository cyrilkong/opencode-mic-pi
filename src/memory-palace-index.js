import { ROUTER_AGENT_CATALOG } from "./agent-catalog.js"
import { SCHEMA_VERSION, TASK_STATUS, createId } from "./contracts.js"
import { readJson, readJsonLines, writeJson } from "./fs-store.js"
import { STATE_PATHS } from "./paths.js"

const PROJECT_ANCHOR_LIMIT = 12
const REUSABLE_FINDING_LIMIT = 18
const SOLVED_TRACK_LIMIT = 12
const AGENT_FINDING_LIMIT = 6
const AGENT_HANDOFF_LIMIT = 6
const MEMORY_PROMPT_PROJECT_LIMIT = 3
const MEMORY_PROMPT_AGENT_LIMIT = 3
const MEMORY_PROMPT_OPEN_LOOP_LIMIT = 4
const MEMORY_ROUTE_LIMIT = 5

export function readMemoryPalaceIndex() {
  return normalizeMemoryPalace(readJson(STATE_PATHS.memoryPalace, null))
}

export function writeMemoryPalaceIndex(value) {
  return writeJson(STATE_PATHS.memoryPalace, normalizeMemoryPalace(value))
}

export function rememberDispatchContinuity(packet, routePlan) {
  const state = readMemoryPalaceIndex() || createEmptyMemoryPalace()
  const now = new Date().toISOString()

  if (packet?.as_is?.agent_readable) {
    state.project_anchors = mergeMemoryEntries(state.project_anchors, [
      {
        summary: packet.as_is.agent_readable,
        priority: "critical",
        packet_id: packet?.packet_id || null,
        source: "dispatch_anchor",
      },
    ], PROJECT_ANCHOR_LIMIT, now)
  }

  const routeSummary = `Execution lane: ${routePlan?.lane || "standard"} · risk=${routePlan?.risk || "L2"}`
  state.project_anchors = mergeMemoryEntries(state.project_anchors, [
    {
      summary: routeSummary,
      priority: "high",
      packet_id: packet?.packet_id || null,
      source: "route_plan",
    },
  ], PROJECT_ANCHOR_LIMIT, now)

  state.solved_tracks = mergeMemoryEntries(state.solved_tracks, [
    {
      summary: `Prepared dispatch packet for ${routePlan?.lane || "standard"} lane orchestration.`,
      priority: "normal",
      packet_id: packet?.packet_id || null,
      source: "dispatch",
    },
  ], SOLVED_TRACK_LIMIT, now)

  for (const task of Array.isArray(packet?.task_list) ? packet.task_list : []) {
    if (!task?.task) continue
    state.project_anchors = mergeMemoryEntries(state.project_anchors, [
      {
        summary: `Task anchor: ${task.task}`,
        priority: "high",
        packet_id: packet?.packet_id || null,
        source: "dispatch_task",
      },
    ], PROJECT_ANCHOR_LIMIT, now)
  }

  const handoffsByAgent = new Map()
  for (const taskRoute of Array.isArray(routePlan?.task_routes) ? routePlan.task_routes : []) {
    const agentID = nonEmptyString(taskRoute?.worker)
    const taskText = nonEmptyString(taskRoute?.task)
    if (!agentID || !taskText) continue
    const current = handoffsByAgent.get(agentID) || []
    current.push(taskText)
    handoffsByAgent.set(agentID, current)
  }

  for (const [agentID, tasks] of handoffsByAgent.entries()) {
    const index = ensureAgentIndex(state, agentID, now)
    index.last_packet_id = packet?.packet_id || index.last_packet_id || null
    index.pending_handoffs = uniqueStrings(tasks).slice(0, AGENT_HANDOFF_LIMIT)
    if (!index.last_summary && index.pending_handoffs.length > 0) {
      index.last_summary = `Assigned ${index.pending_handoffs.length} task(s) in the current dispatch.`
    }
    index.updated_at = now
  }

  state.updated_at = now
  return writeMemoryPalaceIndex(state)
}

export function rememberAgentTurn({
  agentID,
  sessionID = null,
  packetID = null,
  text = "",
  source = "assistant_turn",
} = {}) {
  const normalizedAgent = nonEmptyString(agentID)
  const visibleText = nonEmptyString(text)
  if (!normalizedAgent || !visibleText) return readMemoryPalaceIndex() || createEmptyMemoryPalace()

  const state = readMemoryPalaceIndex() || createEmptyMemoryPalace()
  const now = new Date().toISOString()
  const index = ensureAgentIndex(state, normalizedAgent, now)
  const extracted = extractMemoryLines(visibleText)
  const summary = extracted[0] || summarizeText(visibleText)
  if (!summary) return state

  index.last_summary = summary
  index.last_session_id = nonEmptyString(sessionID) || index.last_session_id || null
  index.last_packet_id = nonEmptyString(packetID) || index.last_packet_id || null
  index.recent_findings = mergeMemoryEntries(index.recent_findings, extracted.map((line) => ({
    summary: line,
    priority: "normal",
    packet_id: nonEmptyString(packetID) || null,
    source,
    agent_id: normalizedAgent,
  })), AGENT_FINDING_LIMIT, now)
  index.updated_at = now

  state.reusable_findings = mergeMemoryEntries(state.reusable_findings, extracted.slice(0, 3).map((line) => ({
    summary: line,
    priority: "normal",
    packet_id: nonEmptyString(packetID) || null,
    source,
    agent_id: normalizedAgent,
  })), REUSABLE_FINDING_LIMIT, now)
  state.updated_at = now

  return writeMemoryPalaceIndex(state)
}

export function buildMemoryPalacePrompt(agentID) {
  const normalizedAgent = nonEmptyString(agentID)
  if (!normalizedAgent) return ""

  const state = readMemoryPalaceIndex()
  const live = readLiveContinuityState()
  const index = state?.agent_indexes?.[normalizedAgent] || null
  const projectAnchor = live.projectAnchor
    || state?.project_anchors?.[0]?.summary
    || ""
  const openLoops = uniqueStrings([
    ...live.openLoops,
  ]).slice(0, MEMORY_PROMPT_OPEN_LOOP_LIMIT)
  const orderedRoute = uniqueStrings([
    ...live.orderedRoute,
  ]).slice(0, MEMORY_ROUTE_LIMIT)
  const projectNotes = uniqueStrings([
    ...(state?.reusable_findings || []).map((entry) => entry.summary),
    ...(live.researchFocus || []),
  ]).slice(0, MEMORY_PROMPT_PROJECT_LIMIT)
  const agentFindings = uniqueStrings([
    ...(index?.recent_findings || []).map((entry) => entry.summary),
  ]).slice(0, MEMORY_PROMPT_AGENT_LIMIT)
  const pendingHandoffs = uniqueStrings([
    ...live.agentHandoffs.filter((entry) => entry.agent_id === normalizedAgent).map((entry) => entry.summary),
    ...(index?.pending_handoffs || []),
  ]).slice(0, MEMORY_PROMPT_AGENT_LIMIT)

  const lines = [
    "[Router Memory Palace]",
    projectAnchor ? `Project anchor: ${projectAnchor}` : null,
    live.interactionMode?.active_loop ? `Interaction loop: ${live.interactionMode.active_loop}` : null,
    live.interactionMode?.frontstage_agent ? `Frontstage agent: ${live.interactionMode.frontstage_agent}` : null,
    live.interactionMode?.paired_backstage_agent ? `Backstage pair: ${live.interactionMode.paired_backstage_agent}` : null,
    summarizeRelayBridge(live.relayBridge),
    `Working state: ${live.workingState.toUpperCase()}`,
    live.executionLine ? `Current execution: ${live.executionLine}` : null,
    orderedRoute.length > 0 ? "Ordered route to revisit before doing fresh discovery:" : null,
    ...(orderedRoute.length > 0 ? orderedRoute.map((line, index) => `${index + 1}. ${line}`) : []),
    openLoops.length > 0 ? "Open loops:" : null,
    ...(openLoops.length > 0 ? openLoops.map((line) => `- ${line}`) : []),
    projectNotes.length > 0 ? "Reusable project notes:" : null,
    ...(projectNotes.length > 0 ? projectNotes.map((line) => `- ${line}`) : []),
    `[Your Minimal Index: ${agentLabel(normalizedAgent)}]`,
    index?.last_summary ? `Last summary: ${index.last_summary}` : "Last summary: (none yet)",
    pendingHandoffs.length > 0 ? "Pending handoffs:" : null,
    ...(pendingHandoffs.length > 0 ? pendingHandoffs.map((line) => `- ${line}`) : []),
    agentFindings.length > 0 ? "Prior findings to reuse:" : null,
    ...(agentFindings.length > 0 ? agentFindings.map((line) => `- ${line}`) : []),
    live.workingState === "active"
      ? "Working-state rule: there is unfinished work in this project. Stay in execution mode and continue the earliest unfinished route item before starting a new broad recap, new research sweep, or optional branch. Pause only if blocked, waiting on a user-owned decision, or explicitly redirected."
      : null,
    "Continuity rule: extend existing project memory before starting fresh repo discovery or repeating prior research. Redo only when the memory is stale, contradicted, or clearly insufficient.",
    "Palace discipline: reuse the same route order on revisit; attach new facts to existing anchors and open loops instead of creating a new palace from scratch.",
  ].filter(Boolean)

  if (lines.length <= 3) return ""
  return lines.join("\n")
}

export function getMemoryPalaceViewModel() {
  const state = readMemoryPalaceIndex() || createEmptyMemoryPalace()
  const live = readLiveContinuityState()
  const indexedAgents = Object.values(state.agent_indexes || {})
    .filter((entry) => nonEmptyString(entry?.updated_at))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))

  return {
    projectAnchors: state.project_anchors || [],
    reusableFindings: state.reusable_findings || [],
    solvedTracks: state.solved_tracks || [],
    indexedAgents,
    openLoops: live.openLoops,
    orderedRoute: live.orderedRoute,
    workingState: live.workingState,
    currentFocus: live.currentFocus,
    projectAnchor: live.projectAnchor || state.project_anchors?.[0]?.summary || "",
    interactionMode: live.interactionMode,
    relayBridge: live.relayBridge,
  }
}

function readLiveContinuityState() {
  const intakeCard = readJson(STATE_PATHS.intakeCard, null)
  const dispatchPacket = readJson(STATE_PATHS.dispatchPacket, null)
  const workboard = readJson(STATE_PATHS.workboard, null)
  const resumeCapsule = readJson(STATE_PATHS.resumeCapsule, null)
  const interactionMode = readJson(STATE_PATHS.interactionMode, null)
  const relayBridge = readJson(STATE_PATHS.relayBridge, null)
  const researchMemory = readJson(STATE_PATHS.researchMemory, null)
  const decisions = readJsonLines(STATE_PATHS.decisionLedger).slice(-6)
  const outcomes = readJsonLines(STATE_PATHS.outcomeSnapshots).slice(-6)

  const packet = dispatchPacket || null
  const intake = intakeCard || null
  const projectAnchor = nonEmptyString(packet?.as_is?.agent_readable)
    || nonEmptyString(intake?.as_is?.agent_readable)
    || ""

  const stage = nonEmptyString(workboard?.stage) || nonEmptyString(resumeCapsule?.stage)
  const status = nonEmptyString(workboard?.status) || nonEmptyString(resumeCapsule?.status)
  const lane = nonEmptyString(workboard?.lane)
  const risk = nonEmptyString(workboard?.risk)
  const next = nonEmptyString(resumeCapsule?.next_step) || nonEmptyString(workboard?.next_step)

  const executionTokens = []
  if (stage) executionTokens.push(`stage=${stage}`)
  if (status) executionTokens.push(`status=${status}`)
  if (lane) executionTokens.push(`lane=${lane}`)
  if (risk) executionTokens.push(`risk=${risk}`)
  if (next) executionTokens.push(`next=${truncateText(next, 140)}`)

  const openLoops = []
  const unfinishedItems = []
  for (const blocker of Array.isArray(workboard?.blockers) ? workboard.blockers : []) {
    const line = nonEmptyString(blocker)
    if (line) openLoops.push(`Blocker: ${line}`)
  }
  for (const item of Array.isArray(workboard?.items) ? workboard.items : []) {
    if (item?.status === TASK_STATUS.DONE) continue
    const owner = nonEmptyString(item?.owner) || "pi"
    const title = nonEmptyString(item?.title)
    if (!title) continue
    const loop = `${owner}: ${title}`
    openLoops.push(loop)
    unfinishedItems.push(loop)
  }
  for (const question of Array.isArray(packet?.questions?.items) ? packet.questions.items : []) {
    const line = nonEmptyString(question)
    if (line) openLoops.push(`Question: ${line}`)
  }
  for (const unresolved of Array.isArray(workboard?.disagreement_map?.unresolved_points) ? workboard.disagreement_map.unresolved_points : []) {
    const line = nonEmptyString(unresolved)
    if (line) openLoops.push(`Disagreement: ${line}`)
  }
  if (openLoops.length === 0) {
    for (const entry of decisions) {
      const line = nonEmptyString(entry?.summary)
      if (line) openLoops.push(`Recent decision: ${line}`)
    }
  }

  const orderedRoute = uniqueStrings([
    projectAnchor ? `Anchor: ${projectAnchor}` : "",
    ...unfinishedItems,
    ...openLoops,
  ]).slice(0, MEMORY_ROUTE_LIMIT)
  const workingState = unfinishedItems.length > 0 || (nonEmptyString(packet?.packet_id) && status !== "done")
    ? "active"
    : "idle"
  const currentFocus = unfinishedItems[0] || openLoops[0] || next || ""

  const researchFocus = Array.isArray(researchMemory?.items)
    ? researchMemory.items
        .map((item) => nonEmptyString(item?.summary))
        .filter(Boolean)
        .slice(0, MEMORY_PROMPT_PROJECT_LIMIT)
    : []

  const agentHandoffs = []
  for (const item of Array.isArray(workboard?.items) ? workboard.items : []) {
    if (!nonEmptyString(item?.owner) || !nonEmptyString(item?.title)) continue
    if (item?.status === TASK_STATUS.DONE) continue
    agentHandoffs.push({
      agent_id: nonEmptyString(item.owner),
      summary: nonEmptyString(item.title),
    })
  }
  if (agentHandoffs.length === 0) {
    for (const entry of outcomes) {
      const line = nonEmptyString(entry?.summary)
      if (!line) continue
      agentHandoffs.push({ agent_id: "pi", summary: line })
    }
  }

  return {
    projectAnchor,
    executionLine: executionTokens.join(" · "),
    openLoops: uniqueStrings(openLoops),
    orderedRoute,
    workingState,
    currentFocus,
    researchFocus,
    agentHandoffs,
    interactionMode: normalizeInteractionMode(interactionMode),
    relayBridge: normalizeRelayBridge(relayBridge),
  }
}

function createEmptyMemoryPalace() {
  return {
    schema_version: SCHEMA_VERSION,
    palace_type: "memory_palace",
    updated_at: new Date().toISOString(),
    project_anchors: [],
    reusable_findings: [],
    solved_tracks: [],
    agent_indexes: {},
  }
}

function normalizeMemoryPalace(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const updatedAt = nonEmptyString(value.updated_at) || new Date().toISOString()
  const agentIndexes = value.agent_indexes && typeof value.agent_indexes === "object" && !Array.isArray(value.agent_indexes)
    ? Object.fromEntries(
        Object.entries(value.agent_indexes)
          .map(([agentID, entry]) => [agentID, normalizeAgentIndex(agentID, entry, updatedAt)])
          .filter(([, entry]) => entry),
      )
    : {}

  return {
    schema_version: SCHEMA_VERSION,
    palace_type: "memory_palace",
    updated_at: updatedAt,
    project_anchors: normalizeMemoryEntries(value.project_anchors, PROJECT_ANCHOR_LIMIT),
    reusable_findings: normalizeMemoryEntries(value.reusable_findings, REUSABLE_FINDING_LIMIT),
    solved_tracks: normalizeMemoryEntries(value.solved_tracks, SOLVED_TRACK_LIMIT),
    agent_indexes: agentIndexes,
  }
}

function normalizeInteractionMode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const frontstageAgent = nonEmptyString(value.frontstage_agent).toLowerCase()
  const activeLoop = nonEmptyString(value.active_loop).toLowerCase()
  return {
    frontstage_agent: ["mic", "pi", "snap"].includes(frontstageAgent) ? frontstageAgent : "mic",
    active_loop: ["mic_frontstage", "pi_frontstage", "snap_direct"].includes(activeLoop) ? activeLoop : "mic_frontstage",
    paired_backstage_agent: nonEmptyString(value.paired_backstage_agent) || null,
    last_handoff: nonEmptyString(value.last_handoff) || null,
    reason: nonEmptyString(value.reason) || "default",
    updated_at: nonEmptyString(value.updated_at) || new Date().toISOString(),
  }
}

function normalizeRelayBridge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return {
    orchestration_request: normalizeRelayEntry(value.orchestration_request),
    orchestration_result: normalizeRelayEntry(value.orchestration_result),
    backlog_request: normalizeRelayEntry(value.backlog_request),
    backlog_result: normalizeRelayEntry(value.backlog_result),
  }
}

function normalizeRelayEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const summary = nonEmptyString(value.summary)
  if (!summary) return null
  return {
    status: nonEmptyString(value.status) || "pending",
    source_agent: nonEmptyString(value.source_agent) || "mic",
    target_agent: nonEmptyString(value.target_agent) || "pi",
    summary,
  }
}

function summarizeRelayBridge(value) {
  if (!value) return null
  const segments = []
  if (value.orchestration_request) {
    segments.push(`Relay bridge: orchestration ${value.orchestration_request.status} ${value.orchestration_request.source_agent}->${value.orchestration_request.target_agent}`)
  } else if (value.orchestration_result) {
    segments.push(`Relay bridge: orchestration_result ${value.orchestration_result.status}`)
  }
  if (value.backlog_request) {
    segments.push(`Relay bridge: backlog ${value.backlog_request.status} ${value.backlog_request.source_agent}->${value.backlog_request.target_agent}`)
  } else if (value.backlog_result) {
    segments.push(`Relay bridge: backlog_result ${value.backlog_result.status}`)
  }
  return segments.join(" · ") || null
}

function normalizeAgentIndex(agentID, value, fallbackUpdatedAt) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return {
    agent_id: nonEmptyString(agentID) || nonEmptyString(value.agent_id) || "agent",
    last_session_id: nonEmptyString(value.last_session_id) || null,
    last_packet_id: nonEmptyString(value.last_packet_id) || null,
    last_summary: nonEmptyString(value.last_summary) || "",
    pending_handoffs: uniqueStrings(value.pending_handoffs).slice(0, AGENT_HANDOFF_LIMIT),
    recent_findings: normalizeMemoryEntries(value.recent_findings, AGENT_FINDING_LIMIT),
    updated_at: nonEmptyString(value.updated_at) || fallbackUpdatedAt || new Date().toISOString(),
  }
}

function normalizeMemoryEntries(value, limit) {
  if (!Array.isArray(value)) return []
  const now = new Date().toISOString()
  const normalized = value
    .map((entry) => normalizeMemoryEntry(entry, now))
    .filter(Boolean)
  return normalized.slice(0, limit)
}

function normalizeMemoryEntry(value, fallbackUpdatedAt) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const summary = nonEmptyString(value.summary)
  if (!summary) return null
  return {
    entry_id: nonEmptyString(value.entry_id) || createId("mp"),
    summary,
    priority: normalizePriority(value.priority),
    packet_id: nonEmptyString(value.packet_id) || null,
    source: nonEmptyString(value.source) || "memory_palace",
    agent_id: nonEmptyString(value.agent_id) || null,
    updated_at: nonEmptyString(value.updated_at) || fallbackUpdatedAt || new Date().toISOString(),
  }
}

function ensureAgentIndex(state, agentID, now) {
  if (!state.agent_indexes[agentID]) {
    state.agent_indexes[agentID] = {
      agent_id: agentID,
      last_session_id: null,
      last_packet_id: null,
      last_summary: "",
      pending_handoffs: [],
      recent_findings: [],
      updated_at: now,
    }
  }
  return state.agent_indexes[agentID]
}

function mergeMemoryEntries(currentEntries, incomingEntries, limit, now) {
  const merged = new Map()
  for (const entry of normalizeMemoryEntries(currentEntries, limit)) {
    merged.set(memoryEntryKey(entry.summary), entry)
  }
  for (const entry of Array.isArray(incomingEntries) ? incomingEntries : []) {
    const normalized = normalizeMemoryEntry(entry, now)
    if (!normalized) continue
    const key = memoryEntryKey(normalized.summary)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, normalized)
      continue
    }
    merged.set(key, {
      ...existing,
      priority: pickHigherPriority(existing.priority, normalized.priority),
      packet_id: existing.packet_id || normalized.packet_id || null,
      source: existing.source || normalized.source,
      agent_id: existing.agent_id || normalized.agent_id || null,
      updated_at: now,
    })
  }

  return [...merged.values()]
    .sort((a, b) => {
      const weight = priorityWeight(b.priority) - priorityWeight(a.priority)
      if (weight !== 0) return weight
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
    })
    .slice(0, limit)
}

function extractMemoryLines(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => stripBullet(nonEmptyString(line)))
    .filter(Boolean)
    .filter((line) => !/^```/.test(line))
    .filter((line) => !isSectionOnlyLine(line))
    .filter((line) => line.length >= 12)
    .map((line) => truncateText(line, 180))

  return uniqueStrings(lines).slice(0, AGENT_FINDING_LIMIT)
}

function summarizeText(text) {
  const compact = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!compact) return ""
  const sentence = compact.split(/(?<=[.!?])\s+/u)[0]
  return truncateText(sentence || compact, 180)
}

function stripBullet(value) {
  return String(value || "")
    .replace(/^\s*(?:[-*•]\s+|\d+\.\s+)/u, "")
    .trim()
}

function isSectionOnlyLine(line) {
  const value = String(line || "").trim()
  if (!value) return true
  if (/^\[[^\]]+\]$/.test(value)) return true
  if (/^[A-Z][A-Za-z /_-]{1,40}:?$/.test(value) && !/[.?!]/.test(value)) return true
  return false
}

function uniqueStrings(values = []) {
  const seen = new Set()
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = nonEmptyString(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function memoryEntryKey(summary) {
  return nonEmptyString(summary).toLowerCase()
}

function nonEmptyString(value) {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return trimmed || ""
}

function truncateText(value, max = 160) {
  const text = nonEmptyString(value)
  if (!text) return ""
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
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

function agentLabel(agentID) {
  return ROUTER_AGENT_CATALOG?.[agentID]?.label || agentID
}
