const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const repoRoot = path.resolve(__dirname, "..")
const isolatedDataDir = path.resolve(repoRoot, ".tmp", "opencode-router-check")

function createSpawnOptions() {
  return {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      OPENCODE_ROUTER_DATA_DIR: isolatedDataDir,
    },
  }
}

const requiredPaths = [
  "AGENTS.md",
  "plugins/opencode-router.js",
  "prompts/mic.md",
  "prompts/pi.md",
  "prompts/co-pi.md",
  "prompts/wise.md",
  "src/intake.js",
  "src/agent-catalog.js",
  "src/agents-doc.js",
  "src/intake-parser-contract.js",
  "src/prompt-template-tokens.js",
  "src/prompt-source.js",
  "src/presentation/mic-intake-spec.js",
  "src/presentation/mic-intake/shape.js",
  "src/presentation/mic-intake/render.js",
  "src/presentation/mic-intake/samples.js",
  "src/presentation/mic-intake/prompt-blocks.js",
  "src/presentation/mic-intake/index.js",
  "src/presentation/command-views.js",
  "src/presentation/commands/shape.js",
  "src/presentation/commands/shared.js",
  "src/presentation/commands/dispatch.js",
  "src/presentation/commands/rematch.js",
  "src/presentation/commands/up.js",
  "src/presentation/commands/book.js",
  "src/presentation/commands/index.js",
  "src/routing.js",
  "src/memory-palace.js",
  "src/agent-policy.js",
  "src/model-match.js",
  "src/model-match-policy.js",
  "src/memory-palace-index.js",
   "src/runtime-fallback.js",
   "src/opencode-config.js",
   "src/prompt-registry.js",
   "src/router-config.js",
  "src/session-language.js",
  "scripts/check-intake-fixtures.js",
  "scripts/check-generated-assets.js",
  "scripts/generate-intake-fixtures.js",
  "scripts/generate-agents-doc.js",
  "scripts/check-session-language.js",
  "scripts/check-memory-palace.js",
  "scripts/check-memory-palace-continuity.js",
  "scripts/check-relay-bridge.js",
  "scripts/check-routing-fixtures.js",
  "scripts/check-plugin-event-flow.js",
  "scripts/check-bootstrap-prompt-hydration.js",
  "scripts/check-runtime-fallback.js",
  "scripts/check-optimize-cleanup.js",
  "scripts/check-router-config.js",
  "scripts/check-model-rematch-flow.js",
  "scripts/check-model-match-policy-markdown.js",
  "scripts/check-token-billing-price-awareness.js",
  "scripts/check-mic-cost-sensitivity.js",
  "scripts/check-role-specialization.js",
  "scripts/check-vis-multimodal-preference.js",
  "scripts/check-price-hint-provenance.js",
  "scripts/check-runtime-model-version-leaks.js",
  "scripts/check-workspace-scope.js",
  "scripts/check-state-workspace-migration.js",
  "fixtures/intake/valid-ready-mic-output.md",
  "fixtures/intake/non-ready-mic-output.md",
  "fixtures/intake/rich-pending-mic-output.md",
  "fixtures/intake/invalid-mic-output.md",
  "fixtures/routing/fast.packet.json",
  "fixtures/routing/standard.packet.json",
  "fixtures/routing/deep.packet.json",
  "fixtures/routing/deep-debate.packet.json",
  "opencode-router.schema.json",
  "backlog/v1-one-week.json",
]

let failed = false

for (const relativePath of requiredPaths) {
  const fullPath = path.resolve(repoRoot, relativePath)
  const ok = fs.existsSync(fullPath)
  process.stdout.write(`${ok ? "PASS" : "FAIL"}: ${relativePath}\n`)
  if (!ok) failed = true
}

const fixtureCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-intake-fixtures.js")], createSpawnOptions())

if (fixtureCheck.stdout) process.stdout.write(fixtureCheck.stdout)
if (fixtureCheck.stderr) process.stderr.write(fixtureCheck.stderr)
if ((fixtureCheck.status ?? 1) !== 0) failed = true

const generatedAssetsCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-generated-assets.js")], createSpawnOptions())

