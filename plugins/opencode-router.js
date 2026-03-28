import { DEFAULT_PUBLIC_AGENTS, ROUTER_AGENT_IDS, ROUTER_AGENT_PROFILES } from "../src/agent-policy.js"
import { COMMAND_DEFS, createCommandHandlers } from "../src/commands.js"
import { ROUTER_SERVICE } from "../src/contracts.js"
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

  let routerConfigState = loadRouterConfig()
  let modelRecommendation = null
  let appliedAgentModels = []
  let managedAgents = []
  let disabledBuiltinAgents = []
  let lastAutoRematchConfigSignature = ""
  const autoRematchDisabled = isAutoRematchDisabled()

  async function runSynchronousRematch({
    routerConfig,
    configSource,
    billingMode = null,
    syncRouterConfig = false,
  } = {}) {
    const audit = await refreshVerifiedModelDiscoveryAudit({
      routerConfig,
    })
    return recomputeAndPersistModelMatch({
      routerConfig,
      configSource,
      billingMode,
      discoveryAudit: audit,
      syncRouterConfig,
    })
  }

  function recomputeModelMatchFromCurrentAudit({
    routerConfig,
    configSource,
    billingMode = null,
    syncRouterConfig = false,
  } = {}) {
    return recomputeAndPersistModelMatch({
      routerConfig,
      configSource,
      billingMode,
      discoveryAudit: readModelDiscoveryAudit(),
      syncRouterConfig,
    })
  }

  async function refreshModelMatch(reason = "auto", { forceDiscovery = false, billingMode = null } = {}) {
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
      })
    } else if (autoRematchDisabled) {
      recommendation = recomputeModelMatchFromCurrentAudit({
        routerConfig: effectiveRouterConfig,
        configSource: routerConfigState.source,
        billingMode,
        syncRouterConfig: false,
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

  async function triggerRematch(reason = "command", { billingMode = null } = {}) {
    const seededGlobalConfig = reason === "command" ? seedGlobalRouterConfigIfMissing() : null
    const result = await refreshModelMatch(reason, { forceDiscovery: true, billingMode })

    return {
      changed: result.changed,
      recommendation: result.recommendation,
      configSource: result.configSource,
      configErrors: result.configErrors,
      defaultGlobalConfigCreated: seededGlobalConfig?.created === true,
      defaultGlobalConfigPath: seededGlobalConfig?.path || null,
    }
  }

  await refreshModelMatch("init")

  const commandHandlers = createCommandHandlers({ client, rematchModels: triggerRematch })

  await client.app.log({
    body: {
      service: ROUTER_SERVICE,
      level: "info",
      message: "opencode-router plugin initialized",
      billing_mode: modelRecommendation?.billing_mode || null,
      config_source: routerConfigState.source || "(default)",
      config_errors: routerConfigState.errors,
    },
  })

  return {
    config: async (input) => {
      await refreshModelMatch("config")

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
      const agentID = nonEmptyString(input?.agent) ? String(input.agent) : (nonEmptyString(output?.message?.agent) ? String(output.message.agent) : "")
      if (output?.message?.role === "user" && ["mic", "pi", "snap"].includes(agentID)) {
        captureFrontstageAgent(agentID, "user_prompt")
      }
      output.parts ??= []
      if (agentID && ROUTER_AGENT_IDS.includes(agentID) && !hasMemoryPalaceContextPart(output.parts)) {
        const continuityBlock = buildMemoryPalacePrompt(agentID)
        if (continuityBlock) {
          output.parts.push({
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
        sessionID: input?.sessionID || output?.message?.sessionID || "",
        messageID: input?.messageID || output?.message?.id || null,
        agent: input?.agent || output?.message?.agent || null,
        parts: output?.parts || [],
        variant: input?.variant || output?.message?.variant || null,
      })
    },

    "command.execute.before": async (input) => {
      const rawCommand = String(input?.command || "").trim()
      if (!rawCommand) return
      const command = rawCommand.split(/\s+/)[0]
      const handler = commandHandlers[command]
      if (!handler) return
      await handler(input)
      throw new Error("__OPENCODE_ROUTER_COMMAND_HANDLED__")
    },

    event: async ({ event }) => {
      if (event.type !== "message.updated") return
      const assistantInfo = extractAssistantInfoFromEventProperties(event.properties)
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
          if (client.tui?.toast?.show) {
            await client.tui.toast.show({
              title: "Model fallback",
              message: `${agentID}: ${currentModelID} -> ${pick.nextModel}`,
            })
          }
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

      const { text, diagnostics } = inspectOpencodeOutput(event.properties)
      const userInput = extractUserInputFromEventProperties(event.properties)

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

      if (client.tui?.toast?.show) {
        await client.tui.toast.show({
          title: "Mic handoff ready",
          message: `${packet.task_list.length} tasks ready for /pi-dispatch`,
        })
      }
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
