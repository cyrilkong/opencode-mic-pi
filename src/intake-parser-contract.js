export const MIC_INTAKE_PARSE_SECTION_LABELS = Object.freeze([
  "AS-IS",
  "TASK LIST",
  "QUESTIONS",
  "READY FOR DISPATCH?",
])

export const MIC_INTAKE_PARSE_FIELD_ALIASES = Object.freeze({
  verbatim: Object.freeze(["Verbatim", "原话", "You", "User"]),
  agentReadable: Object.freeze(["Agent-readable", "Agent readable", "Agent_readable", "归一化", "规范化", "Mic"]),
  questionStatus: Object.freeze(["Status", "State"]),
  questionOpenHeaders: Object.freeze(["Open", "Pending", "Need From User", "Awaiting"]),
  questionResolvedHeaders: Object.freeze(["Resolved", "Answered", "Settled"]),
  questionIgnoredHeaders: Object.freeze(["Status", "State", "Reason", "Blocking", "Blockers"]),
  readyStatus: Object.freeze(["Status", "状态"]),
  readyReason: Object.freeze(["Reason", "Blocker", "Why", "原因", "阻塞"]),
})
