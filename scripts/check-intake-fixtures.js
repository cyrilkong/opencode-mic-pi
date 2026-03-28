const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

async function main() {
  const repoRoot = path.resolve(__dirname, "..")
  const moduleUrl = pathToFileURL(path.resolve(repoRoot, "src", "intake.js")).href
  const specUrl = pathToFileURL(path.resolve(repoRoot, "src", "presentation", "mic-intake", "index.js")).href
  const { buildIntakeCard, buildDispatchPacket, validateDispatchPacket } = await import(moduleUrl)
  const { MIC_INTAKE_CANONICAL_FIXTURES, renderCanonicalMicIntakeCard } = await import(specUrl)

  const cases = [
    {
      name: "valid-ready",
      file: "fixtures/intake/valid-ready-mic-output.md",
      assert(card) {
        if (!card) throw new Error("expected intake card")
        if (card.ready !== true) throw new Error("expected ready intake card")
        if (!Array.isArray(card.task_list) || card.task_list.length !== 2) {
          throw new Error("expected 2 tasks")
        }
        const packet = buildDispatchPacket(card)
        const errors = validateDispatchPacket(packet)
        if (errors.length > 0) throw new Error(`expected valid dispatch packet, got: ${errors.join("; ")}`)

        const invalidPacket = {
          ...packet,
          created_at: "not-a-time",
          task_list: [
            { id: "dup", task: "one" },
            { id: "dup", task: "" },
          ],
          questions: { status: "unknown", items: ["ok", ""] },
        }
        const invalidErrors = validateDispatchPacket(invalidPacket)
        if (invalidErrors.length === 0) throw new Error("expected invalid packet validation errors")
      },
    },
    {
      name: "non-ready",
      file: "fixtures/intake/non-ready-mic-output.md",
      assert(card) {
        if (!card) throw new Error("expected intake card")
        if (card.ready !== false) throw new Error("expected non-ready intake card")
        if (card.ready_state?.status !== "pending") throw new Error("expected pending ready_state status")
        if (!String(card.ready_state?.reason || "").includes("waiting")) throw new Error("expected ready_state reason")
        if (card.questions?.status !== "pending") throw new Error("expected pending question status")
        if (!Array.isArray(card.questions?.items) || card.questions.items.length !== 2) throw new Error("expected 2 open questions")
        if (buildDispatchPacket(card) !== null) throw new Error("expected no dispatch packet")
      },
    },
    {
      name: "rich-pending",
      file: "fixtures/intake/rich-pending-mic-output.md",
      assert(card) {
        if (!card) throw new Error("expected intake card")
        if (card.ready !== false) throw new Error("expected pending intake card")
        if (card.questions?.status !== "pending") throw new Error("expected pending question status")
        if (!String(card.questions?.status_detail || "").includes("awaiting_user")) throw new Error("expected question status detail")
        if (!Array.isArray(card.questions?.items) || card.questions.items.length !== 2) throw new Error("expected only open questions to remain")
        if (card.questions.items.some((item) => /beta productization/i.test(item))) throw new Error("expected resolved question text to be excluded from open items")
      },
    },
    {
      name: "invalid-shape",
      file: "fixtures/intake/invalid-mic-output.md",
      assert(card) {
        if (card !== null) throw new Error("expected null intake card")
      },
    },
  ]

  let failed = false

  const generatedFixtureMap = new Map(
    MIC_INTAKE_CANONICAL_FIXTURES.map((testCase) => [testCase.file, renderCanonicalMicIntakeCard(testCase.render)]),
  )

  for (const testCase of cases) {
    const fullPath = path.resolve(repoRoot, testCase.file)
    const input = fs.readFileSync(fullPath, "utf8")
    try {
      const generated = generatedFixtureMap.get(path.basename(testCase.file))
      if (generated != null && input !== generated) {
        throw new Error("generated intake fixture is out of sync with Mic presentation sources under src/presentation/mic-intake/")
      }
      testCase.assert(buildIntakeCard(input))
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
