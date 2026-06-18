#!/usr/bin/env node
/**
 * External research runner contract (stdin JSON -> stdout JSON).
 * Production: wire to OpenCode agent + web tools; until then fail closed unless MOCK.
 */
async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString("utf8").trim()
  if (!text) return null
  return JSON.parse(text)
}

function mockResearch(payload) {
  const pool = Array.isArray(payload?.pool) ? payload.pool.map(String) : []
  const roles = Array.isArray(payload?.roles) ? payload.roles.map(String) : []
  const fingerprint = String(payload?.pool_fingerprint || "")
  const ordered = [...pool].sort((a, b) => a.localeCompare(b))
  const rolesOut = {}
  for (const role of roles) {
    const models = {}
    for (const id of ordered) {
      const h = simpleHash(id + role) % 1000 / 1000
      models[id] = {
        coding: 3 + (h % 20) / 10,
        agentic: 3 + ((h * 7) % 20) / 10,
        reasoning: 3 + ((h * 13) % 20) / 10,
      }
    }
    rolesOut[role] = {
      ordered_ids: [...ordered],
      models,
      citations: [
        {
          url: "https://arxiv.org/abs/1706.03762",
          note: "MOCK: attention mechanism reference (CI only)",
        },
        {
          url: "https://models.dev/",
          note: "MOCK: structured model registry (CI only)",
        },
      ],
    }
  }
  return {
    schema_version: 1,
    pool_fingerprint: fingerprint,
    researched_at: new Date().toISOString(),
    web_tools_ok: true,
    web_tools_mode: "mock",
    roles: rolesOut,
  }
}

function simpleHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

async function main() {
  const payload = await readStdinJson()
  if (!payload) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: "empty_stdin", web_tools_ok: false }),
    )
    process.stdout.write("\n")
    process.exit(1)
  }

  if (process.env.OPENCODE_ROUTER_RESEARCH_MOCK === "1") {
    process.stdout.write(JSON.stringify(mockResearch(payload)))
    process.stdout.write("\n")
    process.exit(0)
  }

  if (process.env.OPENCODE_ROUTER_ALLOW_STUB_WEB_TOOLS === "1") {
    process.stdout.write(JSON.stringify(mockResearch(payload)))
    process.stdout.write("\n")
    process.exit(0)
  }

  process.stdout.write(
    JSON.stringify({
      ok: false,
      web_tools_ok: false,
      error:
        "Live web research runner not configured. Set OPENCODE_ROUTER_RESEARCH_MOCK=1 for tests, OPENCODE_ROUTER_ALLOW_STUB_WEB_TOOLS=1 for local stub, or replace this script with an OpenCode-backed runner.",
    }),
  )
  process.stdout.write("\n")
  process.exit(2)
}

main().catch((err) => {
  process.stderr.write(`${err?.message || err}\n`)
  process.exit(1)
})