if (generatedAssetsCheck.stdout) process.stdout.write(generatedAssetsCheck.stdout)
if (generatedAssetsCheck.stderr) process.stderr.write(generatedAssetsCheck.stderr)
if ((generatedAssetsCheck.status ?? 1) !== 0) failed = true

const sessionLanguageCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-session-language.js")], createSpawnOptions())

if (sessionLanguageCheck.stdout) process.stdout.write(sessionLanguageCheck.stdout)
if (sessionLanguageCheck.stderr) process.stderr.write(sessionLanguageCheck.stderr)
if ((sessionLanguageCheck.status ?? 1) !== 0) failed = true

const memoryPalaceCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-memory-palace.js")], createSpawnOptions())

if (memoryPalaceCheck.stdout) process.stdout.write(memoryPalaceCheck.stdout)
if (memoryPalaceCheck.stderr) process.stderr.write(memoryPalaceCheck.stderr)
if ((memoryPalaceCheck.status ?? 1) !== 0) failed = true

const memoryPalaceContinuityCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-memory-palace-continuity.js")], createSpawnOptions())

if (memoryPalaceContinuityCheck.stdout) process.stdout.write(memoryPalaceContinuityCheck.stdout)
if (memoryPalaceContinuityCheck.stderr) process.stderr.write(memoryPalaceContinuityCheck.stderr)
if ((memoryPalaceContinuityCheck.status ?? 1) !== 0) failed = true

const relayBridgeCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-relay-bridge.js")], createSpawnOptions())

if (relayBridgeCheck.stdout) process.stdout.write(relayBridgeCheck.stdout)
if (relayBridgeCheck.stderr) process.stderr.write(relayBridgeCheck.stderr)
if ((relayBridgeCheck.status ?? 1) !== 0) failed = true

const routingFixtureCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-routing-fixtures.js")], createSpawnOptions())

if (routingFixtureCheck.stdout) process.stdout.write(routingFixtureCheck.stdout)
if (routingFixtureCheck.stderr) process.stderr.write(routingFixtureCheck.stderr)
if ((routingFixtureCheck.status ?? 1) !== 0) failed = true

const pluginEventFlowCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-plugin-event-flow.js")], createSpawnOptions())

if (pluginEventFlowCheck.stdout) process.stdout.write(pluginEventFlowCheck.stdout)
if (pluginEventFlowCheck.stderr) process.stderr.write(pluginEventFlowCheck.stderr)
if ((pluginEventFlowCheck.status ?? 1) !== 0) failed = true

const bootstrapConfigCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-bootstrap-prompt-hydration.js")], createSpawnOptions())

if (bootstrapConfigCheck.stdout) process.stdout.write(bootstrapConfigCheck.stdout)
if (bootstrapConfigCheck.stderr) process.stderr.write(bootstrapConfigCheck.stderr)
if ((bootstrapConfigCheck.status ?? 1) !== 0) failed = true

const runtimeFallbackCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-runtime-fallback.js")], createSpawnOptions())

if (runtimeFallbackCheck.stdout) process.stdout.write(runtimeFallbackCheck.stdout)
if (runtimeFallbackCheck.stderr) process.stderr.write(runtimeFallbackCheck.stderr)
if ((runtimeFallbackCheck.status ?? 1) !== 0) failed = true

const routerConfigCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-router-config.js")], createSpawnOptions())

if (routerConfigCheck.stdout) process.stdout.write(routerConfigCheck.stdout)
if (routerConfigCheck.stderr) process.stderr.write(routerConfigCheck.stderr)
if ((routerConfigCheck.status ?? 1) !== 0) failed = true

const rematchFlowCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-model-rematch-flow.js")], createSpawnOptions())

if (rematchFlowCheck.stdout) process.stdout.write(rematchFlowCheck.stdout)
if (rematchFlowCheck.stderr) process.stderr.write(rematchFlowCheck.stderr)
if ((rematchFlowCheck.status ?? 1) !== 0) failed = true

const modelMatchPolicyMarkdownCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-model-match-policy-markdown.js")], createSpawnOptions())

