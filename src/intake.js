import { DEFAULT_LANGUAGE, SCHEMA_VERSION, createId } from "./contracts.js"
import {
  MIC_INTAKE_PARSE_FIELD_ALIASES,
  MIC_INTAKE_PARSE_SECTION_LABELS,
} from "./intake-parser-contract.js"

const SECTION_LABELS = MIC_INTAKE_PARSE_SECTION_LABELS
const FIELD_SEPARATOR_PATTERN = "(?:[:：]|>)"

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isPlaceholderTaskLine(value) {
  return /^(?:none(?:\s+yet|\s+for\s+now)?|no\s+tasks?|nothing\s+yet|tbd|n\/a|na|暂无(?:任务|内容)?|待补充|未定|空)[.!?。．…]*$/i.test(String(value || "").trim())
}

function normalizeHeaderText(value) {
  return String(value || "")
    .replace(/^\s*(?:◇|◆|■|███)\s*/u, "")
    .replace(/_/g, " ")
    .replace(/[>？?:：]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

function isSectionHeaderLine(line, labels = SECTION_LABELS) {
  const normalizedLine = normalizeHeaderText(line)
  if (!normalizedLine) return false
  return labels.some((label) => normalizeHeaderText(label) === normalizedLine)
}

function extractSection(text, labels) {
  const lines = String(text || "").split(/\r?\n/)
  let start = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isSectionHeaderLine(lines[index], labels)) {
      start = index
      break
    }
  }
  if (start === -1) return ""

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isSectionHeaderLine(lines[index])) {
      end = index
      break
    }
  }

  return lines.slice(start, end).join("\n")
}

function getSectionBodyLines(text, labels) {
  const section = extractSection(text, labels)
  if (!section) return []

  return section
    .split(/\r?\n/)
    .slice(1)
    .map((line) => String(line || "").replace(/^\s*[│┃]\s?/, "").trim())
    .filter(Boolean)
}

function matchFieldLine(line, labels = []) {
  const normalizedLabels = labels.map((label) => escapeRegExp(String(label || "").trim())).join("|")
  if (!normalizedLabels) return null
  return String(line || "").match(new RegExp(`^(?:${normalizedLabels})\\s*${FIELD_SEPARATOR_PATTERN}\\s*(.+)$`, "i"))
}

function detectLanguageFromText(text) {
  const value = String(text || "").trim()
  if (!value) return DEFAULT_LANGUAGE
  if (/[\uac00-\ud7af]/.test(value)) return "ko"
  if (/[\u3040-\u30ff]/.test(value)) return "ja"
  if (/[\u4e00-\u9fff]/.test(value)) return "zh"
  if (/[¿¡]|\b(hola|gracias|proyecto|objetivo|tarea)\b/i.test(value)) return "es"
  if (/[àâæçéèêëîïôœùûüÿ]/i.test(value) || /\b(bonjour|merci|projet|objectif)\b/i.test(value)) {
    return "fr"
  }
  return DEFAULT_LANGUAGE
}

function extractAsIs(text) {
  const section = extractSection(text, ["AS-IS"])
  const verbatim =
    section
      .match(
        new RegExp(
          `(?:^|\\n)\\s*(?:${MIC_INTAKE_PARSE_FIELD_ALIASES.verbatim.map(escapeRegExp).join("|")})\\s*${FIELD_SEPARATOR_PATTERN}\\s*(.+)\\s*(?:$|\\n)`,
          "i",
        ),
      )?.[1]
      ?.trim() || ""
  const agentReadable =
    section
      .match(
        new RegExp(
          `(?:^|\\n)\\s*(?:${MIC_INTAKE_PARSE_FIELD_ALIASES.agentReadable.map(escapeRegExp).join("|")})\\s*${FIELD_SEPARATOR_PATTERN}\\s*(.+)\\s*(?:$|\\n)`,
          "i",
        ),
      )?.[1]
      ?.trim() || ""

  return { verbatim, agentReadable }
}

function parseTaskList(text) {
  const lines = getSectionBodyLines(text, ["TASK LIST"])
  return lines
    .map((line, index) => {
      const cleaned = String(line || "")
        .replace(/^\s*(?:[-*•]\s+|\d+\.\s+)/, "")
        .trim()
      if (isPlaceholderTaskLine(cleaned)) {
        return null
      }
      const tagged = cleaned.match(/^\[(.+?)\]\s*(.+)$/)
      const taggedText = tagged?.[2]?.trim() || cleaned.trim()
      if (isPlaceholderTaskLine(taggedText)) {
        return null
      }
      return {
        id: `task-${String(index + 1).padStart(2, "0")}`,
        tag: tagged?.[1]?.trim() || null,
        task: taggedText,
      }
    })
    .filter((item) => item && item.task)
}

