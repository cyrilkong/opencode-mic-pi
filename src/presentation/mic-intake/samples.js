import { renderCanonicalMicIntakeCard } from "./render.js"

export const MIC_INTAKE_CANONICAL_FIXTURES = Object.freeze([
  Object.freeze({
    file: "valid-ready-mic-output.md",
    render: Object.freeze({
      verbatim: "Redesign the router backlog and fix bootstrap check mode for the plugin.",
      agentReadable: "Update planning surfaces, make bootstrap check non-mutating, and prepare local pilot validation.",
      tasks: Object.freeze([
        Object.freeze({
          tag: "docs",
          task: "Rewrite the backlog to match milestone-based production planning.",
        }),
        Object.freeze({
          tag: "dev",
          task: "Fix bootstrap check mode so it does not create directories in check mode.",
        }),
      ]),
      questionStatus: "none",
      resolvedNotes: Object.freeze([
        "Scope is limited to backlog + bootstrap behavior for the plugin repo.",
      ]),
      readyStatus: "READY",
      dispatchHint: "\u001b[30;42m READY TO DISPATCH \u001b[0m Run `/pi-dispatch` or switch to `@pi` to dispatch this backlog.",
    }),
  }),
  Object.freeze({
    file: "non-ready-mic-output.md",
    render: Object.freeze({
      verbatim: "I want to improve the router but I am not sure whether to focus on routing, memory, or packaging first.",
      agentReadable: "The user wants to improve the router but prioritization is still unclear across control plane, memory palace, and packaging.",
      tasks: Object.freeze([
        Object.freeze({
          tag: "strategy",
          task: "Compare the next-best focus between routing, memory, and packaging.",
        }),
        Object.freeze({
          tag: "doc",
          task: "Summarize what information is still missing before dispatch.",
        }),
      ]),
      questionStatus: "awaiting_user",
      openQuestions: Object.freeze([
        "Which milestone matters most right now: control plane, memory palace, or packaging?",
        "Is this intended for local pilot use first or direct public beta?",
      ]),
      readyStatus: "PENDING",
      readyReason: "waiting for the user to choose the current milestone focus and release target.",
    }),
  }),
  Object.freeze({
    file: "rich-pending-mic-output.md",
    render: Object.freeze({
      verbatim: "I need to push the plugin toward beta, but I have not decided whether to improve Mic backlog UX first or Pi recovery commands first.",
      agentReadable: "The user wants beta-focused productization, but the immediate execution priority is still undecided between Mic intake UX and Pi recovery workflows.",
      tasks: Object.freeze([
        Object.freeze({
          tag: "UX",
          task: "Redesign the main backlog surface so pending vs ready reads faster.",
        }),
        Object.freeze({
          tag: "Core",
          task: "Compare the value of Mic intake improvements versus Pi recovery improvements for the next round.",
        }),
        Object.freeze({
          tag: "QA",
          task: "Define what missing answers still block dispatch.",
        }),
      ]),
      questionStatus: "awaiting_user",
      openQuestions: Object.freeze([
        "Which should go first in this round: Mic backlog UX or Pi recovery commands?",
        "Should this round end at backlog/product design, or include code changes too?",
      ]),
      resolvedNotes: Object.freeze([
        "Beta productization is the active goal.",
      ]),
      readyStatus: "PENDING",
      readyReason: "immediate execution priority and round boundary are still waiting on user choice.",
    }),
  }),
])

export function buildMicCanonicalSampleBlock() {
  return [
    "Canonical sample:",
    "",
    renderCanonicalMicIntakeCard({
      verbatim: "I need to push the plugin toward beta, but I have not decided whether to improve Mic backlog UX first or Pi recovery commands first.",
      agentReadable: "The user wants beta-focused productization, but the immediate execution priority is still undecided between Mic intake UX and Pi recovery workflows.",
      tasks: [
        { tag: "UX", task: "Redesign the main backlog surface so pending vs ready reads faster." },
        { tag: "Core", task: "Compare the next round priority between Mic intake UX and Pi recovery workflows." },
        { tag: "QA", task: "Define what missing answers still block dispatch." },
      ],
      questionStatus: "awaiting_user",
      openQuestions: [
        "Which should go first in this round: Mic backlog UX or Pi recovery commands?",
        "Should this round end at backlog/product design, or include code changes too?",
      ],
      resolvedNotes: [
        "Beta productization is the active goal.",
      ],
      readyStatus: "PENDING",
      readyReason: "Immediate execution priority and round boundary are still waiting on user choice.",
    }).trimEnd(),
  ].join("\n")
}
