function freezeStringList(values = []) {
  return Object.freeze([...values])
}

function defineAgent(id, definition) {
  return Object.freeze({
    id,
    label: definition.label || id,
    mode: definition.mode,
    surface: definition.surface,
    description: definition.description,
    mission: definition.mission,
    cost_posture: definition.cost_posture,
    prompt_source: definition.prompt_source || `prompts/${id}.md`,
    permission: Object.freeze({ ...(definition.permission || {}) }),
    use_cases: freezeStringList(definition.use_cases),
    avoid_when: freezeStringList(definition.avoid_when),
    output_sections: freezeStringList(definition.output_sections),
  })
}

export const ROUTER_AGENT_CATALOG = Object.freeze({
  mic: defineAgent("mic", {
    label: "Mic",
    mode: "all",
    surface: "frontstage",
    description: "User-facing intake mic and backlog reconciler. Captures messy input and distills it into a clean backlog, and can also reconcile backlog updates backstage for Pi.",
    mission: "Turn messy user input or Pi-fed requirement drift into a stable, requirement-level backlog without taking over planning or execution.",
    cost_posture: "Always cost-sensitive. Default low-friction intake window.",
    permission: { question: "allow" },
    use_cases: [
      "messy intake",
      "scope shaping",
      "requirement clarification",
      "persistent backlog maintenance",
      "backstage backlog reconciliation for Pi",
      "language-stable front-window interaction",
    ],
    avoid_when: [
      "implementation planning",
      "agent routing",
      "architecture decisions",
      "deep execution reasoning",
    ],
    output_sections: [
      "As-is",
      "Task List",
      "Questions",
      "Ready For Dispatch?",
    ],
  }),
  pi: defineAgent("pi", {
    label: "Pi",
    mode: "all",
    surface: "frontstage",
    description: "Foreman and execution orchestrator. Takes a backlog and converts it into sequenced, delegated execution, whether Pi is frontstage or called backstage by Mic.",
    mission: "Validate intake, package execution, delegate specialists, and keep progress aligned to the active backlog whether Pi is user-facing or acting as Mic's backstage control plane.",
    cost_posture: "Balanced orchestration spend. Optimize for fewer user-facing turns.",
    use_cases: [
      "execution orchestration",
      "task packaging",
      "worker delegation",
      "blocker management",
      "handoff and continuity management",
      "backstage orchestration for Mic-frontstage sessions",
    ],
    avoid_when: [
      "raw intake grooming",
      "doing every specialist task itself",
      "broad speculative redesign without evidence",
      "specialist work that should be delegated",
    ],
    output_sections: [
      "Status",
      "What happened",
      "Next step",
    ],
  }),
  snap: defineAgent("snap", {
    label: "Snap",
    mode: "primary",
    surface: "frontstage",
    description: "Fast direct-action agent for short, concrete, operational requests with minimal ceremony.",
    mission: "Handle short operational tasks directly without dragging the user through orchestration ceremony.",
    cost_posture: "Low overhead. Prefer speed and directness.",
    use_cases: [
      "run a command",
      "inspect a file",
      "small config tweak",
      "small direct fix",
      "low-ceremony operational adjustment",
    ],
    avoid_when: [
      "large multi-step engineering work",
      "architecture review",
      "extended debugging campaigns",
    ],
    output_sections: [
      "Action",
      "Result",
      "Next Step",
    ],
  }),
  "co-pi": defineAgent("co-pi", {
    label: "Co-pi",
    mode: "subagent",
    surface: "backstage",
    description: "Pi's second-brain for route checks, plan pressure-tests, task packaging, and process clarity.",
    mission: "Pressure-test Pi's concrete proposal without replacing Pi or expanding into open-ended redesign.",
    cost_posture: "Selective advisory spend only when a concrete proposal exists.",
    use_cases: [
      "route sanity check",
      "plan check",
      "task packaging review",
      "process drift pressure-test",
      "second-opinion on a concrete proposal",
      "breaking loops after repeated unsatisfied user feedback",
    ],
    avoid_when: [
      "simple reversible steps",
      "first-pass rediscovery",
      "ceremonial reviews with no real proposal",
    ],
    output_sections: [
      "Status",
      "Verdict",
      "Summary",
      "Key Findings",
      "Suggested Next Step",
    ],
  }),
  wise: defineAgent("wise", {
    label: "Wise",
    mode: "subagent",
    surface: "backstage",
    description: "High-authority strategic reviewer for architecture, sequencing, migration, and drift-correction.",
    mission: "Deliver high-value strategic judgment when architecture or product direction carries meaningful consequence.",
    cost_posture: "High-cost strategic escalation. Use rarely.",
    use_cases: [
      "architecture direction",
      "migration choice",
      "high-consequence tradeoff review",
      "strategic drift correction",
      "decision-criteria framing",
    ],
    avoid_when: [
      "routine implementation",
      "wide raw evidence gathering",
      "mild orchestration muddle",
    ],
    output_sections: [
      "Decision",
      "Why it wins",
      "Risks",
      "Next step",
    ],
  }),
  dev: defineAgent("dev", {
    label: "Dev",
    mode: "subagent",
    surface: "backstage",
    description: "Implementation specialist for code changes, technical delivery, and engineering tasks.",
    mission: "Execute scoped engineering work directly and validate it without widening the brief.",
    cost_posture: "Capability-first implementation spend.",
    use_cases: [
      "code changes",
      "integration work",
      "technical delivery",
      "scoped refactors",
      "implementation-coupled validation",
    ],
    avoid_when: [
      "pure doc writing",
      "strategic review",
      "broad open-ended exploration",
    ],
    output_sections: [
      "What changed",
      "Validation",
      "Risk / next step",
    ],
  }),
  desi: defineAgent("desi", {
    label: "Desi",
    mode: "subagent",
    surface: "backstage",
    description: "Text-first design director for UX/UI presentation, layout critique, and wording polish without image input.",
    mission: "Improve presentation, structure, hierarchy, and UX feel without pretending to do image-aware reasoning.",
    cost_posture: "Moderate. Spend when design quality or text-first UX is the bottleneck.",
    use_cases: [
      "UX revamp",
      "plain-text layout polish",
      "frontend presentation direction",
      "wording and hierarchy improvement",
      "interaction and hierarchy refinement",
    ],
    avoid_when: [
      "actual image analysis",
      "engineering implementation",
      "raw strategy review",
    ],
    output_sections: [
      "Design Goal",
      "Recommended Direction",
      "Formatting / UX Rules",
      "Example Structure",
    ],
  }),
  doc: defineAgent("doc", {
    label: "Doc",
    mode: "subagent",
    surface: "backstage",
    description: "Documentation processor for official docs, API references, specs, and documentation writing.",
    mission: "Produce concise evidence-backed documentation work and authoritative answers without drifting into coding.",
    cost_posture: "Low-cost authoritative reference work.",
    use_cases: [
      "official docs lookup",
      "spec reading",
      "documentation writing",
      "doc cleanup",
      "repo text and policy analysis",
    ],
    avoid_when: [
      "code implementation",
      "test execution",
      "broad web scouting when official docs are enough",
    ],
    output_sections: [
      "Sourced facts",
      "Synthesis",
      "Actionable next step",
    ],
  }),
  map: defineAgent("map", {
    label: "Map",
    mode: "subagent",
    surface: "backstage",
    description: "Fast, low-cost code reconnaissance for structure mapping, symbol lookup, and grep-style pattern discovery.",
    mission: "Locate the best files, symbols, and patterns quickly so heavier workers start in the right place.",
    cost_posture: "Cheap reconnaissance.",
    use_cases: [
      "hotspot discovery",
      "symbol lookup",
      "codebase mapping",
      "pattern search",
      "finding the best next reader",
    ],
    avoid_when: [
      "implementation",
      "final judgment",
      "broad web research",
    ],
    output_sections: [
      "Search Goal",
      "Relevant Hits",
      "Patterns / Structure",
      "Best Next Reader",
    ],
  }),
  scout: defineAgent("scout", {
    label: "Scout",
    mode: "subagent",
    surface: "backstage",
    description: "Wide-browsing information digger for broad source collection without heavyweight interpretation.",
    mission: "Sweep the wider information surface quickly, then hand evidence back for better synthesis elsewhere.",
    cost_posture: "Cheap external signal gathering.",
    use_cases: [
      "broad web scan",
      "source collection",
      "current signal gathering",
      "ecosystem comparisons",
      "freshness-sensitive source sweep",
    ],
    avoid_when: [
      "final strategic judgment",
      "implementation",
      "official-doc-first questions",
    ],
    output_sections: [
      "Search Goal",
      "Coverage",
      "Key Findings",
      "Sources",
    ],
  }),
  debug: defineAgent("debug", {
    label: "Debug",
    mode: "subagent",
    surface: "backstage",
    description: "Failure investigator for reproduction and root-cause analysis of difficult bugs.",
    mission: "Narrow failures with evidence, ranked hypotheses, and the smallest reliable next experiment.",
    cost_posture: "Focused debugging spend.",
    use_cases: [
      "reproduction",
      "root cause analysis",
      "failure narrowing",
      "evidence-based debugging",
      "ranked hypothesis testing",
    ],
    avoid_when: [
      "greenfield implementation",
      "broad refactor brainstorming",
      "style-only fixes",
    ],
    output_sections: [
      "Facts",
      "Hypotheses",
      "Next experiment",
      "Likely fix",
    ],
  }),
  check: defineAgent("check", {
    label: "Check",
    mode: "subagent",
    surface: "backstage",
    description: "Independent final-defense reviewer. Reviews finished work as a third-party quality gate.",
    mission: "Find regressions, correctness risks, and verification gaps before the user pays for them.",
    cost_posture: "Selective review spend after meaningful work.",
    use_cases: [
      "final review",
      "regression risk review",
      "quality gate",
      "cross-check after dev or desi",
      "findings-first independent verification",
    ],
    avoid_when: [
      "tiny trivial edits",
      "first-pass implementation",
      "open-ended research",
    ],
    output_sections: [
      "Overall Verdict",
      "High Severity",
      "Medium Severity",
      "Low Severity",
      "Recommended Next Step",
    ],
  }),
  vis: defineAgent("vis", {
    label: "Vis",
    mode: "subagent",
    surface: "backstage",
    description: "Image-aware reasoning specialist. Use only when the task includes a real image, screenshot, or visual asset.",
    mission: "Provide compact image-grounded interpretation when the task truly depends on visual input.",
    cost_posture: "Token-billed multimodal spend. Use intentionally.",
    use_cases: [
      "screenshot reading",
      "image-grounded UI critique",
      "visual asset inspection",
      "single-shot image understanding",
      "multimodal verification",
    ],
    avoid_when: [
      "text-only design work",
      "general strategy",
      "multi-turn exploratory chat",
    ],
    output_sections: [
      "Visual Goal",
      "Observed Signals",
      "Best Interpretation",
      "Recommended Next Step",
    ],
  }),
})

