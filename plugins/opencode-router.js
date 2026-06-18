import { DEFAULT_PUBLIC_AGENTS, ROUTER_AGENT_IDS, ROUTER_AGENT_PROFILES } from "../src/agent-policy.js"
import { COMMAND_DEFS, createCommandHandlers } from "../src/commands.js"
import { ROUTER_COMMAND_HANDLED, ROUTER_SERVICE, createId } from "../src/contracts.js"
import {
  buildDispatchPacket,
  buildIntakeCard,
  detectReady,
  inspectIntakeParseState,
  inspectReadySignal,
  validateDispatchPacket,
} from "../src/intake.js"
import {
  appendOutcome,
  buildMemoryPalacePrompt,
  captureFrontstageAgent,
  queueBacklogRelay,
  readDispatchPacket,
  readInteractionMode,
  recordBacklogRelayResult,
  recordOrchestrationRelayResult,
  rememberAgentTurn,
  updateInteractionMode,
  readResearchMemory,
  readResumeCapsule,
  readWorkboard,
  updateWorkboardFromAgentTurn,
  writeDispatchPacket,
  writeIntakeCard,
} from "../src/memory-palace.js"
import {
  explainRecommendation,
  isAutoRematchDisabled,
  readModelDiscoveryAudit,
  recomputeAndPersistModelMatch,
  refreshVerifiedModelDiscoveryAudit,
  seedGlobalModelMatchPolicyIfMissing,
} from "../src/model-match.js"
import { inspectOpencodeOutput } from "../src/opencode-output.js"
import { configureStateScope } from "../src/paths.js"
import { getRouterPrompt } from "../src/prompt-registry.js"
import { loadRouterConfig, seedGlobalRouterConfigIfMissing } from "../src/router-config.js"
import {
  cachePromptSnapshot,
  composeModelID,
  createPromptCache,
  parseModelRef,
  resolvePromptSnapshot,
  selectNextFallbackModel,
  shouldAttemptRuntimeFallback,
  summarizeAssistantError,
} from "../src/runtime-fallback.js"
import { captureLanguageFromText } from "../src/session-language.js"

// ---------------------------------------------------------------------------
// Private helper: extract user input text from event.properties
// ---------------------------------------------------------------------------

function extractUserInputFromEventProperties(properties) {
  if (!properties || typeof properties !== "object") return ""

  const queue = [properties]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== "object") continue

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    const role = typeof current.role === "string" ? current.role.toLowerCase() : ""
    if (role === "user") {
      const { text } = inspectOpencodeOutput(current)
      if (text && text.trim()) {
        return text.trim()
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value)
      }
    }
  }

  return ""
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function parseBooleanFlag(value, fallback) {
  if (typeof value === "boolean") return value
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return fallback
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

function shouldSeedGlobalSurfaces(routerConfig = {}, env = process.env) {
  const envValue = env?.OPENCODE_ROUTER_SEED_ON_INIT
  if (typeof envValue === "string" && envValue.trim()) {
    return parseBooleanFlag(envValue, true)
  }
  return routerConfig?.seed_global_surfaces_on_init !== false
}

function shouldShowUiNotifications(routerConfig = {}, env = process.env) {
  const envValue = env?.OPENCODE_ROUTER_UI_NOTIFICATIONS
  if (typeof envValue === "string" && envValue.trim()) {
    return parseBooleanFlag(envValue, true)
  }
  return routerConfig?.ui_notifications !== false
}

function detectBacklogDrift(text) {
  const value = String(text || "").trim()
  if (!value) return false
  return /(?:\bactually\b|\binstead\b|\bchange\b|\bchanged\b|\bpriority\b|\bscope\b|\brequirement\b|\balso need\b|\badd\b|\bremove\b|\bno longer\b|另外|改成|修改|优先|范围|需求|补充|不做)/i.test(value)
}

function inferRelayStatus(text) {
  const value = String(text || "").toLowerCase()
  if (!value.trim()) return "progress"
  if (/(blocked|stuck|cannot proceed|can't proceed|waiting on|awaiting user|need user|missing access|permission denied|requires approval)/i.test(value)) {
    return "blocked"
  }
  if (/(what changed|validation|overall verdict|implemented|fixed|resolved|completed|finished|verified|rewrote|updated|created|added)/i.test(value)) {
    return "completed"
  }
  return "progress"
}

function extractAssistantInfoFromEventProperties(properties) {
  if (!properties || typeof properties !== "object") return null
  const directInfo = properties?.info
  if (directInfo && typeof directInfo === "object" && String(directInfo.role || "").toLowerCase() === "assistant") {
    return directInfo
  }

  const queue = [properties]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || typeof current !== "object") continue
    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }
    if (String(current.role || "").toLowerCase() === "assistant" && current.error) {
      return current
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value)
      }
    }
  }

  return null
}

