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
