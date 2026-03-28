const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const benchmarksUrl = pathToFileURL(path.resolve(repoRoot, "src", "model-benchmarks.js")).href
  const { priceHintOf } = await import(benchmarksUrl)

  const samples = [
    { model: "openai/gpt-5.1-codex-max", key: "gpt-codex-max", family: "gpt" },
    { model: "anthropic/claude-3.7-sonnet", key: "claude-sonnet", family: "claude" },
    { model: "google/gemini-2.5-pro", key: "gemini-pro", family: "gemini" },
  ]

  for (const sample of samples) {
    const hint = priceHintOf(sample.model)
    assert(hint, `expected price hint for ${sample.model}`)
    assert(hint.key === sample.key, `expected ${sample.model} to map to ${sample.key}`)
    assert(hint.runtime && typeof hint.runtime === "object", `expected runtime pricing metadata for ${sample.model}`)
    assert(hint.evidence && typeof hint.evidence === "object", `expected evidence metadata for ${sample.model}`)
    assert(hint.runtime.match_key === sample.key, `expected runtime match_key for ${sample.model}`)
    assert(hint.runtime.family === sample.family, `expected runtime family for ${sample.model}`)
    assert(hint.runtime.source === "models_dev_family_snapshot", `expected runtime source tag for ${sample.model}`)
    assert(typeof hint.evidence.evidence_model_id === "string" && hint.evidence.evidence_model_id.length > 0, `expected evidence model id for ${sample.model}`)
    assert(hint.evidence.source_url === "https://models.dev/api.json", `expected models.dev evidence source for ${sample.model}`)
    assert(!Object.prototype.hasOwnProperty.call(hint.runtime, "evidence_model_id"), `runtime metadata must stay versionless for ${sample.model}`)
  }

  const source = fs.readFileSync(path.resolve(repoRoot, "src", "model-benchmarks.js"), "utf8")
  const runtimeOnlySource = source
    .split(/\r?\n/)
    .filter((line) => !/evidence_model_id|source_url|source_label|verified_at|verified_by|evidence_type|derivation|note/.test(line))
    .join("\n")

  assert(!/gemini[-_/]?1\.5/i.test(runtimeOnlySource), "expected runtime long-context heuristics to avoid gemini 1.5 version constants")
  assert(!/gemini[-_/]?2(\.5)?[-_/]?pro/i.test(runtimeOnlySource), "expected runtime gemini pricing match to avoid concrete 2.5 version constants")
  assert(!/gpt[-_]?5($|[-_/])/i.test(runtimeOnlySource), "expected runtime GPT premium pricing match to avoid concrete gpt-5 version constants")
  assert(!/\bo1\b/i.test(runtimeOnlySource), "expected runtime GPT family matching to avoid concrete o1 constants")
  assert(!/\bo3[-_/]?pro\b/i.test(runtimeOnlySource), "expected runtime GPT premium pricing to avoid concrete o3-pro constants")

  process.stdout.write("PASS: price hint provenance is split into runtime/evidence layers and runtime patterns stay version-agnostic\n")
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
