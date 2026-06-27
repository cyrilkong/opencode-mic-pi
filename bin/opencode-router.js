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
      "  opencode-mic-pi check",
      "  opencode-mic-pi bootstrap [--seed|--check|--write] [--overwrite] [--write-model-policy] [--silent] [--postinstall]",
      "  opencode-mic-pi reset-state [--project|--global|--all] [--silent]",
      "  opencode-mic-pi reset-profile [--config|--policy|--all] [--silent]",
      "  opencode-mic-pi optimize-models [--check|--write] [--clean-opencode-agent-models|--keep-opencode-agent-models]",
      "  opencode-mic-pi rematch-models [--check|--write]",
      "  opencode-mic-pi build-model-evidence [--source-spec <yaml>] [--audit-path <json>] [--pool-fingerprint <hash>] [--out <dir>]",
      "",
      "Install:",
      '  Add to opencode.json: "plugin": ["opencode-mic-pi"]',
      '  Or for local dev:     "plugin": ["/path/to/opencode-mic-pi/plugins/opencode-router.js"]',
      "",
      "Default behavior:",
      "  opencode-mic-pi check",
      "",
      "Reset behavior:",
      "  reset-state defaults to --project",
      "  reset-profile defaults to --all",
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

if (command === "reset-state") {
  runNodeScript("reset-state.js", args.slice(1))
}

if (command === "reset-profile") {
  runNodeScript("reset-profile.js", args.slice(1))
}

if (command === "optimize-models") {
  runNodeScript("optimize-model-match.js", args.slice(1))
}

if (command === "rematch-models") {
  runNodeScript("rematch-model-match.js", args.slice(1))
}

if (command === "build-model-evidence") {
  runNodeScript("build-model-evidence.mjs", args.slice(1))
}

printUsage()
process.exit(2)
