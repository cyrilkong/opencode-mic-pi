#!/usr/bin/env node

const path = require("node:path")
const { spawnSync } = require("node:child_process")

const repoRoot = path.resolve(__dirname, "..")

function runNodeScript(scriptName, argv = []) {
  const scriptPath = path.resolve(repoRoot, "scripts", scriptName)
  const result = spawnSync(process.execPath, [scriptPath, ...argv], {
    cwd: repoRoot,
    stdio: "inherit",
  })

  if (result.error) {
    process.stderr.write(`${result.error.message}\n`)
    process.exit(1)
  }

  process.exit(result.status ?? 0)
}

function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      "  opencode-router check",
      "  opencode-router bootstrap [--check|--write] [--overwrite]",
      "  opencode-router optimize-models [--check|--write] [--clean-opencode-agent-models|--keep-opencode-agent-models]",
      "  opencode-router rematch-models [--check|--write]",
      "",
      "Install:",
      '  Add to opencode.json: "plugin": ["opencode-router"]  (npm)',
      '  Or for local dev:     "plugin": ["/path/to/opencode-router/plugins/opencode-router.js"]',
      "",
      "Default behavior:",
      "  opencode-router check",
    ].join("\n") + "\n",
  )
}

const args = process.argv.slice(2)
const command = args[0] || "check"

if (command === "--help" || command === "-h" || command === "help") {
  printUsage()
  process.exit(0)
}

if (command === "check") {
  runNodeScript("check.js", args.slice(1))
}

if (command === "bootstrap") {
  runNodeScript("bootstrap.js", args.slice(1))
}

if (command === "optimize-models") {
  runNodeScript("optimize-model-match.js", args.slice(1))
}

if (command === "rematch-models") {
  runNodeScript("rematch-model-match.js", args.slice(1))
}

printUsage()
process.exit(2)
