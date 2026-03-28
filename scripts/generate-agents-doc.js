const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const targetPath = path.resolve(repoRoot, "AGENTS.md")
  const moduleUrl = pathToFileURL(path.resolve(repoRoot, "src", "agents-doc.js")).href
  const { buildAgentsDocument } = await import(moduleUrl)

  fs.writeFileSync(targetPath, buildAgentsDocument(), "utf8")
  process.stdout.write(`SYNC: agents doc -> ${targetPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
