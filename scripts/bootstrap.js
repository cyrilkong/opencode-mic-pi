const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")

  const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--seed") ? "seed" : "check"
  const overwrite = process.argv.includes("--overwrite")
  const writeModelPolicy = process.argv.includes("--write-model-policy")

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
  } = await import(modelMatchUrl)
  const configTarget = resolveGlobalConfigPath()
  const policyTarget = resolveGlobalModelMatchPolicyPath()

  const maybeWriteModelPolicy = () => {
    const targetExists = fs.existsSync(policyTarget)
    if (targetExists && !overwrite) {
      process.stdout.write(`SKIP: ${policyTarget} already exists (use --overwrite to replace)\n`)
      return
    }
    fs.mkdirSync(path.dirname(policyTarget), { recursive: true })
    fs.writeFileSync(policyTarget, renderDefaultModelMatchPolicyMarkdown(), "utf8")
    process.stdout.write(`SYNC: generated default model-match policy markdown -> ${policyTarget}\n`)
  }

  if (mode === "seed") {
    let seeded = false
    if (!fs.existsSync(configTarget)) {
      const defaultConfig = buildUserManagedRouterConfigTemplate()
      fs.mkdirSync(path.dirname(configTarget), { recursive: true })
      writeRouterConfigFile({ config: defaultConfig, targetPath: configTarget })
      process.stdout.write(`SEED: created default opencode-router.json -> ${configTarget}\n`)
      seeded = true
    }
    if (!fs.existsSync(policyTarget)) {
      fs.mkdirSync(path.dirname(policyTarget), { recursive: true })
      fs.writeFileSync(policyTarget, renderDefaultModelMatchPolicyMarkdown(), "utf8")
      process.stdout.write(`SEED: created default model-match policy markdown -> ${policyTarget}\n`)
      seeded = true
    }
    if (!seeded) {
      process.stdout.write("SEED: all config surfaces already exist, nothing to do\n")
    }
    return
  }

  if (mode === "write") {
    const targetExists = fs.existsSync(configTarget)
    if (targetExists && !overwrite) {
      process.stdout.write(`SKIP: ${configTarget} already exists (use --overwrite to replace)\n`)
      return
    }

    const defaultConfig = buildUserManagedRouterConfigTemplate()
    const writeResult = writeRouterConfigFile({
      config: defaultConfig,
      targetPath: configTarget,
      backup: overwrite && targetExists,
    })
    if (!writeResult.wrote && writeResult.skipped === "unchanged") {
      process.stdout.write(`SKIP: opencode-router.json already matches schema defaults at ${configTarget}\n`)
      return
    }
    process.stdout.write(`SYNC: generated default opencode-router.json -> ${configTarget}\n`)
    if (writeResult.backupPath) {
      process.stdout.write(`Rollback backup: ${writeResult.backupPath}\n`)
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
  process.stdout.write(
    `CHECK: opencode-router.json ${targetExists ? "exists" : "missing"} at ${configTarget}\n`,
  )
  process.stdout.write(
    `CHECK: model-match policy markdown ${fs.existsSync(policyTarget) ? "exists" : "missing"} at ${policyTarget}\n`,
  )
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "bootstrap failed"}\n`)
  process.exitCode = 1
})
