import { MIC_INTAKE_CARD_STYLE, renderMicSectionHeader } from "./shape.js"

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : ""
}

function normalizeList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((item) => nonEmptyString(item))
    .filter(Boolean)
}

function renderTaskLine(task) {
  const tag = nonEmptyString(task?.tag)
  const text = nonEmptyString(task?.task)
  if (!text) return null
  return tag ? `[${tag}] ${text}` : text
}

function isReadyStatus(value) {
  return nonEmptyString(value).toUpperCase() === "READY"
}

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  bgGreen: "\u001b[30;42m",
  bgYellow: "\u001b[30;43m",
}

function renderReadyBadge(readyStatus) {
  if (isReadyStatus(readyStatus)) return `${ANSI.bgGreen} READY ${ANSI.reset}`
  return `${ANSI.bgYellow} PENDING ${ANSI.reset}`
}

function renderQuestionStatusBadge(status) {
  const text = nonEmptyString(status).toLowerCase()
  if (text === "none" || !text) return `${ANSI.dim}none${ANSI.reset}`
  if (text === "awaiting_user" || text === "pending") return `${ANSI.bgYellow} awaiting_user ${ANSI.reset}`
  return text
}

function renderTaskSummary(tasks) {
  const count = Array.isArray(tasks) ? tasks.length : 0
  if (count === 0) return `${ANSI.dim}(no tasks yet)${ANSI.reset}`
  return `${count} task${count === 1 ? "" : "s"}`
}

function renderDispatchHintFooter(readyStatus, dispatchHint = "") {
  const explicitHint = nonEmptyString(dispatchHint)
  if (explicitHint) return explicitHint
  if (!isReadyStatus(readyStatus)) return ""
  return "\u001b[30;42m READY TO DISPATCH \u001b[0m Run `/pi-dispatch` or switch to `@pi` to dispatch this backlog."
}

export function renderCanonicalMicIntakeCard({
  verbatim,
  agentReadable,
  tasks = [],
  questionStatus = "none",
  openQuestions = [],
  resolvedNotes = [],
  readyStatus = "PENDING",
  readyReason = "",
  dispatchHint = "",
} = {}) {
  const taskLines = (Array.isArray(tasks) ? tasks : [])
    .map((task) => renderTaskLine(task))
    .filter(Boolean)
  const openLines = normalizeList(openQuestions)
  const resolvedLines = normalizeList(resolvedNotes)
  const footerHint = renderDispatchHintFooter(readyStatus, dispatchHint)
  const readyBadge = renderReadyBadge(readyStatus)
  const questionBadge = renderQuestionStatusBadge(questionStatus)

  const lines = [
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.asIsHeader),
    `You > ${nonEmptyString(verbatim)}`,
    `Mic > ${nonEmptyString(agentReadable)}`,
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.taskListHeader),
    ...(taskLines.length > 0
      ? [`${ANSI.dim}(${renderTaskSummary(tasks)})${ANSI.reset}`, ...taskLines]
      : [`${ANSI.dim}(no tasks yet)${ANSI.reset}`]),
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.questionsHeader),
    `Status: ${questionBadge}`,
    ...(openLines.length > 0 ? ["Open:", ...openLines.map((line) => `- ${line}`)] : []),
    ...(resolvedLines.length > 0 ? ["Resolved:", ...resolvedLines.map((line) => `- ${line}`)] : []),
    ...(openLines.length === 0 && resolvedLines.length === 0 ? [`${ANSI.dim}None for now.${ANSI.reset}`] : []),
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.readyHeader),
    readyBadge,
    ...(nonEmptyString(readyReason) ? [`Reason: ${nonEmptyString(readyReason)}`] : []),
    ...(footerHint ? ["", footerHint] : []),
  ]

  return `${lines.join("\n")}\n`
}