function hasStructuredTextPart(value) {
  if (!value) return false
  if (Array.isArray(value)) {
    return value.some((item) => hasStructuredTextPart(item))
  }
  if (typeof value !== "object") return false
  if (value.type === "text" && typeof value.text === "string" && value.text.trim()) {
    return true
  }
  return Object.values(value).some((nested) => hasStructuredTextPart(nested))
}

function collectVisibleInlineTextParts(value, bucket = []) {
  if (!value) return bucket
  if (Array.isArray(value)) {
    for (const item of value) collectVisibleInlineTextParts(item, bucket)
    return bucket
  }
  if (typeof value !== "object") return bucket
  if (value.type === "text" && typeof value.text === "string" && value.text.trim() && value.synthetic !== true && value.ignored !== true) {
    bucket.push(value.text)
    return bucket
  }
  for (const nested of Object.values(value)) {
    collectVisibleInlineTextParts(nested, bucket)
  }
  return bucket
}

function extractAssistantInlineText(properties) {
  if (!properties || typeof properties !== "object") return ""
  const candidates = [
    properties?.info?.content,
    properties?.info?.parts,
    properties?.content,
    properties?.parts,
  ]
  const visibleText = []
  for (const candidate of candidates) {
    collectVisibleInlineTextParts(candidate, visibleText)
  }
  return visibleText.join("\n").trim()
}

function syncStateScopeFromAssistantInfo(assistantInfo) {
  const cwd = nonEmptyString(assistantInfo?.path?.cwd) ? String(assistantInfo.path.cwd) : null
  const root = nonEmptyString(assistantInfo?.path?.root) ? String(assistantInfo.path.root) : null
  if (!cwd && !root) return
  configureStateScope({
    project: root || cwd,
    directory: cwd,
    worktree: root || cwd,
  })
}

function packetSignature(packet) {
  if (!packet || typeof packet !== "object") return ""
  return JSON.stringify({
    source_agent: packet.source_agent || null,
    target_agent: packet.target_agent || null,
    language: packet.language || null,
    ready: packet.ready === true,
    as_is: packet.as_is || null,
    task_list: Array.isArray(packet.task_list) ? packet.task_list : [],
    questions: packet.questions || null,
  })
}

