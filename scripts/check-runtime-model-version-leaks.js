const fs = require("node:fs")
const path = require("node:path")

function shouldSkipLine(filePath, line) {
  if (!filePath.endsWith(path.join("src", "model-benchmarks.js"))) return false
  return /evidence_model_id|source_url|source_label|verified_at|verified_by|evidence_type|derivation|note/.test(line)
}

function scanFile(filePath, patterns) {
  const source = fs.readFileSync(filePath, "utf8")
  const lines = source.split(/\r?\n/)
  const findings = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (shouldSkipLine(filePath, line)) continue

    for (const pattern of patterns) {
      if (!pattern.regex.test(line)) continue
      findings.push({
        file: filePath,
        line: index + 1,
        rule: pattern.label,
        text: line.trim(),
      })
    }
  }

  return findings
}

function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const runtimeFiles = [
    path.resolve(repoRoot, "plugins", "opencode-router.js"),
    path.resolve(repoRoot, "bin", "opencode-router.js"),
    ...fs.readdirSync(path.resolve(repoRoot, "src"))
      .filter((fileName) => fileName.endsWith(".js"))
      .map((fileName) => path.resolve(repoRoot, "src", fileName)),
    ...fs.readdirSync(path.resolve(repoRoot, "scripts"))
      .filter((fileName) => fileName.endsWith(".js"))
      .filter((fileName) => !fileName.startsWith("check-"))
      .map((fileName) => path.resolve(repoRoot, "scripts", fileName)),
  ]

  const patterns = [
    {
      label: "provider-scoped concrete model id",
      regex: /\b(?:openai|anthropic|google|meta|mistral|cohere|deepseek|azure-openai|azure)\/[A-Za-z0-9._-]*?(?:gpt-\d|claude-\d|gemini-\d|o\d)[A-Za-z0-9._-]*/i,
    },
    {
      label: "versioned GPT family constant",
      regex: /\bgpt-\d+(?:\.\d+)*(?:[-_][a-z0-9]+)+\b/i,
    },
    {
      label: "versioned Claude family constant",
      regex: /\bclaude-\d+(?:\.\d+)*(?:[-_][a-z0-9]+)+\b/i,
    },
    {
      label: "versioned Gemini family constant",
      regex: /\bgemini-\d+(?:\.\d+)*(?:[-_][a-z0-9]+)+\b/i,
    },
    {
      label: "versioned OpenAI o-series constant",
      regex: /\bo(?:1|3[-_]?pro)\b/i,
    },
  ]

  const findings = runtimeFiles.flatMap((filePath) => scanFile(filePath, patterns))
  if (findings.length > 0) {
    for (const finding of findings) {
      const relativePath = path.relative(repoRoot, finding.file)
      process.stderr.write(`forbidden runtime model constant [${finding.rule}] at ${relativePath}:${finding.line} :: ${finding.text}\n`)
    }
    process.exit(1)
  }

  process.stdout.write("PASS: runtime/plugin code stays free of concrete discovered-model constants outside evidence/sample paths\n")
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}
