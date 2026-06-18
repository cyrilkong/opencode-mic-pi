import { COMMAND_VIEW_STYLE, renderCommandSectionHeader } from "./shape.js"
import {
  truncateText,
  renderDivider,
  renderKeyLine,
  renderLaneTag,
  renderRiskTag,
  renderStatusBadge,
  renderProgressLine,
  renderBulletBlock,
} from "./shared.js"

export function renderBookView({
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
}) {
  const packetTasks = Array.isArray(packet?.task_list) ? packet.task_list : []
  const packetQuestions = Array.isArray(packet?.questions?.items) ? packet.questions.items : []
  const boardItems = Array.isArray(workboard?.items) ? workboard.items : []
  const blockers = Array.isArray(workboard?.blockers) ? workboard.blockers : []
  const disagreementMap = workboard?.disagreement_map

  const projectAnchors = Array.isArray(memoryPalace?.projectAnchors) ? memoryPalace.projectAnchors : []
  const reusableFindings = Array.isArray(memoryPalace?.reusableFindings) ? memoryPalace.reusableFindings : []
  const solvedTracks = Array.isArray(memoryPalace?.solvedTracks) ? memoryPalace.solvedTracks : []
  const indexedAgents = Array.isArray(memoryPalace?.indexedAgents) ? memoryPalace.indexedAgents : []
  const openLoops = Array.isArray(memoryPalace?.openLoops) ? memoryPalace.openLoops : []
  const orderedRoute = Array.isArray(memoryPalace?.orderedRoute) ? memoryPalace.orderedRoute : []
  const workingState = typeof memoryPalace?.workingState === "string" ? memoryPalace.workingState : "idle"
  const currentFocus = typeof memoryPalace?.currentFocus === "string" ? memoryPalace.currentFocus : ""
  const loop = typeof interactionMode?.active_loop === "string" ? interactionMode.active_loop : "mic_frontstage"
  const frontstageAgent = typeof interactionMode?.frontstage_agent === "string" ? interactionMode.frontstage_agent : "mic"
  const pairedBackstage = typeof interactionMode?.paired_backstage_agent === "string" ? interactionMode.paired_backstage_agent : ""
  const lastHandoff = typeof interactionMode?.last_handoff === "string" ? interactionMode.last_handoff : ""

  return [
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.piBookHeader),
    renderDivider("where am I"),
    renderKeyLine("Working state", workingState),
    renderKeyLine("Interaction loop", loop),
    renderKeyLine("Frontstage agent", `${frontstageAgent}${pairedBackstage ? ` · Backstage pair: ${pairedBackstage}` : ""}`),
    lastHandoff ? renderKeyLine("Last handoff", lastHandoff) : null,
    currentFocus ? renderKeyLine("Current focus", truncateText(currentFocus, 180)) : null,
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.dispatchPacketHeader),
    packet ? renderKeyLine("Packet ID", packet.packet_id) : renderKeyLine("Packet ID", "(none)"),
    packet ? renderKeyLine("Flow", `${packet.source_agent || "(unknown)"} -> ${packet.target_agent || "(unknown)"}`) : null,
    packet ? renderKeyLine("Language", `${packet.language || "(none)"} · Ready: ${packet.ready === true ? "yes" : "no"}`) : null,
    packet?.as_is?.agent_readable ? renderKeyLine("As-Is", truncateText(packet.as_is.agent_readable, 180)) : null,
    renderBulletBlock("Tasks", packetTasks.map((task) => `[${task.tag || "task"}] ${truncateText(task.task, 140)}`)),
    renderBulletBlock("Questions", packetQuestions, { truncate: 140 }),
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.workboardHeader),
    workboard ? renderKeyLine("Workboard ID", workboard.workboard_id) : renderKeyLine("Workboard ID", "(none)"),
    workboard ? renderKeyLine("Stage", `${workboard.stage} · ${renderStatusBadge(workboard.status)}`) : renderKeyLine("Stage", "(none)"),
    workboard ? `${renderLaneTag(workboard.lane)} · ${renderRiskTag(workboard.risk)} · Shape: ${workboard.shape || "?"}` : null,
    workboard ? renderProgressLine(progress) : null,
    boardItems.length > 0
      ? `Items:\n${boardItems.map((item) => `- [${item.status}] (${item.owner}) ${truncateText(item.title, 140)}`).join("\n")}`
      : "Items: (none)",
    blockers.length > 0
      ? `Blockers:\n${blockers.map((item) => `- ${truncateText(item, 140)}`).join("\n")}`
      : "Blockers: (none)",
    workboard?.debate_gate?.enabled
      ? `Debate gate: enabled · ${truncateText(workboard.debate_gate.reason, 120)}`
      : "Debate gate: disabled",
    disagreementMap?.enabled
      ? `${renderCommandSectionHeader(COMMAND_VIEW_STYLE.disagreementMapHeader)}\nStatus: ${disagreementMap.status || "open"}\nUnresolved:\n${(disagreementMap.unresolved_points || []).map((item) => `- ${truncateText(item, 140)}`).join("\n") || "- (none)"}`
      : `${renderCommandSectionHeader(COMMAND_VIEW_STYLE.disagreementMapHeader)}\n- (none)`,
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.resumeCapsuleHeader),
    capsule ? renderKeyLine("Stage", `${capsule.stage} · ${renderStatusBadge(capsule.status)}`) : renderKeyLine("Stage", "(none)"),
    capsule?.next_step ? renderKeyLine("Next", truncateText(capsule.next_step, 200), { emphasize: true }) : renderKeyLine("Next", "Wait for Pi execution."),
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.relayBridgeHeader),
    renderRelayLine("Orchestration request", relayBridge?.orchestration_request),
    renderRelayLine("Orchestration result", relayBridge?.orchestration_result),
    renderRelayLine("Backlog request", relayBridge?.backlog_request),
    renderRelayLine("Backlog result", relayBridge?.backlog_result),
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.decisionLedgerHeader),
    decisions.length > 0
      ? decisions.map((entry) => `- ${entry.created_at || "(time)"} · ${entry.kind || "decision"} · ${truncateText(entry.summary || "(no summary)", 140)}`).join("\n")
      : "- (none)",
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.outcomeSnapshotsHeader),
    snapshots.length > 0
      ? snapshots.map((entry) => `- ${entry.created_at || "(time)"} · ${entry.kind || "snapshot"} · ${truncateText(entry.summary || "(no summary)", 140)}`).join("\n")
      : "- (none)",
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.researchMemoryHeader),
    researchMemory.length > 0
      ? researchMemory.map((item) => `- [${item.priority}] ${truncateText(item.summary, 180)}${item.tags?.length ? ` (${item.tags.slice(0, 3).join(", ")})` : ""}`).join("\n")
      : "- (none)",
    "",
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.memoryPalaceHeader),
    `Working state: ${workingState}`,
    currentFocus ? `Current focus: ${truncateText(currentFocus, 180)}` : null,
    projectAnchors.length > 0
      ? `Project anchors:\n${projectAnchors.map((entry) => `- [${entry.priority}] ${truncateText(entry.summary, 180)}`).join("\n")}`
      : "Project anchors: (none)",
    orderedRoute.length > 0
      ? `Ordered revisit route:\n${orderedRoute.map((entry, index) => `- ${index + 1}. ${truncateText(entry, 180)}`).join("\n")}`
      : "Ordered revisit route: (none)",
    openLoops.length > 0
      ? `Open loops:\n${openLoops.map((entry) => `- ${truncateText(entry, 180)}`).join("\n")}`
      : "Open loops: (none)",
    reusableFindings.length > 0
      ? `Reusable findings:\n${reusableFindings.map((entry) => `- ${truncateText(entry.summary, 180)}${entry.agent_id ? ` (${entry.agent_id})` : ""}`).join("\n")}`
      : "Reusable findings: (none)",
    solvedTracks.length > 0
      ? `Solved / settled tracks:\n${solvedTracks.map((entry) => `- ${truncateText(entry.summary, 180)}`).join("\n")}`
      : "Solved / settled tracks: (none)",
    "",
    indexedAgents.length > 0
      ? `${renderCommandSectionHeader(COMMAND_VIEW_STYLE.agentIndexesHeader)}\n${indexedAgents.map((entry) => {
        const findings = Array.isArray(entry.recent_findings) ? entry.recent_findings.slice(0, 2).map((item) => truncateText(item.summary, 120)).join(" | ") : ""
        const handoffs = Array.isArray(entry.pending_handoffs) ? entry.pending_handoffs.slice(0, 2).map((item) => truncateText(item, 120)).join(" | ") : ""
        return `- ${entry.agent_id}: ${truncateText(entry.last_summary || "(no summary yet)", 140)}${findings ? ` · findings=${findings}` : ""}${handoffs ? ` · handoff=${handoffs}` : ""}`
      }).join("\n")}`
      : `${renderCommandSectionHeader(COMMAND_VIEW_STYLE.agentIndexesHeader)}\n- (none)`,
  ]
    .filter(Boolean)
    .join("\n")
}

function renderRelayLine(label, entry) {
  if (!entry) return `${label}: (none)`
  return `${label}: [${entry.status}] ${entry.source_agent}->${entry.target_agent} · ${truncateText(entry.summary, 160)}`
}
