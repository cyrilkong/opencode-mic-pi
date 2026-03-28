import { buildRouteNarrative, buildWorkerAcknowledgement } from "../../routing.js"
import { COMMAND_VIEW_STYLE, renderCommandSectionHeader } from "./shape.js"

export function renderDispatchBrief(packet, routePlan) {
  const activeWorkers = [...new Set([...routePlan.primary_workers, ...routePlan.support_workers, ...routePlan.advisory_workers])]
  const debateGate = routePlan?.debate_gate
  const disagreementMap = routePlan?.disagreement_map

  const debateSummary = debateGate?.enabled
    ? [
        renderCommandSectionHeader(COMMAND_VIEW_STYLE.debateGateHeader),
        "Status: enabled",
        `Reason: ${debateGate.reason}`,
        `Round limit: ${debateGate.round_limit}`,
        debateGate.topics?.length > 0 ? `Topics:\n${debateGate.topics.map((topic) => `- ${topic}`).join("\n")}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : null

  const disagreementSummary = disagreementMap?.enabled
    ? [
        renderCommandSectionHeader(COMMAND_VIEW_STYLE.disagreementMapHeader),
        `Status: ${disagreementMap.status}`,
        `Reason: ${disagreementMap.reason}`,
        disagreementMap.unresolved_points?.length > 0
          ? `Unresolved points:\n${disagreementMap.unresolved_points.map((point) => `- ${point}`).join("\n")}`
          : null,
        disagreementMap.alternatives?.length > 0
          ? `Alternatives:\n${disagreementMap.alternatives.map((item) => `- ${item.id}: ${item.label}`).join("\n")}`
          : null,
        `Decision rule: ${disagreementMap.decision_rule || "Prefer evidence-backed lower-risk path."}`,
      ]
        .filter(Boolean)
        .join("\n")
    : null

  return [
    renderCommandSectionHeader(COMMAND_VIEW_STYLE.dispatchHeader),
    `Packet ID: ${packet.packet_id}`,
    `Language: ${packet.language}`,
    buildRouteNarrative(routePlan),
    debateSummary,
    disagreementSummary,
    activeWorkers.length > 0
      ? `Acknowledgements:\n${activeWorkers.map((worker) => `- ${buildWorkerAcknowledgement(worker)}`).join("\n")}`
      : null,
    "Tasks:",
    ...routePlan.task_routes.map(
      (route, index) => `${index + 1}. [${route.tag || "Task"}] (${route.worker}) ${route.task}`,
    ),
    "Pi: treat this packet as the active source of truth and continue execution from the chosen lane.",
  ]
    .filter(Boolean)
    .join("\n")
}
