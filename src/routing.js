import { LANES, RISK_LEVELS, SHAPE_KEYWORDS, WORKER_SPECIALTIES } from "./contracts.js"

function normalizeText(value) {
  return String(value || "").toLowerCase()
}

function countMatches(text, keywords) {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0)
}

function classifyTask(task) {
  const text = normalizeText(`${task.tag || ""} ${task.task || ""}`)
  const scores = Object.entries(SHAPE_KEYWORDS).map(([shape, keywords]) => ({
    shape,
    score: countMatches(text, keywords),
  }))
  scores.sort((a, b) => b.score - a.score)
  const winner = scores[0]

  if (!winner || winner.score === 0) {
    return { shape: "implementation", worker: "dev" }
  }

  const shape = winner.shape
  if (shape === "design") return { shape, worker: "desi" }
  if (shape === "docs") return { shape, worker: "doc" }
  if (shape === "map") return { shape, worker: "map" }
  if (shape === "scout") return { shape, worker: "scout" }
  if (shape === "debug") return { shape, worker: "debug" }
  if (shape === "vis") return { shape, worker: "vis" }
  if (shape === "snap") return { shape, worker: "snap" }
  if (shape === "strategy") return { shape, worker: "wise" }
  return { shape, worker: "dev" }
}

function classifyOverallShape(taskRoutes) {
  const counts = new Map()
  for (const route of taskRoutes) {
    counts.set(route.shape, (counts.get(route.shape) || 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] || "implementation"
}

function scoreRisk(packet, taskRoutes) {
  const taskCount = Array.isArray(packet?.task_list) ? packet.task_list.length : 0
  const text = normalizeText(
    `${packet?.as_is?.verbatim || ""} ${packet?.as_is?.agent_readable || ""} ${
      packet?.task_list?.map((task) => task.task).join(" ") || ""
    }`,
  )

  const highRiskSignals = [
    "architecture",
    "migration",
    "system-wide",
    "billing",
    "router",
    "memory-palace",
    "model-match",
    "delete all",
    "replace everything",
  ]
  const mediumRiskSignals = ["multi", "integrat", "plugin", "session", "state", "config"]

  if (
    taskCount >= 5 ||
    highRiskSignals.some((signal) => text.includes(signal)) ||
    taskRoutes.some((route) => route.shape === "strategy")
  ) {
    return RISK_LEVELS[2]
  }

  if (
    taskCount >= 3 ||
    mediumRiskSignals.some((signal) => text.includes(signal)) ||
    new Set(taskRoutes.map((route) => route.worker)).size >= 2
  ) {
    return RISK_LEVELS[1]
  }

  return RISK_LEVELS[0]
}

function chooseLane(shape, risk, taskRoutes) {
  const routes = Array.isArray(taskRoutes) ? taskRoutes : []
  const lowCeremonyShapes = new Set(["snap", "docs", "map"])
  const allLowCeremony = routes.length > 0 && routes.every((route) => lowCeremonyShapes.has(route.shape))

  if (shape === "strategy" || risk === "L3") return LANES[2]
  if (risk === "L1" && allLowCeremony) return LANES[0]
  if (risk === "L2") return LANES[1]
  if (["snap", "docs", "map"].includes(shape)) return LANES[0]
  return LANES[1]
}

function extractDebateTopics(tasks) {
  const debateSignals = ["option", "vs", "tradeoff", "choose", "either", "compare", "debate", "disagree"]
  return tasks
    .map((task) => String(task?.task || "").trim())
    .filter(Boolean)
    .filter((text) => debateSignals.some((signal) => normalizeText(text).includes(signal)))
    .slice(0, 4)
}

function extractAlternatives(packet) {
  const inputs = [
    packet?.as_is?.verbatim,
    packet?.as_is?.agent_readable,
    ...(Array.isArray(packet?.task_list) ? packet.task_list.map((task) => task?.task) : []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)

  const alternatives = []

  for (const text of inputs) {
    const normalized = normalizeText(text)
    if (normalized.includes(" vs ")) {
      const parts = text.split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean)
      if (parts.length >= 2) {
        alternatives.push(parts[0], parts[1])
        continue
      }
    }

    const optionPair = text.match(/option\s+([a-z0-9]+)\s+(?:vs|or)\s+option\s+([a-z0-9]+)/i)
    if (optionPair) {
      alternatives.push(`Option ${optionPair[1]}`, `Option ${optionPair[2]}`)
      continue
    }

    const eitherOr = text.match(/either\s+(.+?)\s+or\s+(.+)/i)
    if (eitherOr) {
      alternatives.push(eitherOr[1].trim(), eitherOr[2].trim())
      continue
    }
  }

  return [...new Set(alternatives.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 4)
}

function buildDisagreementMap(packet, taskRoutes, risk, lane, debateGate) {
  const enabled = debateGate?.enabled === true
  const topics = Array.isArray(debateGate?.topics) ? debateGate.topics : []
  const alternatives = extractAlternatives(packet)
  const routeWorkers = [...new Set(taskRoutes.map((route) => route.worker).filter(Boolean))]
  const advisory = []
  if (enabled) advisory.push("co-pi")
  if (enabled && risk === "L3") advisory.push("wise")

  if (!enabled) {
    return {
      enabled: false,
      status: "none",
      reason: "No unresolved disagreement to moderate.",
      topics: [],
      alternatives: [],
      unresolved_points: [],
      moderator: "pi",
      advisory_workers: [],
      round_limit: 0,
    }
  }

  const unresolvedPoints = topics.length > 0
    ? topics.map((topic) => `Resolve: ${topic}`)
    : [
        "Resolve competing route recommendations before execution lock.",
      ]

  return {
    enabled: true,
    status: "open",
    reason: debateGate?.reason || "Conflicting route options need bounded debate.",
    topics,
    alternatives: alternatives.map((label, index) => ({
      id: `alt-${index + 1}`,
      label,
      evidence: `Derived from packet context and task wording.`,
    })),
    unresolved_points: unresolvedPoints,
    moderator: "pi",
    advisory_workers: [...new Set(advisory)],
    candidate_workers: routeWorkers.slice(0, 5),
    round_limit: Number.isInteger(debateGate?.round_limit) ? debateGate.round_limit : 2,
    decision_rule: "Prefer evidence-backed option with lowest irreversible risk.",
  }
}

function buildDebateGate(packet, taskRoutes, risk, lane) {
  const text = normalizeText(
    `${packet?.as_is?.verbatim || ""} ${packet?.as_is?.agent_readable || ""} ${
      packet?.task_list?.map((task) => task.task).join(" ") || ""
    }`,
  )
  const conflictSignals = ["option", "vs", "tradeoff", "choose", "either", "compare", "debate", "disagree", "conflict"]
  const hasConflictSignal = conflictSignals.some((signal) => text.includes(signal))
  const uniqueWorkers = new Set(taskRoutes.map((route) => route.worker).filter((worker) => worker !== "snap"))
  const mixedExecutionTracks = uniqueWorkers.size >= 2
  const hasStrategyTask = taskRoutes.some((route) => route.shape === "strategy")
  const topics = extractDebateTopics(packet?.task_list || [])

  const shouldEnable = lane === "deep" && (hasConflictSignal || (hasStrategyTask && mixedExecutionTracks))
  if (!shouldEnable) {
    return {
      enabled: false,
      reason: "No high-value route disagreement detected.",
      topics: [],
      round_limit: 0,
      confidence: risk === "L3" ? "medium" : "high",
    }
  }

  return {
    enabled: true,
    reason: hasConflictSignal
      ? "Conflicting high-value options detected in packet context."
      : "Strategy-heavy deep-lane task spans multiple execution tracks.",
    topics,
    round_limit: risk === "L3" ? 3 : 2,
    confidence: risk === "L3" ? "medium" : "high",
  }
}

function chooseAdvisory(shape, risk, workerSet, debateGate) {
  const advisory = []
  if (risk === "L3" || shape === "strategy") advisory.push("wise")
  if (risk === "L2" || workerSet.size >= 3 || shape === "strategy") advisory.push("co-pi")
  if (debateGate?.enabled && !advisory.includes("co-pi")) advisory.push("co-pi")
  if (debateGate?.enabled && risk === "L3" && !advisory.includes("wise")) advisory.push("wise")
  return advisory
}

function chooseSupportWorkers(primaryWorkers, risk) {
  const support = new Set()
  const deliveryWorkers = new Set(["dev", "desi", "doc", "debug", "snap", "vis"])
  if (risk !== "L1") {
    const hasDelivery = [...primaryWorkers].some((worker) => deliveryWorkers.has(worker))
    if (hasDelivery) support.add("check")
  }
  if (primaryWorkers.has("dev") && risk !== "L1") support.add("map")
  return [...support].filter((worker) => !primaryWorkers.has(worker))
}

export function buildRoutePlan(packet) {
  const tasks = Array.isArray(packet?.task_list) ? packet.task_list : []
  const taskRoutes = tasks.map((task) => ({ ...task, ...classifyTask(task) }))
  const overallShape = classifyOverallShape(taskRoutes)
  const risk = scoreRisk(packet, taskRoutes)
  const lane = chooseLane(overallShape, risk, taskRoutes)
  const debateGate = buildDebateGate(packet, taskRoutes, risk, lane)
  const disagreementMap = buildDisagreementMap(packet, taskRoutes, risk, lane, debateGate)
  const primaryWorkers = new Set(taskRoutes.map((route) => route.worker).filter((worker) => worker !== "wise"))
  const advisory = chooseAdvisory(overallShape, risk, primaryWorkers, debateGate)
  const supportWorkers = chooseSupportWorkers(primaryWorkers, risk)

  return {
    shape: overallShape,
    risk,
    lane,
    debate_gate: debateGate,
    disagreement_map: disagreementMap,
    primary_workers: [...primaryWorkers],
    support_workers: supportWorkers,
    advisory_workers: advisory,
    task_routes: taskRoutes,
  }
}

export function buildRouteNarrative(routePlan) {
  const primary = routePlan.primary_workers.length > 0 ? routePlan.primary_workers.join(", ") : "pi"
  const support = routePlan.support_workers.length > 0 ? routePlan.support_workers.join(", ") : "none"
  const advisory = routePlan.advisory_workers.length > 0 ? routePlan.advisory_workers.join(", ") : "none"
  const debate = routePlan.debate_gate?.enabled
    ? `enabled (round_limit=${routePlan.debate_gate.round_limit})`
    : "disabled"
  const disagreement = routePlan.disagreement_map?.enabled
    ? `open (${routePlan.disagreement_map.unresolved_points?.length || 0} points)`
    : "none"
  return [
    `Shape: ${routePlan.shape}`,
    `Risk: ${routePlan.risk}`,
    `Lane: ${routePlan.lane}`,
    `Debate gate: ${debate}`,
    `Disagreement map: ${disagreement}`,
    `Primary workers: ${primary}`,
    `Support workers: ${support}`,
    `Advisory: ${advisory}`,
  ].join("\n")
}

export function buildWorkerAcknowledgement(worker) {
  const specialist = WORKER_SPECIALTIES[worker] || "general task handling"
  return `我是擅长 ${specialist} 的 ${worker}，指令已收到。`
}
