const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")

  const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--seed") ? "seed" : "check"
  const overwrite = process.argv.includes("--overwrite")
  const writeModelPolicy = process.argv.includes("--write-model-policy")
  const silent = process.argv.includes("--silent")
  const postinstall = process.argv.includes("--postinstall")

  function envFlag(name, fallback = false) {
    const raw = String(process.env[name] || "").trim().toLowerCase()
    if (!raw) return fallback
    if (["1", "true", "yes", "on"].includes(raw)) return true
    if (["0", "false", "no", "off"].includes(raw)) return false
    return fallback
  }

  function print(line) {
    if (!silent) process.stdout.write(`${line}\n`)
  }

  // Bootstrap only handles the router config file.
  // Agents, commands, and prompts are injected via the plugin config hook — no file surfaces needed.

  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const {
    buildUserManagedRouterConfigTemplate,
    resolveGlobalConfigPath,
    writeRouterConfigFile,
  } = await import(routerConfigUrl)
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const {
    renderDefaultModelMatchPolicyMarkdown,
    resolveGlobalModelMatchPolicyPath,
    writeModelMatchPolicyMarkdownFile,
  } = await import(modelMatchUrl)
  const configTarget = resolveGlobalConfigPath()
  const policyTarget = resolveGlobalModelMatchPolicyPath()

  if (postinstall && !envFlag("OPENCODE_ROUTER_POSTINSTALL_SEED", false)) {
    return
  }

  const maybeWriteModelPolicy = () => {
    const targetExists = fs.existsSync(policyTarget)
    if (targetExists && !overwrite) {
      print(`SKIP: ${policyTarget} already exists (use --overwrite to replace)`)
      return
    }
    const writeResult = writeModelMatchPolicyMarkdownFile({
      markdown: renderDefaultModelMatchPolicyMarkdown(),
      targetPath: policyTarget,
      backup: overwrite && targetExists,
    })
    if (!writeResult.wrote && writeResult.skipped === "unchanged") {
      print(`SKIP: model-match policy markdown already matches bundled defaults at ${policyTarget}`)
      return
    }
    print(`SYNC: generated default model-match policy markdown -> ${policyTarget}`)
    if (writeResult.backupPath) {
      print(`Rollback backup: ${writeResult.backupPath}`)
    }
  }

  if (mode === "seed") {
    let seeded = false
    if (!fs.existsSync(configTarget)) {
      const defaultConfig = buildUserManagedRouterConfigTemplate()
      fs.mkdirSync(path.dirname(configTarget), { recursive: true })
      writeRouterConfigFile({ config: defaultConfig, targetPath: configTarget })
      print(`SEED: created default opencode-router.json -> ${configTarget}`)
      seeded = true
    }
    if (!fs.existsSync(policyTarget)) {
      writeModelMatchPolicyMarkdownFile({
        markdown: renderDefaultModelMatchPolicyMarkdown(),
        targetPath: policyTarget,
        backup: false,
      })
      print(`SEED: created default model-match policy markdown -> ${policyTarget}`)
      seeded = true
    }
    if (!seeded) {
      print("SEED: all config surfaces already exist, nothing to do")
    }
    return
  }

  if (mode === "write") {
    const targetExists = fs.existsSync(configTarget)
    if (targetExists && !overwrite) {
      print(`SKIP: ${configTarget} already exists (use --overwrite to replace)`)
      return
    }

    const defaultConfig = buildUserManagedRouterConfigTemplate()
    const writeResult = writeRouterConfigFile({
      config: defaultConfig,
      targetPath: configTarget,
      backup: overwrite && targetExists,
    })
    if (!writeResult.wrote && writeResult.skipped === "unchanged") {
      print(`SKIP: opencode-router.json already matches schema defaults at ${configTarget}`)
      return
    }
    print(`SYNC: generated default opencode-router.json -> ${configTarget}`)
    if (writeResult.backupPath) {
      print(`Rollback backup: ${writeResult.backupPath}`)
    }
    if (writeModelPolicy) {
      maybeWriteModelPolicy()
    }
    return
  }

  if (writeModelPolicy) {
    maybeWriteModelPolicy()
    return
  }

  const targetExists = fs.existsSync(configTarget)
  print(`CHECK: opencode-router.json ${targetExists ? "exists" : "missing"} at ${configTarget}`)
  print(`CHECK: model-match policy markdown ${fs.existsSync(policyTarget) ? "exists" : "missing"} at ${policyTarget}`)
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "bootstrap failed"}\n`)
  process.exitCode = 1
})
