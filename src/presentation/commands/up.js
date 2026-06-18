import { COMMAND_VIEW_STYLE, renderCommandSectionHeader } from "./shape.js"
import {
  truncateText,
  renderDivider,
  renderKeyLine,
  renderLaneTag,
  renderRiskTag,
  renderStatusBadge,
  renderProgressLine,
} from "./shared.js"

export function renderUpView({
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
  defaultNextStep,
}) {
  if (!workboard && !capsule) {
    return `${renderCommandSectionHeader(COMMAND_VIEW_STYLE.piUpHeader)}\n${renderDivider()}\nNo active workboard yet.`
  }

  const projectAnchors = Array.isArray(memoryPalace?.projectAnchors) ? memoryPalace.projectAnchors.length : 0
  const reusableFindings = Array.isArray(memoryPalace?.reusableFindings) ? memoryPalace.reusableFindings.length : 0
  const indexedAgents = Array.isArray(memoryPalace?.indexedAgents) ? memoryPalace.indexedAgents.length : 0
  const workingState = typeof memoryPalace?.workingState === "string" ? memoryPalace.workingState : "idle"
  const currentFocus = typeof memoryPalace?.currentFocus === "string" ? memoryPalace.currentFocus : ""
  const loop = typeof interactionMode?.active_loop === "string" ? interactionMode.active_loop : "mic_frontstage"
  const frontstageAgent = typeof interactionMode?.frontstage_agent === "string" ? interactionMode.frontstage_agent : "mic"
  const pairedBackstage = typeof interactionMode?.paired_backstage_agent === "string" ? interactionMode.paired_backstage_agent : ""
  const relayStatus = summarizeRelayBridge(relayBridge)

  return [
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.piUpHeader),
    renderDivider("status"),
    renderKeyLine("Packet", packetID),
    renderKeyLine("Stage", `${stage} · ${renderStatusBadge(status)}`, { emphasize: true }),
    `${renderLaneTag(lane)} · ${renderRiskTag(risk)}`,
    renderKeyLine("Working", workingState),
    renderKeyLine("Loop", `${loop} · front=${frontstageAgent}${pairedBackstage ? ` · back=${pairedBackstage}` : ""}`),
    relayStatus ? renderKeyLine("Relay", relayStatus) : null,
    "",
    renderDivider("progress"),
    renderProgressLine(progress),
    renderKeyLine("Blockers", blockers),
    "",
    renderDivider("memory"),
    renderKeyLine("Research notes", `${researchCount} key notes`),
    renderKeyLine("Palace", `${projectAnchors} anchors · ${reusableFindings} reusable · ${indexedAgents} indexed agents`),
    currentFocus ? renderKeyLine("Focus", truncateText(currentFocus, 180)) : null,
    memoryFocus.length > 0 ? renderKeyLine("Recall", truncateText(memoryFocus.slice(0, 2).join(" | "), 180)) : null,
    "",
    renderDivider("next step"),
    renderKeyLine("Next", truncateText(next || defaultNextStep, 200), { emphasize: true }),
  ]
    .filter(Boolean)
    .join("\n")
}

function summarizeRelayBridge(relayBridge) {
  const parts = []
  const orchestration = relayBridge?.orchestration_request
  const orchestrationResult = relayBridge?.orchestration_result
  const backlog = relayBridge?.backlog_request
  const backlogResult = relayBridge?.backlog_result

  if (orchestration) {
    parts.push(`orch=${orchestration.status}:${orchestration.source_agent}->${orchestration.target_agent}`)
  } else if (orchestrationResult) {
    parts.push(`orch_result=${orchestrationResult.status}`)
  }

  if (backlog) {
    parts.push(`backlog=${backlog.status}:${backlog.source_agent}->${backlog.target_agent}`)
  } else if (backlogResult) {
    parts.push(`backlog_result=${backlogResult.status}`)
  }

  return parts.join(" · ")
}
