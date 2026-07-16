# Co-Dex Developer Guidelines

## Core Principles

1. Local-First Architecture: no backend APIs, database routes, or server engines.
   Every data write goes to Dexie.js (IndexedDB) on the client.
2. $0 Infrastructure Target: every dependency and service used must run on free,
   static, client-side infrastructure. No paid APIs, no metered backends.
3. Zero-Asset Repository: never commit copyrighted Pokémon sprites, music, or
   game art. Fetch at runtime from PokéAPI or vetted public CDNs, cache locally.
4. Mobile Handheld UI: every view fits a nostalgic 4:3 console frame, optimized
   for one-handed thumb navigation (bottom 60% of viewport = interactive zone).
5. No PIN locks, no lockout modes: destructive actions are protected by Version
   History/Undo (Section 14.3 of PRD.md), never by a secondary permission gate.
6. Strict Mode is the default for cross-game transfers; Sandbox Mode is an
   explicit, warned opt-in per transfer, never a global setting.
7. Non-commercial, always: no paywalls, ads, or premium tiers, ever.

## Common CLI Commands

* Dev server: `npm run dev`
* Type check: `npx tsc --noEmit`
* Production build: `npm run build`

## Reference

Full product spec lives in [PRD.md](PRD.md) in this directory. Consult it before
making any architecture or scope decision — this file is guardrails only, not
the spec itself.
