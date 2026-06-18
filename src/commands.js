import { COMMAND_DEFS, ROUTER_SERVICE } from "./contracts.js"
import { buildDispatchPacket, validateDispatchPacket } from "./intake.js"
import { buildRoutePlan } from "./routing.js"
import {
  appendDispatchRecords,
  buildBookView,
  buildResumeCapsule,
  buildUpView,
  queueOrchestrationRelay,
  readInteractionMode,
  createWorkboard,
  readIntakeCard,
  readDispatchPacket,
  updateInteractionMode,
  writeDispatchPacket,
  writeResumeCapsule,
  writeWorkboard,
} from "./memory-palace.js"
import { explainRecommendation, readModelMatch } from "./model-match.js"
import { renderCompactRematchView, renderDispatchBrief } from "./presentation/commands/index.js"

async function injectSessionMessage(client, sessionID, text) {
  if (!sessionID || !text) return
  await client.session.prompt({
    path: { id: sessionID },
    body: { noReply: true, parts: [{ type: "text", text, ignored: true }] },
  })
}

function normalizeBillingMode(value) {
  const text = String(value || "").trim().toLowerCase()
  if (["request", "request_billing", "requests", "request-billing"].includes(text)) return "request_billing"
  if (["token", "token_billing", "tokens", "token-billing"].includes(text)) return "token_billing"
  return null
}

export function createCommandHandlers({ client, rematchModels, showToast: providedShowToast = null }) {
  async function showToast(payload) {
    if (typeof providedShowToast === "function") {
      await providedShowToast(payload)
      return
    }
    if (client.tui?.toast?.show) {
      await client.tui.toast.show(payload)
    }
  }

  async function handlePiDispatch(input) {
    let packet = readDispatchPacket()
    let recoveredFromIntake = false

    if (!packet) {
      const intakeCard = readIntakeCard()
      if (intakeCard?.ready === true) {
        const fallbackPacket = buildDispatchPacket(intakeCard)
        const fallbackErrors = validateDispatchPacket(fallbackPacket)
        if (fallbackPacket && fallbackErrors.length === 0) {
          writeDispatchPacket(fallbackPacket)
          packet = fallbackPacket
          recoveredFromIntake = true
        }
      }
    }

    if (!packet) {
      await injectSessionMessage(client, input?.sessionID, "Cannot run /pi-dispatch: no ready Mic packet found.")
      return
    }

    const errors = validateDispatchPacket(packet)
    if (errors.length > 0) {
      await injectSessionMessage(
        client,
        input?.sessionID,
        `Cannot run /pi-dispatch: packet validation failed. ${errors.join("; ")}`,
      )
      return
    }

    const routePlan = buildRoutePlan(packet)
    const workboard = createWorkboard(packet, routePlan)
    writeWorkboard(workboard)
    writeDispatchPacket({ ...packet, dispatched_at: new Date().toISOString() })
    writeResumeCapsule(buildResumeCapsule(packet, workboard))
    const currentInteraction = readInteractionMode()
    updateInteractionMode({
      frontstage_agent: currentInteraction?.frontstage_agent || "mic",
      active_loop: currentInteraction?.active_loop || "mic_frontstage",
      last_handoff: "mic_to_pi",
      reason: "pi_dispatch",
    })
    queueOrchestrationRelay({
      summary: `Dispatch packet ${packet.packet_id} is ready for Pi orchestration in ${routePlan.lane} lane.`,
      packetID: packet.packet_id,
      sessionID: input?.sessionID || null,
      sourceAgent: "mic",
      targetAgent: "pi",
    })

    appendDispatchRecords(packet, routePlan)

    const recommendation = readModelMatch()
    const brief = renderDispatchBrief(packet, routePlan)
    const modelSummary = recommendation ? `\n\n[Model Match]\n${explainRecommendation(recommendation)}` : ""
    await injectSessionMessage(client, input?.sessionID, `${brief}${modelSummary}`)

    await showToast({
      title: "Pi dispatch ready",
      message: `${routePlan.lane} lane · ${routePlan.primary_workers.join(", ") || "pi"}`,
    })

    await client.app.log({
      body: {
        service: ROUTER_SERVICE,
        level: "info",
        message: "pi-dispatch executed",
        packet_id: packet.packet_id,
        lane: routePlan.lane,
        recovered_from_intake: recoveredFromIntake,
      },
    })
  }

  async function handlePiUp(input) {
    await injectSessionMessage(client, input?.sessionID, buildUpView())
  }

  async function handlePiRematch(input, billingMode) {
    if (typeof rematchModels !== "function") {
      await injectSessionMessage(client, input?.sessionID, "Cannot run rematch: rematch is unavailable.")
      return
    }

    const resolvedBillingMode = normalizeBillingMode(billingMode)
    if (!resolvedBillingMode) {
      await injectSessionMessage(client, input?.sessionID, "Cannot run rematch: billing mode is invalid.")
      return
    }

    let result = null
    try {
      result = await rematchModels("command", {
        billingMode: resolvedBillingMode,
        onResearchProgress: async ({ phase, detail }) => {
          const msg = `${phase}${detail ? ` · ${detail}` : ""}`
          await showToast({
            title: "Model research",
            message: msg,
          })
        },
      })
    } catch (error) {
      await injectSessionMessage(
        client,
        input?.sessionID,
        `Cannot run rematch: ${error?.message || "unknown error"}`,
      )
      return
    }

    const recommendation = result?.recommendation || readModelMatch()
    const change = result?.changed ? "updated" : "unchanged"
    const summary = recommendation
      ? renderCompactRematchView({
        recommendation,
        changed: Boolean(result?.changed),
        defaultGlobalConfigCreated: result?.defaultGlobalConfigCreated === true,
        defaultGlobalConfigPath: result?.defaultGlobalConfigPath || null,
        defaultGlobalModelMatchPolicyCreated: result?.defaultGlobalModelMatchPolicyCreated === true,
        defaultGlobalModelMatchPolicyPath: result?.defaultGlobalModelMatchPolicyPath || null,
      })
      : `[Model Match Rematch]\nStatus: ${change}\nBilling mode: ${resolvedBillingMode}\nDiscovery refresh: complete (synchronous verified discovery before rematch)\nConfig authority: inspect ~/.config/opencode/opencode-router.json for active router settings\nPolicy authority: inspect ~/.config/opencode/opencode-router-model-match.md for abstract role-scoring policy\nAudit: missing\n[Updated Config]\nbilling_mode=${resolvedBillingMode}\n[Role Weights]\nPi: (none) · family=unknown\nCo-pi: (none) · family=unknown\nWise: (none) · family=unknown`
    await injectSessionMessage(
      client,
      input?.sessionID,
      summary,
    )

    await showToast({
      title: "Model rematch",
      message: `${change}; verified discovery completed`,
    })

    await client.app.log({
      body: {
        service: ROUTER_SERVICE,
        level: "info",
        message: `pi-rematch-${resolvedBillingMode === "token_billing" ? "token" : "request"} executed`,
        changed: Boolean(result?.changed),
        config_source: result?.configSource || recommendation?.config_source || "(default)",
        billing_mode: resolvedBillingMode,
      },
    })
  }

  async function handlePiBook(input) {
    await injectSessionMessage(client, input?.sessionID, buildBookView())
  }

  return {
    "pi-dispatch": handlePiDispatch,
    "pi-rematch-token": (input) => handlePiRematch(input, "token_billing"),
    "pi-rematch-request": (input) => handlePiRematch(input, "request_billing"),
    "pi-up": handlePiUp,
    "pi-book": handlePiBook,
  }
}

export { COMMAND_DEFS }
