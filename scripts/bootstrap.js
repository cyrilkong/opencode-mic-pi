const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")

  const mode = process.argv.includes("--write") ? "write" : "check"
  const overwrite = process.argv.includes("--overwrite")

  // Bootstrap only handles the router config file.
  // Agents, commands, and prompts are injected via the plugin config hook — no file surfaces needed.

  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const {
    buildUserManagedRouterConfigTemplate,
    resolveGlobalConfigPath,
    writeRouterConfigFile,
  } = await import(routerConfigUrl)
  const configTarget = resolveGlobalConfigPath()

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
    return
  }

  const targetExists = fs.existsSync(configTarget)
  process.stdout.write(
    `CHECK: opencode-router.json ${targetExists ? "exists" : "missing"} at ${configTarget}\n`,
  )
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "bootstrap failed"}\n`)
  process.exitCode = 1
})
