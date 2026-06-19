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

const DIVIDER_WIDTH = 48

export function renderStatusBadge(status) {
  const text = nonEmptyString(status).toUpperCase()
  if (text === "READY" || text === "DONE" || text === "OK" || text === "ACTIVE") {
    return `**[ ${text} ]**`
  }
  if (text === "PENDING" || text === "BLOCKED" || text === "WAITING" || text === "PAUSED") {
    return `**[ ${text} ]**`
  }
  if (text === "FAILED" || text === "ERROR" || text === "STOPPED") {
    return `**[ ${text} ]**`
  }
  return text ? `[${text}]` : `[NONE]`
}

export function renderRiskTag(risk) {
  const text = nonEmptyString(risk).toUpperCase()
  if (text === "L1" || text === "LOW") return `risk=L1`
  if (text === "L2" || text === "MED" || text === "MEDIUM") return `risk=L2`
  if (text === "L3" || text === "HIGH") return `**risk=L3**`
  return text ? `risk=${text}` : `risk=?`
}

export function renderLaneTag(lane) {
  const text = nonEmptyString(lane).toLowerCase()
  if (text === "fast") return `**lane=fast**`
  if (text === "standard") return `lane=standard`
  if (text === "deep") return `**lane=deep**`
  return text ? `lane=${text}` : `lane=?`
}

export function renderDivider(label = "") {
  const text = nonEmptyString(label)
  if (!text) return `${"─".repeat(DIVIDER_WIDTH)}`
  const pad = Math.max(0, DIVIDER_WIDTH - text.length - 2)
  return `─ ${text} ${"─".repeat(pad)}`
}

export function renderKeyLine(label, value, { emphasize = false } = {}) {
  const key = nonEmptyString(label)
  const val = nonEmptyString(value)
  if (!val) return null
  return emphasize ? `**${key}:** **${val}**` : `**${key}:** ${val}`
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
  const bar = `**${"█".repeat(filled)}${"░".repeat(barWidth - filled)}**`
  const blockedTag = blocked > 0 ? ` · **${blocked} blocked**` : ""
  const activeTag = active > 0 ? ` · ${active} active` : ""
  return `${bar} ${done}/${total} (${pct}%)${activeTag}${blockedTag}`
}
