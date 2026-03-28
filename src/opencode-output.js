function collectStrings(value, bucket = []) {
  if (typeof value === "string") {
    bucket.push(value)
    return bucket
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, bucket)
    return bucket
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectStrings(nested, bucket)
  }
  return bucket
}

function collectVisibleTextParts(value, bucket = []) {
  if (!value) return bucket
  if (Array.isArray(value)) {
    for (const item of value) collectVisibleTextParts(item, bucket)
    return bucket
  }
  if (typeof value !== "object") return bucket
  if (value.type === "text" && typeof value.text === "string") {
    bucket.push(value.text)
    return bucket
  }
  for (const nested of Object.values(value)) collectVisibleTextParts(nested, bucket)
  return bucket
}

function extractTextFromStructuredOutput(parsed) {
  const visibleText = collectVisibleTextParts(parsed)
  if (visibleText.length > 0) return visibleText.join("\n")
  return collectStrings(parsed).join("\n")
}

function isLikelyJsonLine(line) {
  return /^\s*(?:\{|\[|"|-?\d|true\b|false\b|null\b)/.test(String(line || ""))
}

function parseJsonLinesDetailed(lines) {
  const parsedLines = []
  const malformedLines = []
  let jsonLikeLineCount = 0

  for (const [index, line] of lines.entries()) {
    const jsonLike = isLikelyJsonLine(line)
    if (jsonLike) jsonLikeLineCount += 1
    try {
      parsedLines.push(JSON.parse(line))
    } catch {
      malformedLines.push({ lineNumber: index + 1, jsonLike })
    }
  }

  return {
    parsedLines,
    malformedLines,
    totalLines: lines.length,
    allParsed: malformedLines.length === 0,
    looksLikeNdjson:
      lines.length > 0 &&
      parsedLines.length > 0 &&
      (jsonLikeLineCount === lines.length || malformedLines.every((line) => line.jsonLike)),
  }
}

export function inspectOpencodeOutput(output) {
  if (output && typeof output === "object") {
    return {
      text: extractTextFromStructuredOutput(output),
      diagnostics: [],
      format: "structured",
    }
  }

  const trimmed = String(output || "").trim()
  if (!trimmed) {
    return { text: "", diagnostics: [], format: "empty" }
  }

  try {
    const parsed = JSON.parse(trimmed)
    return {
      text: extractTextFromStructuredOutput(parsed),
      diagnostics: [],
      format: "json",
    }
  } catch {
    const lines = trimmed.split(/\r?\n/).filter(Boolean)
    const details = parseJsonLinesDetailed(lines)
    if (details.parsedLines.length > 0 && (details.allParsed || details.looksLikeNdjson)) {
      return {
        text: extractTextFromStructuredOutput(details.parsedLines),
        diagnostics: [],
        format: "ndjson",
      }
    }

    return {
      text: trimmed,
      diagnostics: [],
      format: "text",
    }
  }
}
