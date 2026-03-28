const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const pathsUrl = pathToFileURL(path.resolve(repoRoot, "src", "paths.js")).href
  const { STATE_PATHS, getStateScope } = await import(pathsUrl)

  const scope = getStateScope()
  const canonicalRoots = new Set([
    path.resolve(scope.globalDir),
    path.resolve(scope.projectDir),
  ])

  for (const [key, filePath] of Object.entries(STATE_PATHS)) {
    const parent = path.resolve(path.dirname(filePath))
    assert(
      canonicalRoots.has(parent),
      `expected ${key} to live under canonical app-data roots, got ${filePath}`,
    )
    assert(
      !filePath.includes(`${path.sep}.opencode${path.sep}`),
      `expected ${key} to avoid project-surface .opencode paths, got ${filePath}`,
    )
  }

  const projectSurfaceWorkspace = path.resolve(scope.projectRoot, ".opencode", ".workspace")
  const projectSurfaceState = path.resolve(scope.projectRoot, ".opencode", "state")

  assert(!fs.existsSync(projectSurfaceWorkspace), "project-surface .opencode/.workspace should not exist in repo runtime flow")
  assert(!fs.existsSync(projectSurfaceState), "project-surface .opencode/state should not exist in repo runtime flow")

  process.stdout.write("PASS: canonical state paths are app-data only and no project-surface legacy state is expected\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
