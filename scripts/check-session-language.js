const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, content: "" }
  return { exists: true, content: fs.readFileSync(filePath, "utf8") }
}

function restoreFile(filePath, backup) {
  if (backup.exists) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, backup.content, "utf8")
    return
  }
  try {
    fs.unlinkSync(filePath)
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const tempHome = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-lang-home-"))
  const tempDataDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "opencode-router-lang-data-"))
  process.env.HOME = tempHome
  process.env.OPENCODE_ROUTER_DATA_DIR = tempDataDir
  process.env.OPENCODE_ROUTER_DISABLE_AUTO_REMATCH = "1"
  delete process.env.OPENCODE_ROUTER_CONFIG
  delete process.env.OPENCODE_ROUTER_MODEL_MATCH_POLICY_MARKDOWN
  const moduleUrl = pathToFileURL(path.resolve(repoRoot, "src", "session-language.js")).href
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const pluginUrl = pathToFileURL(path.resolve(repoRoot, "plugins", "opencode-router.js")).href
  const { captureLanguageFromText, detectSystemLanguage, readSessionLanguage } = await import(moduleUrl)
  const { STATE_PATHS } = await import(pathsUrl)
  const { OpenCodeRouterPlugin } = await import(pluginUrl)

  const backup = backupFile(STATE_PATHS.sessionLanguage)
  const envBackup = {
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    LC_MESSAGES: process.env.LC_MESSAGES,
    LANGUAGE: process.env.LANGUAGE,
  }
  try {
    try {
      fs.unlinkSync(STATE_PATHS.sessionLanguage)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }

    const first = captureLanguageFromText("请帮我整理今天的任务清单", "user_input")
    assert(first.language === "zh", "expected first language capture to resolve zh")

    const mixed = captureLanguageFromText("Please keep current language but process this TODO list", "user_input")
    assert(mixed.language === "zh", "expected configured language to stay stable under mixed-language noise")

    const switched = captureLanguageFromText("switch to english", "user_input")
    assert(switched.language === "en", "expected explicit language switch to override sticky setting")

    const keepAfterSwitch = captureLanguageFromText("下一步我们继续", "user_input")
    assert(keepAfterSwitch.language === "en", "expected sticky language to persist after explicit switch")

    restoreFile(STATE_PATHS.sessionLanguage, { exists: false, content: "" })
    process.env.LANG = "zh_CN.UTF-8"
    delete process.env.LC_ALL
    delete process.env.LC_MESSAGES
    delete process.env.LANGUAGE

    const systemDetected = detectSystemLanguage()
    assert(systemDetected === "zh", "expected system locale detection to resolve zh from LANG")

    const pickedByZero = captureLanguageFromText("0", "user_input")
    assert(pickedByZero.language === "zh", "expected option 0 to resolve detected system language")
    assert(pickedByZero.source === "system_locale", "expected option 0 to persist system_locale source")

    restoreFile(STATE_PATHS.sessionLanguage, { exists: false, content: "" })
    const pickedByMenuNumber = captureLanguageFromText("2", "user_input")
    assert(pickedByMenuNumber.language === "en", "expected numbered menu selection to resolve english")

    const persisted = readSessionLanguage()
    assert(persisted.language === "en", "expected persisted language to match explicit switch")
    assert(persisted.configured === true, "expected session language configured flag")

    restoreFile(STATE_PATHS.sessionLanguage, { exists: false, content: "" })
    const plugin = await OpenCodeRouterPlugin({
      client: {
        app: { log: async () => {} },
        session: { prompt: async () => {} },
        tui: { toast: { show: async () => {} } },
      },
    })
    await plugin["chat.message"](
      {
        sessionID: "lang-session",
        messageID: "lang-user-1",
        agent: "mic",
      },
      {
        message: {
          id: "lang-user-1",
          sessionID: "lang-session",
          role: "user",
          agent: "mic",
        },
        parts: [{ type: "text", text: "帮我整理 /pi-dispatch 的最小验证任务。" }],
      },
    )
    const capturedFromChatMessage = readSessionLanguage()
    assert(capturedFromChatMessage.language === "zh", "expected chat.message hook to persist inferred user language before Mic replies")

    process.stdout.write("PASS: session-language capture supports sticky language, numbered menu picks, and system-locale option\n")
  } finally {
    restoreFile(STATE_PATHS.sessionLanguage, backup)
    for (const [key, value] of Object.entries(envBackup)) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
