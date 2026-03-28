const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const repoRoot = path.resolve(__dirname, "..")
const packageJSON = JSON.parse(fs.readFileSync(path.resolve(repoRoot, "package.json"), "utf8"))
const packageVersion = packageJSON.version
const tempDataDir = path.resolve(repoRoot, ".tmp", "opencode-router-beta-gate")
const tempNpmCacheDir = path.resolve(repoRoot, ".tmp", "npm-cache-beta-gate")

let failed = false

function pass(message) {
  process.stdout.write(`PASS: ${message}\n`)
}

function fail(message) {
  process.stdout.write(`FAIL: ${message}\n`)
  failed = true
}

function checkFileExists(relativePath) {
  const fullPath = path.resolve(repoRoot, relativePath)
  if (fs.existsSync(fullPath)) {
    pass(`${relativePath} exists`)
  } else {
    fail(`${relativePath} exists`)
  }
}

function checkIncludes(relativePath, needle, label) {
  const content = fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8")
  if (content.includes(needle)) {
    pass(label)
  } else {
    fail(label)
  }
}

function runNodeScript(scriptName) {
  const result = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", scriptName)], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENCODE_ROUTER_DATA_DIR: tempDataDir,
    },
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if ((result.status ?? 1) !== 0) failed = true
}

function runPackDryRun() {
  const result = spawnSync("npm", ["pack", "--dry-run"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: tempNpmCacheDir,
    },
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if ((result.status ?? 1) !== 0) {
    failed = true
    return
  }

  pass("npm pack --dry-run")
}

;[
  "README.md",
  "CHANGELOG.md",
  "RELEASE.md",
  "docs/prd_refined.md",
  "docs/beta_qa_matrix.md",
  "docs/beta_pilot_runbook.md",
  "docs/beta_pilot_notes.md",
].forEach(checkFileExists)

checkIncludes("README.md", `Current package version: \`${packageVersion}\``, "README package version matches package.json")
checkIncludes("CHANGELOG.md", `## [${packageVersion}]`, "CHANGELOG has current package version entry")
checkIncludes("RELEASE.md", "docs/beta_qa_matrix.md", "RELEASE references beta QA matrix")
checkIncludes("RELEASE.md", "docs/beta_pilot_runbook.md", "RELEASE references beta pilot runbook")
checkIncludes("docs/prd_refined.md", "beta", "PRD stays on beta-track wording")
checkIncludes("docs/beta_pilot_notes.md", "Mic-frontstage pilot", "pilot notes include Mic-frontstage section")
checkIncludes("docs/beta_pilot_notes.md", "Pi-frontstage pilot", "pilot notes include Pi-frontstage section")

runNodeScript("check.js")
runPackDryRun()

process.exit(failed ? 1 : 0)