function modelRecommendationSignature(recommendation) {
  if (!recommendation || typeof recommendation !== "object") return ""
  const { generated_at: _generatedAt, recommendation_id: _recommendationID, ...stable } = recommendation
  return JSON.stringify(stable)
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, current]) => `${JSON.stringify(key)}:${stableStringify(current)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function routerConfigSignature(state) {
  if (!state || typeof state !== "object") return ""
  return stableStringify({
    source: state.source || null,
    config: state.config || {},
    errors: Array.isArray(state.errors) ? state.errors : [],
    found: state.found === true,
  })
}

function applyManagedAgentProfiles(config, routerConfig) {
  if (routerConfig?.manage_agents === false) {
    return { managedAgentIDs: [], disabledBuiltinIDs: [] }
  }

  config.agent ??= {}
  const managedAgentIDs = []
  const hideBackstage = routerConfig?.hide_backstage_agents !== false
  const publicAgents = new Set(
    (Array.isArray(routerConfig?.public_agents) && routerConfig.public_agents.length > 0
      ? routerConfig.public_agents
      : DEFAULT_PUBLIC_AGENTS)
      .map((agentID) => String(agentID || "").trim())
      .filter(Boolean),
  )

  for (const [agentID, profile] of Object.entries(ROUTER_AGENT_PROFILES)) {
    config.agent[agentID] ??= {}
    const isPublic = publicAgents.has(agentID)
    const shouldBackstage = !isPublic
    config.agent[agentID].mode = shouldBackstage ? "subagent" : profile.mode
    config.agent[agentID].prompt = getRouterPrompt(agentID)
    if (profile.description) {
      config.agent[agentID].description = profile.description
    }
    config.agent[agentID].permission = { ...profile.permission }
    config.agent[agentID].hidden = hideBackstage && (shouldBackstage || profile.mode === "subagent")
    if (agentID === "mic") {
      if (!Number.isFinite(config.agent[agentID].temperature)) {
        config.agent[agentID].temperature = 0
      }
      if (!Number.isInteger(config.agent[agentID].maxSteps) || config.agent[agentID].maxSteps <= 0) {
        config.agent[agentID].maxSteps = 2
      }
    }
    managedAgentIDs.push(agentID)
  }

  if (!config.default_agent || !publicAgents.has(config.default_agent)) {
    config.default_agent = "mic"
  }

  const disableBuiltin = Array.isArray(routerConfig?.disable_builtin_agents)
    ? routerConfig.disable_builtin_agents
    : []
  const disabledBuiltinIDs = []

  for (const builtinID of disableBuiltin) {
    if (!builtinID) continue
    config.agent[builtinID] ??= {}
    config.agent[builtinID].disable = true
    if (Object.prototype.hasOwnProperty.call(config.agent[builtinID], "mode")) {
      delete config.agent[builtinID].mode
    }
    if (Object.prototype.hasOwnProperty.call(config.agent[builtinID], "hidden")) {
      delete config.agent[builtinID].hidden
    }
    disabledBuiltinIDs.push(builtinID)
  }

  return { managedAgentIDs, disabledBuiltinIDs }
}

function applyAgentModelOverrides(config, routerConfig, recommendation, managedAgentIDs = []) {
  const roleModels = routerConfig?.role_model_preferences || {}
  if (!routerConfig?.apply_agent_model_overrides) return []

  config.agent ??= {}
  const applied = []
  const targetAgents = new Set([
    ...managedAgentIDs,
    ...Object.keys(roleModels || {}),
  ])

  for (const agentID of targetAgents) {
    if (!agentID) continue
    const modelID = recommendation?.roles?.[agentID]?.default_model || recommendation?.roles?.[agentID]?.model || null
    if (!modelID) continue
    config.agent[agentID] ??= {}
    config.agent[agentID].model = modelID
    applied.push({ agent: agentID, model: modelID })
  }

  return applied
}

function hasMemoryPalaceContextPart(parts = []) {
  return (Array.isArray(parts) ? parts : []).some(
    (part) =>
      part?.type === "text"
      && part?.metadata?.source === "opencode-router.memory-palace"
      && typeof part.text === "string"
      && part.text.includes("[Router Memory Palace]"),
  )
}

function extractVisibleTextFromParts(parts = []) {
  if (!Array.isArray(parts) || parts.length === 0) return ""
  return parts
    .filter((part) => part?.type === "text" && typeof part.text === "string" && part.synthetic !== true && part.ignored !== true)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

function stripRouterMemoryPalaceParts(parts = []) {
  if (!Array.isArray(parts)) return []
  return parts.filter(
    (part) => !(part?.type === "text" && part?.metadata?.source === "opencode-router.memory-palace"),
  )
}

function processOutgoingMessageEntry(entry, promptCache, fallbackInfo = null) {
  const baseInfo = fallbackInfo && typeof fallbackInfo === "object" ? fallbackInfo : {}
  const info = entry?.info && typeof entry.info === "object" ? entry.info : baseInfo
  const parts = Array.isArray(entry?.parts) ? entry.parts : []
  const role = nonEmptyString(info?.role) ? String(info.role) : ""
  const agentID = nonEmptyString(info?.agent) ? String(info.agent) : ""
  const sessionID = nonEmptyString(info?.sessionID) ? String(info.sessionID) : ""
  const messageID = nonEmptyString(info?.id) ? String(info.id) : (nonEmptyString(baseInfo?.id) ? String(baseInfo.id) : "")

  if (role === "user" && ["mic", "pi", "snap"].includes(agentID)) {
    captureFrontstageAgent(agentID, "user_prompt")
  }

  if (parts.length > 0) {
    const sanitizedParts = stripRouterMemoryPalaceParts(parts)
    if (sanitizedParts.length !== parts.length) {
      parts.splice(0, parts.length, ...sanitizedParts)
    }
  }

  if (sessionID && messageID && agentID && ROUTER_AGENT_IDS.includes(agentID) && !hasMemoryPalaceContextPart(parts)) {
    const continuityBlock = buildMemoryPalacePrompt(agentID)
    if (continuityBlock) {
      parts.push({
        id: createId("part"),
        sessionID,
        messageID,
        type: "text",
        text: continuityBlock,
        synthetic: true,
        ignored: true,
        metadata: {
          source: "opencode-router.memory-palace",
          agent: agentID,
        },
      })
    }
  }

  cachePromptSnapshot(promptCache, {
    sessionID,
    messageID: messageID || null,
    agent: agentID || null,
    parts,
    variant: nonEmptyString(info?.variant) ? String(info.variant) : null,
  })
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export const OpenCodeRouterPlugin = async ({ client, project, directory, worktree }) => {
  configureStateScope({ project, directory, worktree })
  let lastReadySignature = ""
  const promptCache = createPromptCache()
  const fallbackAttemptsByKey = new Map()
  const handledAssistantErrorMessages = new Set()
  const fallbackRetryCountBySessionAgent = new Map()
  const maxAutoFallbackRetriesPerSessionAgent = 3
  const assistantMessageInfoByID = new Map()
  const assistantTextStateByMessageID = new Map()

  function updateAssistantMessageText(part = {}, delta = "") {
    const messageID = nonEmptyString(part?.messageID) ? String(part.messageID) : ""
    if (!messageID) {
      return nonEmptyString(part?.text) ? String(part.text).trim() : ""
    }

    const partID = nonEmptyString(part?.id) ? String(part.id) : `text-${assistantTextStateByMessageID.size + 1}`
    const current = assistantTextStateByMessageID.get(messageID) || { order: [], parts: new Map() }
    if (!current.parts.has(partID)) current.order.push(partID)

    const explicitText = nonEmptyString(part?.text) ? String(part.text) : ""
    const previousText = current.parts.get(partID) || ""
    const nextText = explicitText || `${previousText}${typeof delta === "string" ? delta : ""}`
    current.parts.set(partID, nextText)
    assistantTextStateByMessageID.set(messageID, current)

    return current.order
      .map((id) => current.parts.get(id) || "")
      .filter((value) => String(value || "").trim())
      .join("\n")
      .trim()
  }

  let routerConfigState = loadRouterConfig()
  let modelRecommendation = null
  let appliedAgentModels = []
  let managedAgents = []
  let disabledBuiltinAgents = []
  let lastAutoRematchConfigSignature = ""
  const autoRematchDisabled = isAutoRematchDisabled()
  const seedEnabledOnInit = shouldSeedGlobalSurfaces(routerConfigState.config)
  const showToast = async (payload) => {
    if (!shouldShowUiNotifications(routerConfigState.config)) return
    if (client.tui?.toast?.show) {
      await client.tui.toast.show(payload)
    }
  }
  const seededGlobalConfigOnInit = seedEnabledOnInit ? seedGlobalRouterConfigIfMissing() : {
    created: false,
    reason: "disabled",
    path: null,
  }

  if (seededGlobalConfigOnInit?.created === true) {
    routerConfigState = loadRouterConfig()
  }

  const seededModelMatchPolicyOnInit = seedEnabledOnInit
    ? seedGlobalModelMatchPolicyIfMissing({
      routerConfig: routerConfigState.config,
    })
    : {
      created: false,
      reason: "disabled",
      path: null,
    }

  async function runSynchronousRematch({
    routerConfig,
    configSource,
    billingMode = null,
    syncRouterConfig = false,
    onResearchProgress = null,
  } = {}) {
    const audit = await refreshVerifiedModelDiscoveryAudit({
      routerConfig,
    })
    return await recomputeAndPersistModelMatch({
      routerConfig,
      configSource,
      billingMode,
      discoveryAudit: audit,
      syncRouterConfig,
      onResearchProgress,
    })
  }

  async function recomputeModelMatchFromCurrentAudit({
    routerConfig,
    configSource,
    billingMode = null,
    syncRouterConfig = false,
    onResearchProgress = null,
  } = {}) {
    return await recomputeAndPersistModelMatch({
      routerConfig,
      configSource,
      billingMode,
      discoveryAudit: readModelDiscoveryAudit(),
      syncRouterConfig,
      onResearchProgress,
    })
  }

  async function refreshModelMatch(
    reason = "auto",
    { forceDiscovery = false, billingMode = null, onResearchProgress = null } = {},
  ) {
    routerConfigState = loadRouterConfig()
    const currentConfigSignature = routerConfigSignature(routerConfigState)
    const previousSignature = modelRecommendationSignature(modelRecommendation)
    const effectiveRouterConfig = billingMode
      ? { ...routerConfigState.config, billing_mode: billingMode }
      : routerConfigState.config

    let recommendation = modelRecommendation
    let refreshMode = "discovery"

    if (forceDiscovery) {
      recommendation = await runSynchronousRematch({
        routerConfig: effectiveRouterConfig,
        configSource: routerConfigState.source,
        billingMode,
        syncRouterConfig: true,
        onResearchProgress,
      })
    } else if (autoRematchDisabled) {
      recommendation = await recomputeModelMatchFromCurrentAudit({
        routerConfig: effectiveRouterConfig,
        configSource: routerConfigState.source,
        billingMode,
        syncRouterConfig: false,
        onResearchProgress,
      })
      refreshMode = "audit_only"
    } else if (modelRecommendation && currentConfigSignature === lastAutoRematchConfigSignature) {
      refreshMode = "deduped"
    } else {
      recommendation = await runSynchronousRematch({
        routerConfig: effectiveRouterConfig,
        configSource: routerConfigState.source,
        billingMode,
        syncRouterConfig: routerConfigState.found === true,
        onResearchProgress,
      })
    }

    const nextSignature = modelRecommendationSignature(recommendation)
    const changed = previousSignature !== nextSignature
    modelRecommendation = recommendation
    if (!forceDiscovery && refreshMode === "deduped") {
      lastAutoRematchConfigSignature = currentConfigSignature
    } else {
      routerConfigState = loadRouterConfig()
      lastAutoRematchConfigSignature = routerConfigSignature(routerConfigState)
    }
    const activeRouterConfigState = routerConfigState
    await client.app.log({
      body: {
        service: ROUTER_SERVICE,
        level: refreshMode === "deduped" ? "debug" : "info",
        message:
          refreshMode === "deduped"
            ? "model-match refresh skipped (unchanged router config)"
            : changed
              ? "model-match refreshed"
              : "model-match refreshed (unchanged)",
        reason,
        changed,
        refresh_mode: refreshMode,
        auto_rematch_disabled: autoRematchDisabled,
        billing_mode: recommendation?.billing_mode || null,
        config_source: activeRouterConfigState.source || "(default)",
        config_errors: activeRouterConfigState.errors,
      },
    })
    return {
      changed,
      recommendation,
      configSource: activeRouterConfigState.source || null,
      configErrors: activeRouterConfigState.errors,
    }
  }

  async function triggerRematch(
    reason = "command",
    { billingMode = null, onResearchProgress = null } = {},
  ) {
    const allowSeed = reason === "command" && shouldSeedGlobalSurfaces(routerConfigState.config)
    const seededGlobalConfig = allowSeed ? seedGlobalRouterConfigIfMissing() : null
    const configForPolicySeed = reason === "command" ? loadRouterConfig() : routerConfigState
    const seededGlobalPolicy = allowSeed
      ? seedGlobalModelMatchPolicyIfMissing({
        routerConfig: configForPolicySeed.config,
      })
      : null
    const result = await refreshModelMatch(reason, {
      forceDiscovery: true,
      billingMode,
      onResearchProgress,
    })

    return {
      changed: result.changed,
      recommendation: result.recommendation,
      configSource: result.configSource,
      configErrors: result.configErrors,
      defaultGlobalConfigCreated: seededGlobalConfig?.created === true,
      defaultGlobalConfigPath: seededGlobalConfig?.path || null,
      defaultGlobalModelMatchPolicyCreated: seededGlobalPolicy?.created === true,
      defaultGlobalModelMatchPolicyPath: seededGlobalPolicy?.path || null,
    }
  }

  async function processAssistantTextEvent({
    text,
    diagnostics = [],
    assistantInfo = null,
    userInput = "",
  } = {}) {
    for (const diagnostic of diagnostics) {
      await client.app.log({
        body: {
          service: ROUTER_SERVICE,
          level: "warn",
          message: diagnostic.message,
          code: diagnostic.code,
        },
      })
    }

    const promptSnapshot = resolvePromptSnapshot(promptCache, {
      sessionID: assistantInfo?.sessionID || null,
      parentID: assistantInfo?.parentID || null,
    })
    const inferredAgentID =
      (nonEmptyString(assistantInfo?.agent) ? String(assistantInfo.agent) : "")
      || (nonEmptyString(promptSnapshot?.agent) ? String(promptSnapshot.agent) : "")
    const inferredSessionID =
      (nonEmptyString(assistantInfo?.sessionID) ? String(assistantInfo.sessionID) : "")
      || (nonEmptyString(promptSnapshot?.sessionID) ? String(promptSnapshot.sessionID) : "")
      || null

    if (userInput) {
      const captured = captureLanguageFromText(userInput, "user_input")
      const interactionMode = readInteractionMode()
      if (interactionMode?.frontstage_agent === "pi" && detectBacklogDrift(userInput)) {
        queueBacklogRelay({
          summary: userInput,
          packetID: readDispatchPacket()?.packet_id || null,
          sessionID: inferredSessionID,
          sourceAgent: "pi",
          targetAgent: "mic",
        })
        updateInteractionMode({
          frontstage_agent: "pi",
          active_loop: "pi_frontstage",
          last_handoff: "pi_to_mic",
          reason: "pi_backlog_drift",
        })
      }
      await client.app.log({
        body: {
          service: ROUTER_SERVICE,
          level: "info",
          message: "Captured session language from user input",
          language: captured.language,
        },
      })
    }

    const parseState = inspectIntakeParseState(text)
    const intakeCard = buildIntakeCard(text)
    if (!intakeCard) {
      if (inferredAgentID && ROUTER_AGENT_IDS.includes(inferredAgentID) && text) {
        const interactionMode = readInteractionMode()
        if (inferredAgentID === "pi") {
          if (interactionMode?.frontstage_agent === "mic") {
            updateInteractionMode({
              frontstage_agent: "mic",
              active_loop: "mic_frontstage",
              last_handoff: "mic_to_pi",
              reason: "pi_backstage_turn",
            })
            recordOrchestrationRelayResult({
              summary: text,
              packetID: readDispatchPacket()?.packet_id || null,
              sessionID: inferredSessionID,
              sourceAgent: "pi",
              targetAgent: "mic",
              status: inferRelayStatus(text),
            })
          } else {
            updateInteractionMode({
              frontstage_agent: "pi",
              active_loop: "pi_frontstage",
              reason: "pi_turn",
            })
          }
        }
        rememberAgentTurn({
          agentID: inferredAgentID,
          sessionID: inferredSessionID,
          packetID: readDispatchPacket()?.packet_id || null,
          text,
          source: "assistant_turn",
        })
        updateWorkboardFromAgentTurn({
          agentID: inferredAgentID,
          text,
          packet: readDispatchPacket(),
        })
      }
      if (parseState.hasReadySection || parseState.ready) {
        await client.app.log({
          body: {
            service: ROUTER_SERVICE,
            level: "warn",
            message: "Intake parse skipped: required sections missing",
            has_verbatim: parseState.hasVerbatim,
            has_agent_readable: parseState.hasAgentReadable,
            task_count: parseState.taskCount,
            ready_section: parseState.hasReadySection,
            ready: parseState.ready,
          },
        })
      }
      return
    }

    writeIntakeCard(intakeCard)
    const priorInteractionMode = readInteractionMode()
    const backstageMicReconcile = priorInteractionMode?.frontstage_agent === "pi"
    updateInteractionMode({
      frontstage_agent: backstageMicReconcile ? "pi" : "mic",
      active_loop: backstageMicReconcile ? "pi_frontstage" : "mic_frontstage",
      last_handoff: backstageMicReconcile ? "pi_to_mic" : priorInteractionMode?.last_handoff || null,
      reason: backstageMicReconcile ? "mic_backlog_reconcile" : (intakeCard.ready ? "mic_ready_intake" : "mic_intake"),
    })
    if (backstageMicReconcile) {
      recordBacklogRelayResult({
        summary: intakeCard.as_is?.agent_readable || `Mic reconciled backlog with ${intakeCard.task_list.length} task(s).`,
        packetID: readDispatchPacket()?.packet_id || null,
        sessionID: inferredSessionID,
        sourceAgent: "mic",
        targetAgent: "pi",
        status: intakeCard.ready ? "completed" : "progress",
      })
    }

    rememberAgentTurn({
      agentID: inferredAgentID || "mic",
      sessionID: inferredSessionID,
      packetID: readDispatchPacket()?.packet_id || null,
      text,
      source: intakeCard.ready ? "mic_ready_turn" : "mic_turn",
    })

    const readySignal = inspectReadySignal(text)
    if (readySignal.unsupportedStatus) {
      await client.app.log({
        body: {
          service: ROUTER_SERVICE,
          level: "warn",
          message: "Ready signal status token unsupported; dispatch not armed",
          status_token: readySignal.statusToken,
        },
      })
    }

    const ready = detectReady(text)
    if (!ready) return

    const packet = buildDispatchPacket(intakeCard)
    if (!packet) return
    if (validateDispatchPacket(packet).length > 0) return

    const signature = packetSignature(packet)
    const existingPacket = readDispatchPacket()
    if (signature && signature === lastReadySignature) return
    if (signature && signature === packetSignature(existingPacket)) return
    lastReadySignature = signature

    writeDispatchPacket(packet)
    captureLanguageFromText(packet.language || intakeCard.language, "dispatch_packet")

    appendOutcome({
      kind: "intake_ready",
      packet_id: packet.packet_id,
      summary: `Mic prepared a ready dispatch packet with ${packet.task_list.length} tasks.`,
    })

    await client.app.log({
      body: {
        service: ROUTER_SERVICE,
        level: "info",
        message: "Detected ready Mic handoff packet",
        packet_id: packet.packet_id,
        task_count: packet.task_list.length,
      },
    })

    await showToast({
      title: "Mic handoff ready",
      message: `${packet.task_list.length} tasks ready for /pi-dispatch`,
    })
  }

  try {
    await refreshModelMatch("init")
  } catch (error) {
    await client.app.log({
      body: {
        service: ROUTER_SERVICE,
        level: "error",
        message: "model-match refresh failed during init; continuing with last known recommendation",
        reason: "init",
        error: String(error?.message || error),
      },
    })
  }

  const commandHandlers = createCommandHandlers({ client, rematchModels: triggerRematch, showToast })

  await client.app.log({
    body: {
      service: ROUTER_SERVICE,
      level: "info",
      message: "opencode-router plugin initialized",
      billing_mode: modelRecommendation?.billing_mode || null,
      config_source: routerConfigState.source || "(default)",
      config_errors: routerConfigState.errors,
      default_global_config_created: seededGlobalConfigOnInit?.created === true,
      default_global_config_path: seededGlobalConfigOnInit?.path || null,
      default_global_model_match_policy_created: seededModelMatchPolicyOnInit?.created === true,
      default_global_model_match_policy_path: seededModelMatchPolicyOnInit?.path || null,
    },
  })

  return {
    config: async (input) => {
      try {
        await refreshModelMatch("config")
      } catch (error) {
        await client.app.log({
          body: {
            service: ROUTER_SERVICE,
            level: "error",
            message: "model-match refresh failed during config hook; continuing with last known recommendation",
            reason: "config",
            error: String(error?.message || error),
          },
        })
      }

      input.command ??= {}
      for (const [key, def] of Object.entries(COMMAND_DEFS)) {
        input.command[key] = def
      }

      const managed = applyManagedAgentProfiles(input, routerConfigState.config)
      managedAgents = managed.managedAgentIDs
      disabledBuiltinAgents = managed.disabledBuiltinIDs
      appliedAgentModels = applyAgentModelOverrides(input, routerConfigState.config, modelRecommendation, managedAgents)

      // best-effort durable sync into global OpenCode config when plugin is configuring
      // removed opencode.json sync; router preferences are persisted via router config only
    },

    "chat.message": async (input, output) => {
      if (output && !Array.isArray(output.parts)) {
        output.parts = []
      }
      const visibleUserText = extractVisibleTextFromParts(output?.parts)
      if (visibleUserText) {
        captureLanguageFromText(visibleUserText, "user_input")
      }
      processOutgoingMessageEntry(
        {
          info: output?.message || null,
          parts: Array.isArray(output?.parts) ? output.parts : [],
        },
        promptCache,
        {
          id: nonEmptyString(input?.messageID) ? String(input.messageID) : null,
          sessionID: nonEmptyString(input?.sessionID) ? String(input.sessionID) : "",
          role: "user",
          agent: nonEmptyString(input?.agent) ? String(input.agent) : "",
          variant: nonEmptyString(input?.variant) ? String(input.variant) : null,
        },
      )
    },

    "chat.params": async (input, output) => {
      if (String(input?.agent || "").trim() !== "mic") return
      output.temperature = 0
      output.topP = 1
    },

    "command.execute.before": async (input, output) => {
      const rawCommand = String(input?.command || "").trim()
      if (!rawCommand) return
      const command = rawCommand.split(/\s+/)[0]
      const handler = commandHandlers[command]
      if (!handler) return
      await handler(input)
      if (output) {
        output.parts = []
      }
      throw new Error(ROUTER_COMMAND_HANDLED)
    },

    event: async ({ event }) => {
      if (event.type === "message.updated") {
        const assistantInfo = extractAssistantInfoFromEventProperties(event.properties)
        if (assistantInfo && nonEmptyString(assistantInfo.id)) {
          assistantMessageInfoByID.set(String(assistantInfo.id), assistantInfo)
          syncStateScopeFromAssistantInfo(assistantInfo)
        }
        if (assistantInfo?.error) {
        const assistantMessageID = nonEmptyString(assistantInfo.id) ? String(assistantInfo.id) : null
        if (assistantMessageID && handledAssistantErrorMessages.has(assistantMessageID)) return
        if (!shouldAttemptRuntimeFallback(assistantInfo)) return

        if (assistantMessageID) handledAssistantErrorMessages.add(assistantMessageID)
        const sessionID = nonEmptyString(assistantInfo.sessionID) ? String(assistantInfo.sessionID) : null
        const agentID = nonEmptyString(assistantInfo.agent) ? String(assistantInfo.agent) : null
        const currentModelID = composeModelID(assistantInfo.providerID, assistantInfo.modelID)
        const errorSummary = summarizeAssistantError(assistantInfo.error)

        if (!sessionID || !agentID || !currentModelID) {
          await client.app.log({
            body: {
              service: ROUTER_SERVICE,
              level: "warn",
              message: "Runtime fallback skipped: missing assistant message routing fields",
              session_id: sessionID || null,
              agent: agentID || null,
              model: currentModelID || null,
              error: errorSummary,
            },
          })
          return
        }

        const retryGuardKey = `${sessionID}::${agentID}`
        const retryCount = fallbackRetryCountBySessionAgent.get(retryGuardKey) || 0
        if (retryCount >= maxAutoFallbackRetriesPerSessionAgent) {
          appendOutcome({
            kind: "model_fallback_guard",
            packet_id: null,
            summary: `Runtime fallback guard reached for ${agentID}; retries paused.`,
          })
          await client.app.log({
            body: {
              service: ROUTER_SERVICE,
              level: "warn",
              message: "Runtime fallback guard reached",
              session_id: sessionID,
              agent: agentID,
              retries: retryCount,
            },
          })
          return
        }

        const pick = selectNextFallbackModel({
          recommendation: modelRecommendation,
          messageInfo: assistantInfo,
          attemptsByKey: fallbackAttemptsByKey,
        })
        if (!pick.nextModel) {
          appendOutcome({
            kind: "model_fallback_exhausted",
            packet_id: null,
            summary: `Fallback exhausted for ${agentID} after error: ${errorSummary}`,
          })
          await client.app.log({
            body: {
              service: ROUTER_SERVICE,
              level: "warn",
              message: "Runtime fallback exhausted",
              session_id: sessionID,
              agent: agentID,
              current_model: currentModelID,
              attempts: pick.attempts,
              chain: pick.chain,
              error: errorSummary,
            },
          })
          return
        }

        const nextModelRef = parseModelRef(pick.nextModel)
        if (!nextModelRef) {
          appendOutcome({
            kind: "model_fallback_invalid",
            packet_id: null,
            summary: `Fallback skipped for ${agentID}: invalid model id ${pick.nextModel}`,
          })
          return
        }

        const promptSnapshot = resolvePromptSnapshot(promptCache, {
          sessionID,
          parentID: assistantInfo.parentID || null,
        })
        if (!promptSnapshot?.parts?.length) {
          appendOutcome({
            kind: "model_fallback_prompt_missing",
            packet_id: null,
            summary: `Fallback skipped for ${agentID}: no cached prompt parts.`,
          })
          await client.app.log({
            body: {
              service: ROUTER_SERVICE,
              level: "warn",
              message: "Runtime fallback skipped: missing prompt snapshot",
              session_id: sessionID,
              agent: agentID,
              parent_id: assistantInfo.parentID || null,
            },
          })
          return
        }

        try {
          await client.session.prompt({
            path: { id: sessionID },
            body: {
              messageID: nonEmptyString(assistantInfo.parentID) ? String(assistantInfo.parentID) : undefined,
              agent: agentID,
              model: nextModelRef,
              variant: promptSnapshot.variant || undefined,
              parts: promptSnapshot.parts,
            },
          })
          fallbackRetryCountBySessionAgent.set(retryGuardKey, retryCount + 1)
          appendOutcome({
            kind: "model_fallback",
            packet_id: null,
            summary: `Auto-retry for ${agentID}: ${currentModelID} -> ${pick.nextModel} (${errorSummary})`,
          })
          await client.app.log({
            body: {
              service: ROUTER_SERVICE,
              level: "info",
              message: "Runtime fallback retry submitted",
              session_id: sessionID,
              agent: agentID,
              from_model: currentModelID,
              to_model: pick.nextModel,
              error: errorSummary,
              attempt_index: retryCount + 1,
            },
          })
          await showToast({
            title: "Model fallback",
            message: `${agentID}: ${currentModelID} -> ${pick.nextModel}`,
          })
        } catch (error) {
          appendOutcome({
            kind: "model_fallback_failed",
            packet_id: null,
            summary: `Fallback submit failed for ${agentID}: ${error?.message || "unknown error"}`,
          })
          await client.app.log({
            body: {
              service: ROUTER_SERVICE,
              level: "warn",
              message: "Runtime fallback retry submission failed",
              session_id: sessionID,
              agent: agentID,
              from_model: currentModelID,
              to_model: pick.nextModel,
              error: error?.message || "unknown error",
            },
          })
        }
        return
        }

        const inlineText = extractAssistantInlineText(event.properties)
        if (!inlineText) {
          return
        }

        const userInput = extractUserInputFromEventProperties(event.properties)
        await processAssistantTextEvent({
          text: inlineText,
          diagnostics: [],
          assistantInfo,
          userInput,
        })
        return
      }

      if (event.type === "message.removed") {
        if (nonEmptyString(event?.properties?.messageID)) {
          assistantMessageInfoByID.delete(String(event.properties.messageID))
          assistantTextStateByMessageID.delete(String(event.properties.messageID))
        }
        return
      }

      if (event.type !== "message.part.updated") return
      const part = event?.properties?.part
      const hasTextPayload = nonEmptyString(part?.text) || nonEmptyString(event?.properties?.delta)
      if (!part || part.type !== "text" || !hasTextPayload || part.ignored === true || part.synthetic === true) {
        return
      }
      const cachedInfo = nonEmptyString(part.messageID)
        ? assistantMessageInfoByID.get(String(part.messageID)) || null
        : null
      if (cachedInfo && String(cachedInfo.role || "").toLowerCase() === "user") {
        return
      }
      if (cachedInfo) syncStateScopeFromAssistantInfo(cachedInfo)
      const aggregatedText = updateAssistantMessageText(part, event?.properties?.delta)
      if (!aggregatedText) return
      await processAssistantTextEvent({
        text: aggregatedText,
        diagnostics: [],
        assistantInfo: cachedInfo || {
          id: nonEmptyString(part.messageID) ? String(part.messageID) : null,
          sessionID: nonEmptyString(part.sessionID) ? String(part.sessionID) : null,
          role: "assistant",
        },
      })
    },

    "shell.env": async (_input, output) => {
      if (process.env.EXA_API_KEY && !output.env.EXA_API_KEY) {
        output.env.EXA_API_KEY = process.env.EXA_API_KEY
      }
    },

    "experimental.session.compacting": async (_input, output) => {
      const packet = readDispatchPacket()
      const workboard = readWorkboard()
      const capsule = readResumeCapsule()
      const researchMemory = readResearchMemory(5)
      const recommendationText = explainRecommendation(modelRecommendation)
      const memoryPalacePrompt = buildMemoryPalacePrompt("pi")
      output.context.push("Preserve the latest Intake Card, Dispatch Packet, Workboard, and Resume Capsule.")
      if (packet?.packet_id) output.context.push(`Latest packet: ${packet.packet_id}`)
      if (workboard?.next_step) output.context.push(`Current next step: ${workboard.next_step}`)
      if (capsule?.next_step) output.context.push(`Resume hint: ${capsule.next_step}`)
      if (researchMemory.length > 0) {
        output.context.push(`Research memory: ${researchMemory.map((item) => item.summary).join(" | ")}`)
      }
      if (memoryPalacePrompt) {
        output.context.push(memoryPalacePrompt)
      }
      output.context.push(`Model-match summary: ${recommendationText}`)
      if (appliedAgentModels.length > 0) {
        output.context.push(
          `Agent model overrides: ${appliedAgentModels.map((entry) => `${entry.agent}=${entry.model}`).join(", ")}`,
        )
      }
      if (managedAgents.length > 0) {
        output.context.push(`Router-managed agents: ${managedAgents.join(", ")}`)
      }
      if (disabledBuiltinAgents.length > 0) {
        output.context.push(`Disabled builtin agents: ${disabledBuiltinAgents.join(", ")}`)
      }
    },
  }
}

export default OpenCodeRouterPlugin