export const ROUTER_AGENT_IDS = Object.freeze(Object.keys(ROUTER_AGENT_CATALOG))
export const DEFAULT_PUBLIC_AGENTS = Object.freeze(["mic", "pi", "snap"])
export const DEFAULT_DISABLED_BUILTIN_AGENTS = Object.freeze(["plan", "general", "build", "explore"])

export const ROUTER_AGENT_PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(ROUTER_AGENT_CATALOG).map(([agentID, agent]) => [
      agentID,
      Object.freeze({
        mode: agent.mode,
        description: agent.description,
        permission: Object.freeze({ ...(agent.permission || {}) }),
      }),
    ]),
  ),
)

const PI_ROUTING_ORDER = Object.freeze([
  "dev",
  "desi",
  "doc",
  "map",
  "scout",
  "debug",
  "co-pi",
  "check",
  "wise",
  "vis",
])

export function buildPiRoutingReference() {
  const lines = ["Routing reference:"]
  for (const agentID of PI_ROUTING_ORDER) {
    const agent = ROUTER_AGENT_CATALOG[agentID]
    if (!agent) continue
    lines.push(`- \`${agentID}\`: ${agent.description}`)
  }
  lines.push("- `snap`: direct-action public entry for tiny operational tasks; Pi may keep work local instead of routing when delegation would add ceremony.")
  return lines.join("\n")
}
