const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

function readPacket(repoRoot, relativePath) {
  const fullPath = path.resolve(repoRoot, relativePath)
  return JSON.parse(fs.readFileSync(fullPath, "utf8"))
}

function ensureIncludes(values, expected, label) {
  for (const item of expected) {
    if (!values.includes(item)) {
      throw new Error(`${label} must include "${item}"`)
    }
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const moduleUrl = pathToFileURL(path.resolve(repoRoot, "src", "routing.js")).href
  const { buildRoutePlan } = await import(moduleUrl)

  const cases = [
    {
      file: "fixtures/routing/fast.packet.json",
      assert(routePlan) {
        if (routePlan.lane !== "fast") throw new Error(`expected lane=fast, got ${routePlan.lane}`)
        if (routePlan.risk !== "L1") throw new Error(`expected risk=L1, got ${routePlan.risk}`)
        if (routePlan.debate_gate?.enabled) throw new Error("expected debate gate disabled")
      },
    },
    {
      file: "fixtures/routing/standard.packet.json",
      assert(routePlan) {
        if (routePlan.lane !== "standard") throw new Error(`expected lane=standard, got ${routePlan.lane}`)
        if (routePlan.risk !== "L2") throw new Error(`expected risk=L2, got ${routePlan.risk}`)
        ensureIncludes(routePlan.advisory_workers, ["co-pi"], "advisory_workers")
        ensureIncludes(routePlan.support_workers, ["check"], "support_workers")
        if (routePlan.disagreement_map?.enabled) throw new Error("expected disagreement map disabled for standard case")
      },
    },
    {
      file: "fixtures/routing/deep.packet.json",
      assert(routePlan) {
        if (routePlan.lane !== "deep") throw new Error(`expected lane=deep, got ${routePlan.lane}`)
        if (routePlan.risk !== "L3") throw new Error(`expected risk=L3, got ${routePlan.risk}`)
        ensureIncludes(routePlan.advisory_workers, ["wise", "co-pi"], "advisory_workers")
        if (routePlan.debate_gate?.enabled) throw new Error("expected debate gate disabled for non-conflict deep case")
        if (routePlan.disagreement_map?.enabled) throw new Error("expected disagreement map disabled for non-conflict deep case")
      },
    },
    {
      file: "fixtures/routing/deep-debate.packet.json",
      assert(routePlan) {
        if (routePlan.lane !== "deep") throw new Error(`expected lane=deep, got ${routePlan.lane}`)
        if (routePlan.risk !== "L3") throw new Error(`expected risk=L3, got ${routePlan.risk}`)
        if (!routePlan.debate_gate?.enabled) throw new Error("expected debate gate enabled")
        if (!routePlan.debate_gate?.topics?.length) throw new Error("expected disagreement topics")
        ensureIncludes(routePlan.advisory_workers, ["co-pi"], "advisory_workers")
        if (!routePlan.disagreement_map?.enabled) throw new Error("expected disagreement map enabled")
        if (!Array.isArray(routePlan.disagreement_map?.unresolved_points) || routePlan.disagreement_map.unresolved_points.length === 0) {
          throw new Error("expected unresolved disagreement points")
        }
        if (!Array.isArray(routePlan.disagreement_map?.alternatives) || routePlan.disagreement_map.alternatives.length === 0) {
          throw new Error("expected disagreement alternatives")
        }
      },
    },
  ]

  let failed = false
  for (const testCase of cases) {
    try {
      const packet = readPacket(repoRoot, testCase.file)
      const routePlan = buildRoutePlan(packet)
      testCase.assert(routePlan)
      process.stdout.write(`PASS: ${testCase.file}\n`)
    } catch (error) {
      failed = true
      process.stdout.write(`FAIL: ${testCase.file} :: ${error.message}\n`)
    }
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
