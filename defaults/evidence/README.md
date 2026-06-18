# `defaults/evidence/`

Bundled location scanned by `src/model-evidence.js` when no explicit
`evidence_catalog_path` / `evidence_catalog_glob` is configured and neither
`OPENCODE_ROUTER_EVIDENCE_JSON` nor `OPENCODE_ROUTER_EVIDENCE_DIR` is set.

> No `model-evidence.<shortFingerprint>.json` bundles ship in this directory
> by default. Evidence bundles are **pool-bound** (tied to a specific verified
> discovery audit fingerprint), so a shipped default would only be valid for one
> environment. Out of the box, `evidence_rank_strength > 0` therefore resolves
> to neutral evidence for every model until an operator builds and commits a
> bundle here (see below). This is intentional, not a packaging gap.

Operators should commit `model-evidence.<shortFingerprint>.json` files here
that are bound to a specific verified discovery audit. The fingerprint must
match the verified pool at runtime; mismatched bundles surface as a warning
and are reduced to neutral evidence so naming-token scoring **cannot** sneak
back in as a rank input.

## Building a bundle

```bash
node scripts/build-model-evidence.mjs \
  --source-spec scripts/evidence-sources.example.yaml \
  --audit-path "$HOME/.local/share/opencode/plugins/opencode-router/global/model-discovery-audit.json" \
  --out defaults/evidence
```

Each entry of `evidence-sources.yaml` declares an external table, a way to
load it (`local-json`, `local-yaml`, `inline`, `url`), an optional
`score_scale: percent` to map 0..100 columns to the router's 1..5 ratings,
and an optional `id_mapping` to translate vendor model names to OpenCode ids.
