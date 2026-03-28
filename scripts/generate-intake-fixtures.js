const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const fixturesDir = path.resolve(repoRoot, "fixtures", "intake")
  const moduleUrl = pathToFileURL(path.resolve(repoRoot, "src", "presentation", "mic-intake", "index.js")).href
  const { MIC_INTAKE_CANONICAL_FIXTURES, renderCanonicalMicIntakeCard } = await import(moduleUrl)

  fs.mkdirSync(fixturesDir, { recursive: true })
  for (const testCase of MIC_INTAKE_CANONICAL_FIXTURES) {
    fs.writeFileSync(path.resolve(fixturesDir, testCase.file), renderCanonicalMicIntakeCard(testCase.render), "utf8")
    process.stdout.write(`SYNC: intake fixture -> ${testCase.file}\n`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
