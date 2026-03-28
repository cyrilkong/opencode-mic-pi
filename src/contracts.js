export const SCHEMA_VERSION = 1

export const ROUTER_SERVICE = "opencode-router"

export const COMMAND_DEFS = {
  "pi-dispatch": {
    template: "/pi-dispatch",
    description: "Dispatch the latest ready Mic backlog to Pi.",
  },
  "pi-rematch-token": {
    template: "/pi-rematch-token",
    description: "Refresh router model recommendations with token_billing.",
  },
  "pi-rematch-request": {
    template: "/pi-rematch-request",
    description: "Refresh router model recommendations with request_billing.",
  },
  "pi-up": {
    template: "/pi-up",
    description: "Show the current Pi workboard status.",
  },
  "pi-book": {
    template: "/pi-book",
    description: "Show the current router memory book.",
  },
}

export const TASK_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  DONE: "done",
  BLOCKED: "blocked",
}

export const RISK_LEVELS = ["L1", "L2", "L3"]
export const LANES = ["fast", "standard", "deep"]

export const DEFAULT_LANGUAGE = "en"

export const SHAPE_KEYWORDS = {
  strategy: ["architecture", "migration", "strategy", "roadmap", "tradeoff", "direction"],
  debug: ["debug", "error", "failure", "bug", "reproduce", "root cause", "trace"],
  design: ["design", "ux", "ui", "layout", "wording", "copy", "style", "visual", "polish"],
  docs: ["doc", "docs", "readme", "api", "spec", "guide", "document", "markdown"],
  map: ["map", "locate", "where", "scan repo", "search repo", "recon", "inspect structure"],
  scout: ["research", "compare", "survey", "look up", "web", "sources", "landscape"],
  vis: ["image", "screenshot", "visual asset", "figma", "mockup"],
  snap: ["small change", "quick check", "small config", "single file", "run command"],
}

export const WORKER_SPECIALTIES = {
  dev: "engineering implementation",
  desi: "text-first UX and presentation design",
  doc: "documentation and official reference handling",
  map: "repository reconnaissance",
  scout: "wide information digging",
  debug: "failure investigation",
  check: "independent quality review",
  vis: "image-aware reasoning",
  snap: "fast direct action",
  "co-pi": "route sanity checks",
  wise: "strategic judgment",
}

export function createId(prefix = "id") {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${stamp}-${rand}`
}
