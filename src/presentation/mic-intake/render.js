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

export function renderCanonicalMicIntakeCard({
  verbatim,
  agentReadable,
  tasks = [],
  questionStatus = "none",
  openQuestions = [],
  resolvedNotes = [],
  readyStatus = "PENDING",
  readyReason = "",
} = {}) {
  const taskLines = (Array.isArray(tasks) ? tasks : [])
    .map((task) => renderTaskLine(task))
    .filter(Boolean)
  const openLines = normalizeList(openQuestions)
  const resolvedLines = normalizeList(resolvedNotes)

  const lines = [
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.asIsHeader),
    `You > ${nonEmptyString(verbatim)}`,
    `Mic > ${nonEmptyString(agentReadable)}`,
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.taskListHeader),
    ...taskLines,
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.questionsHeader),
    `Status: ${nonEmptyString(questionStatus) || "none"}`,
    ...(openLines.length > 0 ? ["Open:", ...openLines.map((line) => `- ${line}`)] : []),
    ...(resolvedLines.length > 0 ? ["Resolved:", ...resolvedLines.map((line) => `- ${line}`)] : []),
    ...(openLines.length === 0 && resolvedLines.length === 0 ? ["None for now."] : []),
    "",
    renderMicSectionHeader(MIC_INTAKE_CARD_STYLE.readyHeader),
    `Status: ${nonEmptyString(readyStatus) || "PENDING"}`,
    ...(nonEmptyString(readyReason) ? [`Reason: ${nonEmptyString(readyReason)}`] : []),
  ]

  return `${lines.join("\n")}\n`
}
