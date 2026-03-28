import { COMMAND_VIEW_STYLE, renderCommandSectionHeader } from "./shape.js"
import { truncateText } from "./shared.js"

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
  if (!workboard && !capsule) return `${renderCommandSectionHeader(COMMAND_VIEW_STYLE.piUpHeader)} No active workboard yet.`

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
    `Packet: ${packetID}`,
    `Loop: ${loop} · Frontstage: ${frontstageAgent}${pairedBackstage ? ` · Backstage: ${pairedBackstage}` : ""}`,
    relayStatus ? `Relay: ${relayStatus}` : null,
    `Stage: ${stage} · ${status}`,
    `Lane: ${lane} · Risk: ${risk}`,
    `Working: ${workingState}`,
    `Progress: ${progress.done}/${progress.total} done · ${progress.active} active · ${progress.blocked} blocked`,
    `Blockers: ${blockers}`,
    `Memory: ${researchCount} key notes`,
    `Palace: ${projectAnchors} anchors · ${reusableFindings} reusable · ${indexedAgents} indexed agents`,
    currentFocus ? `Focus: ${truncateText(currentFocus, 180)}` : null,
    memoryFocus.length > 0 ? `Recall: ${truncateText(memoryFocus.slice(0, 2).join(" | "), 180)}` : null,
    `Next: ${truncateText(next || defaultNextStep, 180)}`,
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
