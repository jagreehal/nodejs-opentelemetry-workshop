# anti-slop provenance

- **Source:** https://github.com/dmmulroy/anti-slop
- **Commit:** `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (merge of PR #36,
  2026-09-10). Copied through the `install-anti-slop` skill, whose bundled
  assets were checked byte for byte against `src/` at that commit, test files
  excluded.
- **Installed:** 2026-09-24, fresh install, to `tools/oxlint/anti-slop/`.
- **Registered plugins:** `anti-slop` (`./tools/oxlint/anti-slop/index.ts`).
  The opt-in `anti-slop-effect` plugin is copied but not registered, because
  this repository does not depend on `effect`.
- **Dependencies:** `oxlint` and `@oxlint/plugins`, both pinned at `1.85.0`.
- **Configuration:** `.oxlintrc.json` at the repository root enables every
  generic rule at `error`, plus `oxc/no-accumulating-spread`.
- **Intentional deviations:** none. The copied files are unmodified.
