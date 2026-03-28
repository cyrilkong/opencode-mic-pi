import fs from "node:fs"
import path from "node:path"

export function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback
    }
    throw error
  }
}

export function writeJson(filePath, data) {
  ensureDir(filePath)
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
  return data
}

export function appendJsonLine(filePath, entry) {
  ensureDir(filePath)
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8")
  return entry
}

export function writeJsonLines(filePath, entries = []) {
  ensureDir(filePath)
  const normalized = Array.isArray(entries) ? entries : []
  const body = normalized.map((entry) => JSON.stringify(entry)).join("\n")
  fs.writeFileSync(filePath, `${body}${body ? "\n" : ""}`, "utf8")
  return normalized
}

export function readJsonLines(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

export function compactJsonLines(filePath, limit = 0) {
  const max = Number.isInteger(limit) && limit > 0 ? limit : 0
  if (max === 0) return { changed: false, kept: 0, removed: 0 }
  const lines = readJsonLines(filePath)
  if (lines.length <= max) {
    return { changed: false, kept: lines.length, removed: 0 }
  }
  const compacted = lines.slice(-max)
  writeJsonLines(filePath, compacted)
  return { changed: true, kept: compacted.length, removed: lines.length - compacted.length }
}

export function copyFileIfMissing(fromPath, toPath) {
  ensureDir(toPath)
  if (fs.existsSync(toPath)) {
    return { changed: false, reason: "exists" }
  }
  fs.copyFileSync(fromPath, toPath)
  return { changed: true, reason: "copied" }
}

export function exists(filePath) {
  return fs.existsSync(filePath)
}

export function removeFileIfExists(filePath) {
  try {
    fs.unlinkSync(filePath)
    return { changed: true, reason: "removed" }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { changed: false, reason: "missing" }
    }
    throw error
  }
}
