const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function parseResetTargets(args) {
  const explicitTargets = ["--config", "--policy", "--all"].filter((flag) => args.includes(flag))
  if (explicitTargets.length > 1) {
    throw new Error("reset-profile flags are mutually exclusive: use only one of --config, --policy, or --all")
  }
  if (explicitTargets[0] === "--config") return { config: true, policy: false }
  if (explicitTargets[0] === "--policy") return { config: false, policy: true }
  return { config: true, policy: true }
}

async function main() {
  const args = process.argv.slice(2)
  const silent = args.includes("--silent")
  const { config: resetConfig, policy: resetPolicy } = parseResetTargets(args)
  const repoRoot = path.resolve(__dirname, "..")
  const routerConfigUrl = pathToFileURL(path.resolve(repoRoot, "src", "router-config.js")).href
  const modelMatchUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-match.js")).href
  const {
    buildUserManagedRouterConfigTemplate,
    resolveGlobalConfigPath,
    writeRouterConfigFile,
  } = await import(routerConfigUrl)
  const {
    renderDefaultModelMatchPolicyMarkdown,
    resolveGlobalModelMatchPolicyPath,
    writeModelMatchPolicyMarkdownFile,
  } = await import(modelMatchUrl)

  function print(line) {
    if (!silent) process.stdout.write(`${line}\n`)
  }

  if (resetConfig) {
    const targetPath = resolveGlobalConfigPath()
    const result = writeRouterConfigFile({
      config: buildUserManagedRouterConfigTemplate(),
      targetPath,
      backup: fs.existsSync(targetPath),
    })
    if (result.wrote) {
      print(`RESET: router config -> ${result.path}`)
      if (result.backupPath) {
        print(`Rollback backup: ${result.backupPath}`)
      }
    } else {
      print(`SKIP: router config already matches defaults -> ${result.path}`)
    }
  }

  if (resetPolicy) {
    const targetPath = resolveGlobalModelMatchPolicyPath()
    const result = writeModelMatchPolicyMarkdownFile({
      markdown: renderDefaultModelMatchPolicyMarkdown(),
      targetPath,
      backup: fs.existsSync(targetPath),
    })
    if (result.wrote) {
      print(`RESET: model-match policy -> ${result.path}`)
      if (result.backupPath) {
        print(`Rollback backup: ${result.backupPath}`)
      }
    } else {
      print(`SKIP: model-match policy already matches defaults -> ${result.path}`)
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "reset-profile failed"}\n`)
  process.exit(1)
})