function parseQuestions(text, ready) {
  const lines = getSectionBodyLines(text, ["QUESTIONS"])
  const statusLine = lines
    .map((line) => matchFieldLine(line, MIC_INTAKE_PARSE_FIELD_ALIASES.questionStatus))
    .find(Boolean)
  const statusDetail = statusLine?.[1]?.trim() || ""
  const explicitStatus = normalizeQuestionStatus(statusDetail)

  const items = []
  let mode = explicitStatus === "resolved" ? "resolved" : "open"

  for (const rawLine of lines) {
    const line = String(rawLine || "").replace(/^\s*(?:[-*•]\s+|\d+\.\s+)/, "").trim()
    if (!line) continue
    if (matchFieldLine(line, MIC_INTAKE_PARSE_FIELD_ALIASES.questionIgnoredHeaders)) continue

    const openHeader = matchFieldLine(line, MIC_INTAKE_PARSE_FIELD_ALIASES.questionOpenHeaders)
    if (openHeader) {
      mode = "open"
      if (openHeader[1]?.trim()) items.push(openHeader[1].trim())
      continue
    }

    const resolvedHeader = matchFieldLine(line, MIC_INTAKE_PARSE_FIELD_ALIASES.questionResolvedHeaders)
    if (resolvedHeader) {
      mode = "resolved"
      continue
    }

    if (/^(?:Open|Pending|Need From User|Awaiting|Resolved|Answered|Settled)\s*[:：]?\s*$/i.test(line)) {
      mode = /^(?:Resolved|Answered|Settled)\s*[:：]?\s*$/i.test(line) ? "resolved" : "open"
      continue
    }

    if (/^none(?:\s+for\s+now)?\.?$/i.test(line)) continue
    if (mode === "resolved") continue
    items.push(line)
  }

  if (items.length === 0 && (!statusDetail || explicitStatus === "none" || explicitStatus === "resolved")) {
    return {
      status: ready ? "resolved" : explicitStatus || "none",
      items: [],
      status_detail: statusDetail || null,
    }
  }

  return {
    status: ready ? "resolved" : explicitStatus === "resolved" ? "pending" : explicitStatus || "pending",
    items: ready ? [] : items,
    status_detail: statusDetail || null,
  }
}

function normalizeQuestionStatus(value) {
  const text = String(value || "").trim().toLowerCase()
  if (!text) return null
  if (/(resolved|answered|settled|closed)/i.test(text)) return "resolved"
  if (/(none|n\/a|clear)/i.test(text)) return "none"
  if (/(pending|open|await|waiting|blocking|blocked)/i.test(text)) return "pending"
  return null
}

function normalizeReadyStatus(value) {
  const text = String(value || "").trim().toLowerCase()
  if (!text) return null
  if (/(ready|yes|go|dispatch)/i.test(text)) return "ready"
  if (/(pending|no|not ready|blocked|waiting|awaiting|hold|未就绪|待确认)/i.test(text)) return "pending"
  return null
}

const READY_TRUE_PATTERN = /\b(READY!?|\[\s*READY\s*\]|\[\s*🟢\s*READY\s*\]|Status\s*[:：]\s*(?:Yes|Ready)|Yes|是)\b/i
const READY_FALSE_PATTERN = /\b(PENDING|Status\s*[:：]\s*(?:No|Not\s*Ready|Pending|Blocked|Waiting)|No|否|未就绪|not\s*ready)\b/i

export function inspectReadySignal(text) {
  const readySection = extractSection(text, ["READY FOR DISPATCH?"])
  const source = readySection || String(text || "")
  const statusToken =
    readySection
      .match(
        new RegExp(
          `(?:^|\\n)\\s*(?:${MIC_INTAKE_PARSE_FIELD_ALIASES.readyStatus.map(escapeRegExp).join("|")})\\s*${FIELD_SEPARATOR_PATTERN}\\s*(.+)\\s*(?:$|\\n)`,
          "i",
        ),
      )?.[1]
      ?.trim() || ""
  const reason =
    readySection
      .match(
        new RegExp(
          `(?:^|\\n)\\s*(?:${MIC_INTAKE_PARSE_FIELD_ALIASES.readyReason.map(escapeRegExp).join("|")})\\s*${FIELD_SEPARATOR_PATTERN}\\s*(.+)\\s*(?:$|\\n)`,
          "i",
        ),
      )?.[1]
      ?.trim() || ""
  const hasReadySection = Boolean(readySection)
  const normalizedStatus = normalizeReadyStatus(statusToken)
  const ready = normalizedStatus ? normalizedStatus === "ready" : READY_TRUE_PATTERN.test(source) && !READY_FALSE_PATTERN.test(source)
  const explicitNotReady = normalizedStatus ? normalizedStatus === "pending" : READY_FALSE_PATTERN.test(source)
  const unsupportedStatus = Boolean(statusToken) && !normalizedStatus
  return {
    ready: ready && !explicitNotReady,
    hasReadySection,
    statusToken,
    status: normalizedStatus || (ready && !explicitNotReady ? "ready" : "pending"),
    reason: reason || null,
    unsupportedStatus,
  }
}

