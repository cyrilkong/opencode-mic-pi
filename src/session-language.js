import { DEFAULT_LANGUAGE } from "./contracts.js"
import { readJson, writeJson } from "./fs-store.js"
import { STATE_PATHS } from "./paths.js"

const SUPPORTED = new Set(["zh", "en", "ja", "ko", "es", "fr"])
const LANGUAGE_MENU_OPTIONS = Object.freeze({
  0: "system",
  1: "zh",
  2: "en",
  3: "ja",
  4: "ko",
  5: "es",
  6: "fr",
})
const LANGUAGE_ALIASES = {
  zh: ["zh", "chinese", "中文", "简体中文", "繁體中文", "汉语", "漢語"],
  en: ["en", "english", "英文", "英语", "英語"],
  ja: ["ja", "jp", "japanese", "日本語", "日语", "日語"],
  ko: ["ko", "korean", "한국어", "韩语", "韓語"],
  es: ["es", "spanish", "español", "espanol", "西班牙语", "西班牙語"],
  fr: ["fr", "french", "français", "francais", "法语", "法語"],
}
const SYSTEM_LANGUAGE_ALIASES = [
  "0",
  "system",
  "detect system language",
  "system language",
  "auto detect system language",
  "检测本机系统语言",
  "检测本机语言",
  "自动检测本机语言",
  "自动检测系统语言",
]
const EXPLICIT_SWITCH_CUES = [
  "switch",
  "use",
  "speak",
  "reply",
  "respond",
  "language",
  "请用",
  "請用",
  "切换",
  "切換",
  "改成",
  "改為",
  "改为",
  "換成",
  "转成",
  "轉成",
]
const SYSTEM_ENV_KEYS = ["LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"]

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

export function detectSystemLanguage(env = process.env) {
  for (const key of SYSTEM_ENV_KEYS) {
    const value = String(env?.[key] || "").trim()
    if (!value) continue
    const language = parseLanguageFromLocale(value)
    if (language) return language
  }
  return DEFAULT_LANGUAGE
}

export function readSessionLanguage() {
  const state = readJson(STATE_PATHS.sessionLanguage, {
    language: DEFAULT_LANGUAGE,
    source: "default",
    configured: false,
    updated_at: null,
  })
  const language = SUPPORTED.has(state?.language) ? state.language : DEFAULT_LANGUAGE
  return {
    language,
    source: typeof state?.source === "string" ? state.source : "default",
    configured: Boolean(state?.configured) || Boolean(state?.updated_at),
    updated_at: state?.updated_at || null,
  }
}

export function writeSessionLanguage(language, source = "auto") {
  const resolved = SUPPORTED.has(language) ? language : DEFAULT_LANGUAGE
  return writeJson(STATE_PATHS.sessionLanguage, {
    language: resolved,
    source,
    configured: true,
    updated_at: new Date().toISOString(),
  })
}

export function captureLanguageFromText(text, source = "auto") {
  const explicit = parseExplicitLanguageSwitch(text)
  if (explicit) {
    const resolved = explicit === "system" ? detectSystemLanguage() : explicit
    const resolvedSource = explicit === "system"
      ? "system_locale"
      : (source === "user_input" ? "explicit_switch" : source)
    return writeSessionLanguage(resolved, resolvedSource)
  }

  const current = readSessionLanguage()
  if (current.configured) {
    return current
  }

  const normalized = String(text || "").trim().toLowerCase()
  const byOption = LANGUAGE_MENU_OPTIONS[normalized]
  const language = byOption === "system"
    ? detectSystemLanguage()
    : (SUPPORTED.has(normalized) ? normalized : detectLanguageFromText(text))
  return writeSessionLanguage(language, source)
}

function parseExplicitLanguageSwitch(text) {
  const raw = String(text || "").trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  const option = LANGUAGE_MENU_OPTIONS[lower]
  if (option) {
    return option
  }

  for (const alias of SYSTEM_LANGUAGE_ALIASES) {
    const normalizedAlias = alias.toLowerCase()
    if (lower === normalizedAlias) return "system"
    if (!matchesAlias(lower, normalizedAlias)) continue
    if (EXPLICIT_SWITCH_CUES.some((cue) => lower.includes(cue))) {
      return "system"
    }
  }

  for (const [language, aliases] of Object.entries(LANGUAGE_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase()
      if (lower === normalizedAlias) {
        return language
      }
      if (!matchesAlias(lower, normalizedAlias)) continue
      if (EXPLICIT_SWITCH_CUES.some((cue) => lower.includes(cue))) {
        return language
      }
    }
  }
  return null
}

function matchesAlias(text, alias) {
  if (!text || !alias) return false
  const isShortAsciiToken = /^[a-z0-9-]{1,3}$/.test(alias)
  if (!isShortAsciiToken) {
    return text.includes(alias)
  }
  const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i")
  return pattern.test(text)
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseLanguageFromLocale(locale) {
  const value = String(locale || "").trim().toLowerCase()
  if (!value) return null
  const primary = value
    .replace(/\..*$/u, "")
    .replace(/@.*$/u, "")
    .split(/[_-]/u)[0]
    .trim()
  return SUPPORTED.has(primary) ? primary : null
}
