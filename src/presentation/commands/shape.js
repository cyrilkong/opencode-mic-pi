export const COMMAND_VIEW_STYLE = Object.freeze({
  bracketOpen: "[",
  bracketClose: "]",
  rematchHeader: "Model Match Rematch",
  dispatchHeader: "Mic → Pi Dispatch",
  piUpHeader: "Pi Up",
  piBookHeader: "Pi Book",
  debateGateHeader: "Debate Gate",
  disagreementMapHeader: "Disagreement Map",
  updatedConfigHeader: "Updated Config",
  roleWeightsHeader: "Role Weights",
  warningsHeader: "Warnings",
  dispatchPacketHeader: "Dispatch Packet",
  workboardHeader: "Workboard",
  resumeCapsuleHeader: "Resume Capsule",
  decisionLedgerHeader: "Decision Ledger",
  outcomeSnapshotsHeader: "Outcome Snapshots",
  researchMemoryHeader: "Research Memory",
  memoryPalaceHeader: "Memory Palace",
  relayBridgeHeader: "Relay Bridge",
  agentIndexesHeader: "Agent Indexes",
})

export function renderCommandSectionHeader(label) {
  return `**${COMMAND_VIEW_STYLE.bracketOpen}${label}${COMMAND_VIEW_STYLE.bracketClose}**`
}