export function detectReady(text) {
  return inspectReadySignal(text).ready
}

export function inspectIntakeParseState(text) {
  const asIs = extractAsIs(text)
  const taskList = parseTaskList(text)
  const readySignal = inspectReadySignal(text)
  return {
    hasVerbatim: Boolean(asIs.verbatim),
    hasAgentReadable: Boolean(asIs.agentReadable),
    taskCount: taskList.length,
    hasReadySection: readySignal.hasReadySection,
    ready: readySignal.ready,
    readyState: readySignal.status,
    readyReason: readySignal.reason || "",
    unsupportedReadyStatus: readySignal.unsupportedStatus,
    readyStatusToken: readySignal.statusToken || "",
  }
}

export function buildIntakeCard(text) {
  const asIs = extractAsIs(text)
  const taskList = parseTaskList(text)
  const readySignal = inspectReadySignal(text)

  if (!asIs.verbatim || !asIs.agentReadable || taskList.length === 0) {
    return null
  }

  const ready = readySignal.ready
  return {
    schema_version: SCHEMA_VERSION,
    card_type: "intake_card",
    source_agent: "mic",
    language: detectLanguageFromText(asIs.verbatim || asIs.agentReadable || text),
    ready,
    ready_state: {
      status: readySignal.status,
      reason: readySignal.reason || null,
      status_token: readySignal.statusToken || null,
    },
    updated_at: new Date().toISOString(),
    as_is: {
      verbatim: asIs.verbatim,
      agent_readable: asIs.agentReadable,
    },
    task_list: taskList,
    questions: parseQuestions(text, ready),
  }
}

export function buildDispatchPacket(intakeCard) {
  if (!intakeCard?.ready) return null

  return {
    schema_version: SCHEMA_VERSION,
    packet_type: "dispatch_packet",
    packet_id: createId("pkt"),
    created_at: new Date().toISOString(),
    source_agent: "mic",
    target_agent: "pi",
    language: intakeCard.language || DEFAULT_LANGUAGE,
    ready: true,
    as_is: intakeCard.as_is,
    task_list: intakeCard.task_list,
    questions: intakeCard.questions,
  }
}

export function validateDispatchPacket(packet) {
  const errors = []
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    errors.push("packet must be an object")
    return errors
  }

  if (packet?.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be ${SCHEMA_VERSION}`)
  if (packet?.packet_type !== "dispatch_packet") errors.push("packet_type must be dispatch_packet")
  if (!nonEmptyString(packet?.packet_id)) errors.push("packet_id is required")
  if (!isIsoTimestamp(packet?.created_at)) errors.push("created_at must be an ISO timestamp")
  if (packet?.source_agent !== "mic") errors.push("source_agent must be mic")
  if (packet?.target_agent !== "pi") errors.push("target_agent must be pi")
  if (!nonEmptyString(packet?.language)) errors.push("language is required")
  if (packet?.ready !== true) errors.push("ready must be true")
  if (!nonEmptyString(packet?.as_is?.verbatim)) errors.push("as_is.verbatim is required")
  if (!nonEmptyString(packet?.as_is?.agent_readable)) errors.push("as_is.agent_readable is required")
  if (!Array.isArray(packet?.task_list) || packet.task_list.length === 0) {
    errors.push("task_list must contain at least one task")
  } else {
    const ids = new Set()
    for (const task of packet.task_list) {
      if (!task || typeof task !== "object" || Array.isArray(task)) {
        errors.push("task_list items must be objects")
        continue
      }
      if (!nonEmptyString(task.id)) errors.push("task.id is required")
      if (!nonEmptyString(task.task)) errors.push("task.task is required")
      if (nonEmptyString(task.id)) {
        if (ids.has(task.id)) errors.push(`task.id must be unique: ${task.id}`)
        ids.add(task.id)
      }
    }
  }

  if (packet?.questions && typeof packet.questions === "object" && !Array.isArray(packet.questions)) {
    const status = nonEmptyString(packet.questions.status)
    const validStatus = new Set(["none", "pending", "resolved"])
    if (status && !validStatus.has(status)) errors.push("questions.status must be one of none|pending|resolved")
    if (packet.questions.items && !Array.isArray(packet.questions.items)) {
      errors.push("questions.items must be an array when provided")
    }
    if (Array.isArray(packet.questions.items)) {
      for (const item of packet.questions.items) {
        if (!nonEmptyString(item)) errors.push("questions.items must contain non-empty strings")
      }
    }
  } else if (packet?.questions != null) {
    errors.push("questions must be an object when provided")
  }
  return errors
}

function nonEmptyString(value) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function isIsoTimestamp(value) {
  if (!nonEmptyString(value)) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime())
}
