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

function renderReadyBadge(readyStatus) {
  if (isReadyStatus(readyStatus)) return `**[ READY ]**`
  return `**[ PENDING ]**`
}

function renderQuestionStatusBadge(status) {
  const text = nonEmptyString(status).toLowerCase()
  if (text === "none" || !text) return `*none*`
  if (text === "awaiting_user" || text === "pending") return `**awaiting_user**`
  return text
}

function renderTaskSummary(tasks) {
  const count = Array.isArray(tasks) ? tasks.length : 0
  if (count === 0) return `*(no tasks yet)*`
  return `${count} task${count === 1 ? "" : "s"}`
}

function renderDispatchHintFooter(readyStatus, dispatchHint = "") {
  const explicitHint = nonEmptyString(dispatchHint)
  if (explicitHint) return explicitHint
  if (!isReadyStatus(readyStatus)) return ""
  return "**READY TO DISPATCH** Run `/pi-dispatch` or switch to `@pi` to dispatch this backlog."
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
      ? [`*(${renderTaskSummary(tasks)})*`, ...taskLines]
      : ["*(no tasks yet)*"]),
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.questionsHeader),
    `Status: ${questionBadge}`,
    ...(openLines.length > 0 ? ["Open:", ...openLines.map((line) => `- ${line}`)] : []),
    ...(resolvedLines.length > 0 ? ["Resolved:", ...resolvedLines.map((line) => `- ${line}`)] : []),
    ...(openLines.length === 0 && resolvedLines.length === 0 ? ["*None for now.*"] : []),
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.readyHeader),
    readyBadge,
    ...(nonEmptyString(readyReason) ? [`Reason: ${nonEmptyString(readyReason)}`] : []),
    ...(footerHint ? ["", footerHint] : []),
  ]

  return `${lines.join("\n")}\n`
}
