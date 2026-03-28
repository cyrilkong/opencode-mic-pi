import { ROUTER_AGENT_IDS } from "./agent-policy.js"

const RETRYABLE_ERROR_NAMES = new Set([
  "ProviderAuthError",
  "UnknownError",
  "ContextOverflowError",
  "APIError",
])

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function uniqueList(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const normalized = String(value || "").trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function normalizeModelID(modelID) {
  const value = String(modelID || "").trim()
  if (!value.includes("/")) return null
  return value
}

export function parseModelRef(modelID) {
  const value = normalizeModelID(modelID)
  if (!value) return null
  const [providerID, ...rest] = value.split("/")
  const parsedProvider = String(providerID || "").trim()
  const parsedModel = String(rest.join("/") || "").trim()
  if (!parsedProvider || !parsedModel) return null
  return { providerID: parsedProvider, modelID: parsedModel }
}

export function composeModelID(providerID, modelID) {
  const provider = String(providerID || "").trim()
  const model = String(modelID || "").trim()
  if (!provider || !model) return null
  return `${provider}/${model}`
}

export function createPromptCache() {
  return {
    byMessageID: new Map(),
    latestBySession: new Map(),
  }
}

function sanitizeTextPart(part) {
  if (!nonEmptyString(part?.text)) return null
  return {
    type: "text",
    text: String(part.text),
    synthetic: part?.synthetic === true || undefined,
    ignored: part?.ignored === true || undefined,
    metadata: part?.metadata && typeof part.metadata === "object" ? part.metadata : undefined,
  }
}

function sanitizeFilePart(part) {
  if (!nonEmptyString(part?.mime) || !nonEmptyString(part?.url)) return null
  return {
    type: "file",
    mime: String(part.mime),
    url: String(part.url),
    filename: nonEmptyString(part?.filename) ? String(part.filename) : undefined,
    source: part?.source && typeof part.source === "object" ? part.source : undefined,
  }
}

function sanitizeAgentPart(part) {
  if (!nonEmptyString(part?.name)) return null
  return {
    type: "agent",
    name: String(part.name),
    source: part?.source && typeof part.source === "object" ? part.source : undefined,
  }
}

function sanitizeSubtaskPart(part) {
  if (!nonEmptyString(part?.prompt) || !nonEmptyString(part?.description) || !nonEmptyString(part?.agent)) return null
  const model = part?.model && typeof part.model === "object"
    ? parseModelRef(composeModelID(part.model.providerID, part.model.modelID))
    : null
  return {
    type: "subtask",
    prompt: String(part.prompt),
    description: String(part.description),
    agent: String(part.agent),
    model: model || undefined,
    command: nonEmptyString(part?.command) ? String(part.command) : undefined,
  }
}

export function sanitizePromptParts(parts = []) {
  const list = Array.isArray(parts) ? parts : []
  const sanitized = []
  for (const part of list) {
    if (!part || typeof part !== "object") continue
    if (part.type === "text") {
      const next = sanitizeTextPart(part)
      if (next) sanitized.push(next)
      continue
    }
    if (part.type === "file") {
      const next = sanitizeFilePart(part)
      if (next) sanitized.push(next)
      continue
    }
    if (part.type === "agent") {
      const next = sanitizeAgentPart(part)
      if (next) sanitized.push(next)
      continue
    }
    if (part.type === "subtask") {
      const next = sanitizeSubtaskPart(part)
      if (next) sanitized.push(next)
      continue
    }
  }
  return sanitized
}

export function cachePromptSnapshot(cache, {
  sessionID,
  messageID = null,
  agent = null,
  parts = [],
  variant = null,
} = {}) {
  if (!cache || !nonEmptyString(sessionID)) return null
  const sanitizedParts = sanitizePromptParts(parts)
  if (sanitizedParts.length === 0) return null
  const snapshot = {
    sessionID: String(sessionID),
    messageID: nonEmptyString(messageID) ? String(messageID) : null,
    agent: nonEmptyString(agent) ? String(agent) : null,
    variant: nonEmptyString(variant) ? String(variant) : null,
    parts: sanitizedParts,
    captured_at: new Date().toISOString(),
  }

  cache.latestBySession.set(snapshot.sessionID, snapshot)
  if (snapshot.messageID) {
    cache.byMessageID.set(snapshot.messageID, snapshot)
  }
  return snapshot
}

export function resolvePromptSnapshot(cache, { sessionID, parentID } = {}) {
  if (!cache) return null
  if (nonEmptyString(parentID) && cache.byMessageID.has(String(parentID))) {
    return cache.byMessageID.get(String(parentID)) || null
  }
  if (nonEmptyString(sessionID) && cache.latestBySession.has(String(sessionID))) {
    return cache.latestBySession.get(String(sessionID)) || null
  }
  return null
}

export function shouldAttemptRuntimeFallback(messageInfo) {
  if (!messageInfo || typeof messageInfo !== "object") return false
  if (String(messageInfo.role || "").toLowerCase() !== "assistant") return false
  const agent = String(messageInfo.agent || "").trim()
  if (!agent || !ROUTER_AGENT_IDS.includes(agent)) return false
  const error = messageInfo.error
  if (!error || typeof error !== "object") return false
  const name = String(error.name || "").trim()
  if (!name || !RETRYABLE_ERROR_NAMES.has(name)) return false
  if (name === "APIError") {
    const retryable = error?.data?.isRetryable === true
    const statusCode = Number(error?.data?.statusCode || 0)
    if (retryable) return true
    if ([401, 403, 404, 408, 409, 429].includes(statusCode)) return true
    if (statusCode >= 500 && statusCode < 600) return true
    return false
  }
  return true
}

export function summarizeAssistantError(error) {
  if (!error || typeof error !== "object") return "(unknown assistant error)"
  const name = nonEmptyString(error?.name) ? String(error.name) : "UnknownError"
  const message = nonEmptyString(error?.data?.message) ? String(error.data.message) : ""
  const statusCode = Number(error?.data?.statusCode || 0)
  const statusPart = Number.isFinite(statusCode) && statusCode > 0 ? ` status=${statusCode}` : ""
  return `${name}${statusPart}${message ? ` ${message}` : ""}`.trim()
}

function buildAttemptKey({ sessionID, parentID, agent }) {
  const session = nonEmptyString(sessionID) ? String(sessionID) : "session"
  const parent = nonEmptyString(parentID) ? String(parentID) : "latest"
  const normalizedAgent = nonEmptyString(agent) ? String(agent) : "agent"
  return `${session}::${parent}::${normalizedAgent}`
}

function buildFallbackChain(agent, recommendation, currentModel) {
  const rolePrimary = recommendation?.roles?.[agent]?.model || null
  const roleFallbacks = Array.isArray(recommendation?.fallback?.[agent]) ? recommendation.fallback[agent] : []
  return uniqueList([currentModel, rolePrimary, ...roleFallbacks])
}

export function selectNextFallbackModel({
  recommendation,
  messageInfo,
  attemptsByKey,
} = {}) {
  const sessionID = String(messageInfo?.sessionID || "").trim()
  const parentID = String(messageInfo?.parentID || "").trim()
  const agent = String(messageInfo?.agent || "").trim()
  const currentModel = composeModelID(messageInfo?.providerID, messageInfo?.modelID)
  const key = buildAttemptKey({ sessionID, parentID, agent })
  const priorAttempts = Array.isArray(attemptsByKey?.get(key)) ? attemptsByKey.get(key) : []
  const chain = buildFallbackChain(agent, recommendation, currentModel)
  const attemptedSet = new Set(priorAttempts)
  if (currentModel) attemptedSet.add(currentModel)

  const nextModel = chain.find((modelID) => !attemptedSet.has(modelID)) || null
  const nextAttempts = uniqueList([...attemptedSet, ...(nextModel ? [nextModel] : [])])
  attemptsByKey?.set(key, nextAttempts)

  return {
    key,
    chain,
    currentModel,
    nextModel,
    attempts: nextAttempts,
    exhausted: !nextModel,
  }
}
