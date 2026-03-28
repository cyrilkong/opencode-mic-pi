import crypto from "node:crypto"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = path.resolve(__dirname, "..")

const STATE_FILES = {
  intakeCard: "intake-card.json",
  dispatchPacket: "dispatch-packet.json",
  workboard: "workboard.json",
  decisionLedger: "decision-ledger.jsonl",
  outcomeSnapshots: "outcome-snapshots.jsonl",
  resumeCapsule: "resume-capsule.json",
  sessionLanguage: "session-language.json",
  interactionMode: "interaction-mode.json",
  relayBridge: "relay-bridge.json",
  modelMatch: "model-match.json",
  modelDiscoveryAudit: "model-discovery-audit.json",
  researchMemory: "research-memory.json",
  memoryPalace: "memory-palace.json",
}

const STATE_KEYS = Object.keys(STATE_FILES)
const GLOBAL_STATE_KEYS = new Set([
  "modelMatch",
  "modelDiscoveryAudit",
])

let activeStateScope = {
  project: null,
  directory: null,
  worktree: null,
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : ""
}

function sanitizeSegment(value, fallback = "project") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned || fallback
}

function extractPathCandidate(value) {
  const direct = nonEmptyString(value)
  if (direct) return direct
  if (!value || typeof value !== "object") return ""

  const candidateKeys = [
    "worktree",
    "directory",
    "dir",
    "path",
    "root",
    "cwd",
    "projectRoot",
  ]
  for (const key of candidateKeys) {
    const candidate = nonEmptyString(value[key])
    if (candidate) return candidate
  }

  return ""
}

function resolveProjectRoot(scope = activeStateScope) {
  const candidate =
    extractPathCandidate(scope?.worktree) ||
    extractPathCandidate(scope?.directory) ||
    extractPathCandidate(scope?.project) ||
    nonEmptyString(process.env.OPENCODE_ROUTER_PROJECT_ROOT) ||
    process.cwd()

  return path.resolve(candidate)
}

export function resolveOpencodeDataRoot() {
  const override =
    nonEmptyString(process.env.OPENCODE_ROUTER_DATA_DIR) ||
    nonEmptyString(process.env.OPENCODE_DATA_DIR)
  if (override) return path.resolve(override)
  const xdgDataHome = nonEmptyString(process.env.XDG_DATA_HOME)
  if (xdgDataHome) return path.resolve(xdgDataHome, "opencode")
  return path.resolve(os.homedir(), ".local", "share", "opencode")
}

export function buildProjectStateKey(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot || process.cwd())
  const name = sanitizeSegment(path.basename(resolvedRoot), "project")
  const hash = crypto.createHash("sha1").update(resolvedRoot).digest("hex").slice(0, 12)
  return `${name}-${hash}`
}

export function configureStateScope(scope = {}) {
  activeStateScope = {
    project: scope?.project ?? null,
    directory: scope?.directory ?? null,
    worktree: scope?.worktree ?? null,
  }
  return getStateScope()
}

export function getStateScope() {
  const dataRoot = resolveOpencodeDataRoot()
  const projectRoot = resolveProjectRoot()
  const projectKey = buildProjectStateKey(projectRoot)
  const pluginRoot = path.resolve(dataRoot, "plugins", "opencode-router")
  const globalDir = path.resolve(pluginRoot, "global")
  const projectDir = path.resolve(pluginRoot, "projects", projectKey)

  return {
    dataRoot,
    pluginRoot,
    globalDir,
    projectDir,
    projectRoot,
    projectKey,
  }
}

function resolveStatePathForKey(key, scope = getStateScope()) {
  const fileName = STATE_FILES[key]
  if (!fileName) return null
  const targetDir = GLOBAL_STATE_KEYS.has(key) ? scope.globalDir : scope.projectDir
  return path.resolve(targetDir, fileName)
}

function createDynamicPathMap(resolvePath) {
  const map = {}
  for (const key of STATE_KEYS) {
    Object.defineProperty(map, key, {
      enumerable: true,
      configurable: false,
      get() {
        return resolvePath(key, getStateScope())
      },
    })
  }
  return Object.freeze(map)
}

export const STATE_PATHS = createDynamicPathMap(resolveStatePathForKey)
