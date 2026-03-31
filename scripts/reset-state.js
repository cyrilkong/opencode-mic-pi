const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function parseScope(args) {
  const scopes = ["--project", "--global", "--all"].filter((flag) => args.includes(flag))
  if (scopes.length > 1) {
    throw new Error("reset-state flags are mutually exclusive: use only one of --project, --global, or --all")
  }
  return scopes[0] || "--project"
}

async function main() {
  const args = process.argv.slice(2)
  const silent = args.includes("--silent")
  const scopeFlag = parseScope(args)
  const repoRoot = path.resolve(__dirname, "..")
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const { getStateScope } = await import(pathsUrl)
  const scope = getStateScope()

  function print(line) {
    if (!silent) process.stdout.write(`${line}\n`)
  }

  const targets = scopeFlag === "--all"
    ? [{ label: "plugin state", targetPath: scope.pluginRoot }]
    : scopeFlag === "--global"
      ? [{ label: "global state", targetPath: scope.globalDir }]
      : [{ label: "project state", targetPath: scope.projectDir }]

  for (const target of targets) {
    const exists = fs.existsSync(target.targetPath)
    fs.rmSync(target.targetPath, { recursive: true, force: true })
    print(`${exists ? "RESET" : "SKIP"}: ${target.label} -> ${target.targetPath}`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "reset-state failed"}\n`)
  process.exit(1)
})
