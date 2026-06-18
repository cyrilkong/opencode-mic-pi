export function nonEmptyString(value) {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return trimmed || ""
}

export function truncateText(value, max = 140) {
  const text = nonEmptyString(value)
  if (!text) return ""
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function renderBulletedBlock(items = [], emptyLine = "- (none)") {
  if (!Array.isArray(items) || items.length === 0) return emptyLine
  return items.map((item) => `- ${item}`).join("\n")
}

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  cyan: "\u001b[36m",
  magenta: "\u001b[35m",
  white: "\u001b[37m",
  bgGreen: "\u001b[30;42m",
  bgYellow: "\u001b[30;43m",
  bgRed: "\u001b[30;41m",
}

export function renderStatusBadge(status) {
  const text = nonEmptyString(status).toUpperCase()
  if (text === "READY" || text === "DONE" || text === "OK" || text === "ACTIVE") {
    return `${ANSI.bgGreen} ${text} ${ANSI.reset}`
  }
  if (text === "PENDING" || text === "BLOCKED" || text === "WAITING" || text === "PAUSED") {
    return `${ANSI.bgYellow} ${text} ${ANSI.reset}`
  }
  if (text === "FAILED" || text === "ERROR" || text === "STOPPED") {
    return `${ANSI.bgRed} ${text} ${ANSI.reset}`
  }
  return text ? `${ANSI.dim}[${text}]${ANSI.reset}` : `${ANSI.dim}[NONE]${ANSI.reset}`
}

export function renderRiskTag(risk) {
  const text = nonEmptyString(risk).toUpperCase()
  if (text === "L1" || text === "LOW") return `${ANSI.dim}risk=L1${ANSI.reset}`
  if (text === "L2" || text === "MED" || text === "MEDIUM") return `${ANSI.yellow}risk=L2${ANSI.reset}`
  if (text === "L3" || text === "HIGH") return `${ANSI.red}risk=L3${ANSI.reset}`
  return text ? `risk=${text}` : `${ANSI.dim}risk=?${ANSI.reset}`
}

export function renderLaneTag(lane) {
  const text = nonEmptyString(lane).toLowerCase()
  if (text === "fast") return `${ANSI.cyan}lane=fast${ANSI.reset}`
  if (text === "standard") return `${ANSI.dim}lane=standard${ANSI.reset}`
  if (text === "deep") return `${ANSI.magenta}lane=deep${ANSI.reset}`
  return text ? `lane=${text}` : `${ANSI.dim}lane=?${ANSI.reset}`
}

export function renderDivider(label = "") {
  const text = nonEmptyString(label)
  if (!text) return `${ANSI.dim}${"─".repeat(48)}${ANSI.reset}`
  const pad = Math.max(0, 48 - text.length - 2)
  return `${ANSI.dim}─ ${text} ${"─".repeat(pad)}${ANSI.reset}`
}

export function renderKeyLine(label, value, { emphasize = false } = {}) {
  const key = nonEmptyString(label)
  const val = nonEmptyString(value)
  if (!val) return null
  const prefix = emphasize ? `${ANSI.bold}${key}:${ANSI.reset}` : `${ANSI.dim}${key}:${ANSI.reset}`
  return `${prefix} ${val}`
}

export function renderBulletBlock(label, items = [], { emptyLine = "(none)", truncate = 140 } = {}) {
  const key = nonEmptyString(label)
  if (!Array.isArray(items) || items.length === 0) {
    return key ? `${key}: ${emptyLine}` : emptyLine
  }
  const body = items.map((item) => `- ${truncateText(item, truncate)}`).join("\n")
  return key ? `${key}:\n${body}` : body
}

export function renderProgressLine(progress = {}) {
  const done = Number(progress.done) || 0
  const total = Number(progress.total) || 0
  const active = Number(progress.active) || 0
  const blocked = Number(progress.blocked) || 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const barWidth = 12
  const filled = total > 0 ? Math.round((done / total) * barWidth) : 0
  const bar = `${ANSI.green}${"█".repeat(filled)}${ANSI.reset}${ANSI.dim}${"░".repeat(barWidth - filled)}${ANSI.reset}`
  const blockedTag = blocked > 0 ? ` · ${ANSI.bgYellow} ${blocked} blocked ${ANSI.reset}` : ""
  const activeTag = active > 0 ? ` · ${active} active` : ""
  return `${bar} ${done}/${total} (${pct}%)${activeTag}${blockedTag}`
}