if (modelMatchPolicyMarkdownCheck.stdout) process.stdout.write(modelMatchPolicyMarkdownCheck.stdout)
if (modelMatchPolicyMarkdownCheck.stderr) process.stderr.write(modelMatchPolicyMarkdownCheck.stderr)
if ((modelMatchPolicyMarkdownCheck.status ?? 1) !== 0) failed = true

const tokenBillingPriceAwarenessCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-token-billing-price-awareness.js")], createSpawnOptions())

if (tokenBillingPriceAwarenessCheck.stdout) process.stdout.write(tokenBillingPriceAwarenessCheck.stdout)
if (tokenBillingPriceAwarenessCheck.stderr) process.stderr.write(tokenBillingPriceAwarenessCheck.stderr)
if ((tokenBillingPriceAwarenessCheck.status ?? 1) !== 0) failed = true

const micCostSensitivityCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-mic-cost-sensitivity.js")], createSpawnOptions())

if (micCostSensitivityCheck.stdout) process.stdout.write(micCostSensitivityCheck.stdout)
if (micCostSensitivityCheck.stderr) process.stderr.write(micCostSensitivityCheck.stderr)
if ((micCostSensitivityCheck.status ?? 1) !== 0) failed = true

const roleSpecializationCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-role-specialization.js")], createSpawnOptions())

if (roleSpecializationCheck.stdout) process.stdout.write(roleSpecializationCheck.stdout)
if (roleSpecializationCheck.stderr) process.stderr.write(roleSpecializationCheck.stderr)
if ((roleSpecializationCheck.status ?? 1) !== 0) failed = true

const visMultimodalPreferenceCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-vis-multimodal-preference.js")], createSpawnOptions())

if (visMultimodalPreferenceCheck.stdout) process.stdout.write(visMultimodalPreferenceCheck.stdout)
if (visMultimodalPreferenceCheck.stderr) process.stderr.write(visMultimodalPreferenceCheck.stderr)
if ((visMultimodalPreferenceCheck.status ?? 1) !== 0) failed = true

const priceHintProvenanceCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-price-hint-provenance.js")], createSpawnOptions())

if (priceHintProvenanceCheck.stdout) process.stdout.write(priceHintProvenanceCheck.stdout)
if (priceHintProvenanceCheck.stderr) process.stderr.write(priceHintProvenanceCheck.stderr)
if ((priceHintProvenanceCheck.status ?? 1) !== 0) failed = true

const runtimeModelVersionLeakCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-runtime-model-version-leaks.js")], createSpawnOptions())

if (runtimeModelVersionLeakCheck.stdout) process.stdout.write(runtimeModelVersionLeakCheck.stdout)
if (runtimeModelVersionLeakCheck.stderr) process.stderr.write(runtimeModelVersionLeakCheck.stderr)
if ((runtimeModelVersionLeakCheck.status ?? 1) !== 0) failed = true

const workspaceScopeCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-workspace-scope.js")], createSpawnOptions())

if (workspaceScopeCheck.stdout) process.stdout.write(workspaceScopeCheck.stdout)
if (workspaceScopeCheck.stderr) process.stderr.write(workspaceScopeCheck.stderr)
if ((workspaceScopeCheck.status ?? 1) !== 0) failed = true

const workspaceMigrationCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-state-workspace-migration.js")], createSpawnOptions())

if (workspaceMigrationCheck.stdout) process.stdout.write(workspaceMigrationCheck.stdout)
if (workspaceMigrationCheck.stderr) process.stderr.write(workspaceMigrationCheck.stderr)
if ((workspaceMigrationCheck.status ?? 1) !== 0) failed = true

const optimizeCleanupCheck = spawnSync(process.execPath, [path.resolve(repoRoot, "scripts", "check-optimize-cleanup.js")], createSpawnOptions())

if (optimizeCleanupCheck.stdout) process.stdout.write(optimizeCleanupCheck.stdout)
if (optimizeCleanupCheck.stderr) process.stderr.write(optimizeCleanupCheck.stderr)
if ((optimizeCleanupCheck.status ?? 1) !== 0) failed = true

process.exit(failed ? 1 : 0)
