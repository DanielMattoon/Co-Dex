# Co-Dex — Master Product Requirements Document (PRD)

**Version:** 2.0 (Final, Consolidated)
**Status:** Ready to build — hand this file directly to Claude Code
**Target Architecture:** Serverless, Local-First Progressive Web App (PWA)
**Budget:** $0.00 server / hosting cost, forever

---

## 0. How to Use This Document

This is the single source of truth for Co-Dex. It supersedes every earlier draft, sketch, and partial PRD that led up to it. Where earlier drafts conflicted with each other, this document states the final decision and — where useful — a one-line note on why. Feed this file to Claude Code as `PRD.md` in the project root, alongside the `CLAUDE.md` guardrails in Section 20.

---

## 1. Executive Summary & Core Pillars

Co-Dex is a non-commercial, synchronized, data-driven companion app and knowledge platform for casual collectors and competitive Pokémon players alike. Existing tools (Serebii, Smogon, PokedexTracker, spreadsheets) are siloed — trackers don't talk to teambuilders, guides don't know what you own, and data can't move between games. Co-Dex unifies all of it into one context-aware ecosystem anchored to a per-account Unique ID database and per-game instances.

**Core Pillars:**

- **Connected Inventory** — the teambuilder reads what you physically own, the maps know what you're missing, your trade profile reflects your real deficits, all from one dataset.
- **Layered UX: "Child Simple, Pro Deep"** — a clean, frictionless surface for casual and young users, with an advanced toggleable data layer for competitive analysts.
- **Rigid Fidelity with Sandbox Freedom** — strict game-hardware cartridge rules by default, with an explicit, warned override for players who want to break the rules on purpose.
- **Zero Server Cost** — the entire experience, including P2P trading and matchmaking, runs client-side or peer-to-peer. No database to pay for, no bill that grows with users.

```
       ┌────────────────────────────────────────────────────────┐
       │                  CO-DEX CORE PLATFORM                  │
       └───────────────────────────┬────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   THE VAULT      │      │ INTERACTIVE MAPS │      │ SHOWDOWN CLIENT  │
│  UUID Database   │      │   Leaflet-Style  │      │  Active Battle   │
│ Live PC Tracking │      │ Live Catch/EVs   │      │ Teambuilder Sync │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## 2. Dan's Three Design Commandments (Non-Negotiable UX Law)

These three rules govern every feature decision below. Any feature that violates one of these gets redesigned, not shipped.

**2.1 Ease of Use — The "One-Handed Thumb Zone" Rule**
Players usually have a controller, Switch, or handheld in one hand. Every primary interactive element — marking a catch, filtering, search, navigation — must live within the bottom 60% of the mobile viewport. The top 40% is reserved for passive visual readouts, artwork, and status metrics. Nothing important should require reaching to a top corner.

**2.2 Simplicity — The "Child-Safe Cognitive Anchor" Rule**
This is specifically about a child being able to safely navigate the app without getting lost, confused, or landing on an overwhelming page — not about restricting what a child can *do*.

- No utility task exceeds two taps.
- Nested settings or data panels never exceed two layers of depth.
- Navigation relies on clear, color-coded visual anchors and an always-accessible "Back to Box" button.
- **The safety net is Undo, not a lock.** Every destructive or bulk action (mark all, unmark all, sandbox transfer, box deletion) is protected by the same Session Version History log (Section 14.3) — a friendly, color-coded "Undo/Revert" button restores the exact previous state instantly. **Decision:** an earlier draft proposed a PIN-protected "Junior Guard" read-only lockout mode. That feature is cut. It's redundant with Version History, and it fights the "two taps, no dead ends" rule by adding a lockout state to navigate around. Undo covers the "my kid deleted my shiny" problem completely.

**2.3 Aesthetic — The "Retro-Modern Console" Rule**
No flat, corporate-modern UI. Every surface uses authentic, high-quality pixel sprites, crisp retro-inspired typography, and fluid semi-transparent "dark-glass" panels. No native dropdowns, no boxy admin borders, no plain scrollbars — tactile micro-animations that feel like vintage gaming hardware, but with fast, fluid modern responsiveness underneath.

---

## 3. Legal Safe-Harbor Protocols (The Core Triad)

Non-negotiable. These three rules are what let Co-Dex exist in the same legal space as Smogon, Serebii, and Bulbapedia without Nintendo/TPC ever having reason to act.

1. **Strict Non-Commercial Execution.** No paywalls, premium tiers, ad networks, donation gateways, or any paid feature, ever. This is the single biggest factor in whether a fan project gets left alone.
2. **Zero Host-Side Asset/ROM Footprint.** No copyrighted ROMs, sprite files, music, or proprietary art shipped in the codebase or repo. All sprites, stats, moves, and item data are fetched at runtime from open public APIs (PokéAPI) or public CDNs (e.g. the PokeAPI/sprites GitHub mirror), then cached locally.
3. **Independent Client-Side Presentation.** Co-Dex is a third-party visualization and utility client only — no server-to-server links to Nintendo/Game Freak/TPC systems, no emulation, no ROM parsing. Trademarked names appear only as data values pulled live from PokéAPI, never as branding. The product name and all messaging use "Co-Dex" / "Retro Gaming Companion," never anything implying official affiliation.

---

## 4. System Architecture & the $0 Serverless Stack

Co-Dex is a static frontend application. No dedicated backend, no hosted database, no per-user server cost.

```
+-----------------------------------------------------------------+
|                         CLIENT BROWSER                          |
|                                                                 |
|   +------------------+  +------------------+  +--------------+  |
|   |    React UI      |  |   Dexie.js DB    |  | Leaflet Map  |  |
|   | (Tailwind Retro) |  | (Local SaveState)|  |  (Offline)   |  |
|   +--------+---------+  +--------+---------+  +------+-------+  |
|            |                     |                   |          |
+------------|---------------------|-------------------|----------+
             | (API Fetches)       | (Direct P2P Sync)  | (Load Tiles)
             ▼                     ▼                    ▼
+----------------------+  +------------------+  +--------------+
|      Public CDNs      |  |   Peer Device    |  | GitHub Pages |
|  - PokéAPI Data        |  | - P2P Link Cable |  |- Static Tiles|
|  - Smogon/@pkmn/stats  |  | - P2P Battles    |  |- Gym Guides  |
|  - @smogon/calc Engine |  | - Nostr Lobby    |  |              |
+----------------------+  +------------------+  +--------------+
```

**The $0 Developer Stack:**

| Layer | Choice |
|---|---|
| Framework & Build | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 — pixel-scaling config, 4:3 handheld screen bounds, custom monospace/retro fonts |
| Local Database | `Dexie.js` + `dexie-react-hooks` (IndexedDB wrapper) |
| Interactive Maps | `Leaflet.js` using `L.CRS.Simple` (flat pixel grid, no GPS math) |
| P2P Communication | `PeerJS` (WebRTC) for device-to-device sync, trading, and battling |
| Decentralized Matchmaking | Public, free Nostr relay used as a disposable lobby bulletin board |
| Damage / Battle Calc | `@smogon/calc` (or `@pkmn/dmg`), runs entirely client-side |
| Meta Analytics | `@pkmn/stats` — public JSON CDN of Smogon usage stats, fetched client-side |
| Cloud Backup (optional) | Google Drive client-side OAuth2 (BYOC — Bring Your Own Cloud) |
| Collectibles Reference Data | TheGamesDB (box art + metadata) as primary — simple API-key auth, safe to call client-side. `pokemontcg.io` for the future card category. IGDB deliberately not used (see 4.1). |
| Hosting | GitHub Pages or Vercel Static Free Tier |

---

### 4.1 Reference Data Sourcing (Beyond PokéAPI)

PokéAPI is the right source for species/move/item/type reference data, but it does **not** cover three things this app needs: exact per-game box/slot counts and dex ordering, cross-generation legality tables, and overworld map coordinates (grass patches, item balls, trainer positions). Guidance for each:

- **Box counts, dex order, generation-legality rules:** source these as *facts*, not code or assets, from the open Pokémon decompilation projects (pret's `pokered`, `pokeemerald`, `pokecrystal`, and siblings on GitHub) — community-verified, reverse-engineered reference projects that have operated openly for over a decade under a similar non-commercial posture to Co-Dex. Facts like "Gen 3 has 14 boxes" or "Dragon Claw is Special in Gen 3" aren't copyrightable; only their code and any extracted game assets are. Build a one-time (or per-release) ETL script that reads these projects' data tables and emits Co-Dex's own static JSON — never redistribute their source files or any ROM-derived binaries directly.
- **Map coordinates:** the same decompilation projects contain exact object/warp/item/encounter-zone coordinate data per map, which is the actual ground truth the games run on. Run it through the same build-time ETL approach into Co-Dex's own map-data JSON.
- **Map tile *art* (the visual backdrop) is a separate problem from map *data*.** The coordinate data above is just numbers; the pretty tile graphics are not. Extracted ROM tilesets/screenshots are exactly the kind of copyrighted asset Section 3 rule 2 prohibits hosting. This needs original or properly licensed retro-style pixel art (e.g. a CC0 tileset redrawn to match each region's layout) — real, ongoing art work, not a data-sourcing task, and not solvable by an API of any kind.
- **PokéAPI itself:** its own docs recommend bundling their downloadable static data dump at build time rather than hitting the live endpoint per user at runtime — do that; fall back to live fetches only for anything not in the bundled snapshot.
- **IGDB vs. TheGamesDB for box art (Section 22):** IGDB requires a Twitch OAuth2 client-secret exchange, which has no safe place to live in a pure static client-side app (anyone can extract it from the bundle). TheGamesDB's simpler API-key model is the right fit here, the same way PokéAPI's keyless model is.
- **Decision on scope:** given how much of the above is one-time content-pipeline work rather than app code, v1 targets **one game fully working end-to-end** (per the kickoff prompt in Section 19) rather than "all games at once." Once the ETL pipeline above exists, adding each additional game is a data task, not a re-architecture.

---

## 5. Data Model: The Vault & the UUID Protocol

Static reference data (PokéAPI mirror: species, moves, types, items, evolution chains) is immutable and cached locally. Dynamic player data lives in **The Vault** — every specimen a player owns is a unique object, not a checkbox.

A **Game Title** (`game_title_id`, e.g. `"firered"`) is static reference data — one row per released game. A **Game Instance** (`game_instance_id`) is a specific save file/playthrough of that title. This split matters because a player can run more than one save of the same title at once (a normal playthrough and a separate Nuzlocke run of Emerald, for instance) — every reference to "current game" elsewhere in this document (PC Box filtering, Nuzlocke mode, Map Guide state, Link Cable transfers) resolves against `game_instance_id`, not the title.

```json
{
  "uuid": "usr_948a71b2_pkmn_0006_charizard",
  "pokemon_id": 6,
  "name": "Charizard",
  "gender": "male",
  "shiny": true,
  "form": "base",
  "origin_game_instance_id": "firered_save_1",
  "current_game_instance_id": "emerald_save_1",
  "current_game_title_id": "emerald",
  "box_index": 14,
  "captured_date": "2026-07-14T00:00:00Z",
  "ivs": { "hp": 31, "atk": 31, "def": 31, "spa": 31, "spd": 31, "spe": 31 },
  "evs": { "hp": 4, "atk": 0, "def": 0, "spa": 252, "spd": 0, "spe": 252 },
  "moves": ["fire-blast", "dragon-claw", "sunny-day", "solarbeam"],
  "held_item": "charcoal",
  "tags": ["VGC-Emerald", "OT: Ash"],
  "reservation_status": { "is_reserved": false, "target_evolution_id": null },
  "history_log": [
    { "timestamp": "2026-07-14T00:01:00Z", "action": "captured", "details": "Caught on Route 3 in FireRed." },
    { "timestamp": "2026-07-14T01:30:00Z", "action": "transferred", "details": "Simulated transfer FireRed → Emerald via Sandbox Mode." }
  ],
  "is_sandbox_anomalous": true
}
```

**The PC Box grid is a virtual view, not a separate database.** It filters The Vault by `current_game_instance_id` and sorts by `box_index`. There is exactly one source of truth for "owned specimens" and "PC grid coordinates," which prevents drift between the two.

### 5.1 Sandbox Transfer Engine & Legality Enforcer

When a user simulates transferring a UUID specimen between game instances (e.g. Gen 3 FireRed → Gen 4 HeartGold):

```
                     [Initiate Transfer]
                              │
              Is Move/Item Legal in Target Game?
                    /                    \
               (Yes)                    (No)
                 /                        \
       [Clean Transfer]           [Strict Mode Active?]
                                  /                    \
                              (Yes)                  (No / Sandbox Override)
                                /                          \
                       [Block Transfer]           [Allow, flag Anomalous State]
```

- **Strict Mode (default):** hard-blocks invalid operations — no moving assets backward in time, no non-existent items, no illegal movesets. A clear error explains exactly what broke.
- **Sandbox Mode (opt-in override, always available with a warning acknowledgement):** the transfer is allowed to go through. The target instance accepts the non-conforming specimen and triggers an **Anomalous State Protocol**:
  - The specimen's PC Grid slot gets a glowing visual distortion overlay.
  - In the Info Panel, illegal moves, stats, or items pulsate **warning red** (not orange — red, so it reads as unambiguously wrong).
  - The specimen is permanently tagged `is_sandbox_anomalous: true` and filterable in trade history so simulated data is never confused with legitimate progress.
- **Session Version History (Quip-style undo log):** every transfer, bulk mark, or sandbox action is appended to a continuous state log. One click opens the log and rolls the exact box layout/checklist state back to any earlier timestamp. This is the app's only "undo" mechanism, and it is the reason no separate lockout mode is needed (see Rule 2.2).

---

## 6. The PC Box & Living Dex Engine

The tactile precision of the physical games' box system, with a modern relational layer underneath.

```
+-------------------------------------------------------------------+
|  [HINT] Box 1: Kanto Starters (12/30)                             |
+------+------+------+------+------+------+------+------+------+------+
| [PKMN| [PKMN| [PKMN|      |      |      |      |      |      |      |
| [FR] | [R]  | [SS] |      |      |      |      |      |      |      |
| [E]  |      |      |      |      |      |      |      |      |      |
+------+------+------+------+------+------+------+------+------+------+
```

### 6.1 Grid Geometry
- Box interfaces are hard-capped to the exact limits of the source game (e.g. 30 slots/box, 14 boxes for Gen 3, scaling up correctly per generation).
- Default box label format: `Box 1 0001–0030 (12/30)`. Custom names are always allowed.
- **Separate Box toggle (on):** each generation/region snaps to slot index 0 of a new box, leaving a visible buffer gap at the end of the prior box.
- **Separate Box toggle (off):** boxes compact continuously across regions.
- Regardless of the compression setting, quick-navigation "Jump to Gen X" anchors stay pinned in National Dex view for fast scrolling.

### 6.2 Administration Controls
- **Box rearrangement:** drag-and-drop whole 30-slot box containers via a list manager without corrupting individual slot assignments.
- **Box deletion:** deleting a box with tracked specimens triggers a safety prompt to bulk-migrate those assets to overflow, or confirm permanent deletion.
- **Manual overrides:** right-click (desktop) / long-press (mobile) any slot to force a custom slot number, apply a custom label, or lock it from automated sorting.

### 6.3 Custom Sorting Engine
Implemented as a **floating-point Relative Priority Index**, not stored screen coordinates. Dragging a specimen between index `2.0` and `3.0` sets its new index to `2.5`. This keeps custom drag-and-drop reorders cheap to store and instant to render, even across thousands of specimens, and avoids re-indexing the whole table on every drag. Repeated insertions between the same two neighbors eventually run into floating-point precision limits — a background renormalization pass (re-spacing indexes to clean whole/half values) runs periodically per box to reset the precision budget without the user ever noticing.

### 6.4 Cross-Game Overlays — "Origin Badges"
A shadowy silhouette doesn't tell you *where* you own something — so Co-Dex uses small, high-contrast, retro cartridge-spine badges instead.

- Any slot (caught or not, in the active game) shows a stacked row of tiny cartridge-colored spine badges in the corner if that species is tracked as caught in other game instances (e.g. a Charmander slot shows staggered Red / FireRed / SoulSilver spines if you own it in all three).
- Clicking the badge stack opens a non-destructive modal comparing that species across every game save on the account.
- Search bar supports `from:FR` style filters (or a quick-filter dropdown) to instantly highlight, within the current box, everything also caught in a specific other game.

### 6.5 Bulk Actions & Failsafes
- **Mark All Box** / **Unmark All Box** / **Mark All (global)** / **Unmark All (global)** — one-click bulk operations for fast onboarding of an existing real-world collection.
- Every bulk operation is preceded by an automatic state snapshot. A floating **"Revert to Selected"** button stays active until the user leaves the tab, so no accidental full-checklist wipe is ever permanent. This is on top of, and independent from, the full Session Version History log.

### 6.6 Variant / Gender / Duplicate Slide
- Slots with forms or regional variants show a subtle embedded slide handle. Activating it opens the variants sliding over or popping outward with a depth effect — the surrounding 30-slot grid geometry never resizes or shifts.
- Genders are controlled by a single global "Expand All Genders" master toggle (not per-slot), so gender view stays consistent across the whole box.
- A master "expand everything" toggle exists to blow open all variants/genders/duplicates across the whole dex at once when needed.

### 6.7 Evolution Reservation Outlines
Flagging a specimen for future evolution applies a distinct glowing dashed border around the **target evolution's** slot in the box — a visual thread connecting the current project Pokémon to its goal. The reservation lock prevents that specimen from being accidentally traded or transferred away while active.

**Trade-evolution matching:** some evolutions (Machoke→Machamp, Kadabra→Alakazam, Haunter→Gengar, and others) are mechanically impossible solo — they require being traded. Co-Dex flags these specimens `requires_trade: true` and surfaces them against your Link Cable trade history/partners (Section 13.2), so the app can proactively suggest "trade this to a friend and back" instead of leaving the player to remember which evolutions need a trade partner.

### 6.8 View & Sort Modes (state remembered per profile)
- **National View** — universal National Dex order, capped to that game's generation.
- **Regional View** — that game's native regional dex order.
- **Type View** — auto-grouped by elemental typing.
- **Custom View** — the user's drag-and-drop floating priority index (Section 6.3).

### 6.9 Filters
Shiny · Legendary · Mythical · Type · Flagged (custom marker) · Hide Caught · Separate Box (on/off, Section 6.1).

### 6.10 Shiny Tracking (Dual Layer)
- **Global mode:** a master toggle flips the whole interface into a dedicated Shiny Hunt Checklist.
- **Individual mode:** in the normal dex, marking one specimen shiny applies a unique highlight color to its slot and swaps its sprite for the official shiny asset.

### 6.11 "Catch Next" Generator
A randomized utility scans the current game instance for uncaught species and surfaces one target at random, along with its exact overworld spawn coordinates (linking into the Map Guide, Section 7).

### 6.12 Per-Pokémon Info Panel
Clicking any specimen opens a contextual panel:
- Core reference data: location(s), evolution tree, level-up path, a link out to the full learnset.
- Live tracking layer (Living Dex only): held item assignment, transfer/sandbox selection, evolution reservation toggle (including triggering the evolution itself), flag/marker assignment.
- Sleek, low-profile external links at the bottom: Bulbapedia and Serebii.
- **Non-destructive navigation:** opening/closing this panel (or a search result) never resets scroll position or active filters on the box behind it.

### 6.13 The Static Pokédex (Wiki Mirror)
A fully separate, read-only reference dex — no UUIDs, no checkboxes, no state. Just caught/uncaught at a glance globally. Selecting an entry opens a detail page (same shared component as the Info Panel's reference layer) and returning from it preserves the exact scroll position and filters the user had.

### 6.14 Dynamic Visual Stat Bars
Every Pokémon display includes a horizontal base-stat gauge, color-coded via Tailwind thresholds:

| Range | Color | Meaning |
|---|---|---|
| ≤ 59 | Red | Extremely Poor |
| 60–89 | Orange | Below Average |
| 90–119 | Green | Strong / Good |
| ≥ 120 | Blue / Cyan | Elite / Legendary |

Color is never the only signal — each tier also gets a short label/icon on the bar itself, so the system reads correctly for colorblind users (roughly 1 in 12 men) without breaking the visual design.

### 6.15 Item Dex & Type Dex
- **Item Dex:** searchable database of item descriptions, prices, categories, and in-game locations, sourced live from PokéAPI and cached locally.
- **Type Dex:** an interactive matrix — tap up to two types to see exact defensive weaknesses, resistances, immunities, and offensive matchups, computed dynamically from the same reference dataset the damage calculator and teambuilder use (see Section 8, consolidation note).

---

## 7. The Interactive Tile-Map Guide

Modeled directly on the pkmnmap.com style of interactive tile map — not a flat, static regional image.

```
┌──────────────────────────────────────────────────────────┐
│ [MAP VIEW: ROUTE 104]                                    │
│ ┌────────────────────────┐  [Active Overlays]            │
│ │ (Grass Patch Tiles)    │   [X] Show EV Spawns (+Atk)    │
│ │   Encounter Metrics:   │   [X] Filter Uncaught Routes   │
│ │   - Marill (30%)   [C] │                                │
│ │   - Taillow (20%)  [ ] │   [Target Tracking Profile]    │
│ └────────────────────────┘   Target: Atk → Highlighted   │
└──────────────────────────────────────────────────────────┘
```

### 7.1 Rendering
- Leaflet.js with `L.CRS.Simple`, rendering per-game 256×256 tile sets sliced into `public/maps/<region>/<zoom>/<x>/<y>.png`. Tiles lazy-load only what's on screen.
- Toggleable layers: wild encounter grass/water/cave zones, overworld items, trainers.
- **Coordinate data** (where each grass patch, item ball, and trainer sits) is sourced per Section 4.1 from the decompilation projects' map files, processed at build time — never fetched live, never reverse-engineered per-user.
- **Tile art** is original or properly licensed retro pixel art in a matching style, not extracted ROM tilesets or screenshots (Section 4.1) — this is the one piece of Co-Dex that is genuinely ongoing art production, not engineering.

### 7.2 Living Dex Awareness
- The map reads your active game's Vault data live. Routes containing species you haven't caught glow subtly.
- Tapping a route opens an encounter drawer with percentage weights and absolute status: `Marill (30%) [Caught]`, `Taillow (20%) [Uncaught]`.
- Item markers: tapping marks an item "Claimed," turning it semi-transparent and persisting that state locally.

### 7.3 Gym & Boss Walkthroughs
Major bosses, rivals, and Gym Leaders get custom high-priority markers. Clicking one opens an overlay with:
- Full roster (levels, types, abilities, held items).
- Complete movesets for every opponent Pokémon.
- Auto-generated counter-strategy suggestions, pulled from the player's own live Vault based on type advantage and stat values.

### 7.4 Pro EV/IV Analytics & Training Heatmaps
Toggling Pro Mode overlays the stat formula and turns the map into a training tool:

```
Stat = floor( ( (2 × Base + IV + floor(EV / 4)) × Level / 100 + 5 ) × Nature )
```

Selecting a target stat (e.g. Speed) transforms the map into a heatmap of high-density spawn points for that EV yield (e.g. lighting up Kanto Route 4 for concentrated +1 Attack EV Mankey spawns), alongside recommended hold items (Macho Brace, Power items) and live training progress.

---

## 8. Team Builder & Battle Systems

### 8.1 Vault-Aware Teambuilder
Building a team reads live Vault data directly. If a slot matches a specimen you already own, Co-Dex says so: *"You already own a battle-ready Tyranitar with these exact parameters in your HeartGold Box. Togekiss remains unbred."*

### 8.2 In-App Damage Calculator
Bundles `@smogon/calc` (or `@pkmn/dmg`) running entirely client-side — no server, no scraping. Players pull a Pokémon straight from the Vault, load an opposing Pokémon (custom or a common competitive template), and get min/max/average damage, OHKO/2HKO probabilities, and results under varying weather, screens, and terrain.

**Consolidation note:** the Type Dex (6.15), the damage calculator, and the teambuilder's legality checks all read from one shared "Combat Data Engine" dataset — moves, types, and abilities are fetched and cached once, not re-implemented per feature.

### 8.3 Showdown Integration — Three Tiers
- **Tier 1 (must-have, MVP):** paste/export a Showdown text string; Co-Dex parses it straight into the Teambuilder, and exports any built team back to Showdown format.
- **Tier 2 (must-have, MVP):** the inventory-aware hook from 8.1 — the Teambuilder actively cross-references live Vault data against the built team.
- **Tier 3 (v1 approach — deep link):** the official `play.pokemonshowdown.com` client actively blocks iframe embedding (it ships frame-busting JS specifically to prevent this), so "Push to Battle" opens Showdown in a new tab with the team already packaged and ready to import/paste — not literally inside Co-Dex, but working today at $0 cost.
- **Tier 3+ (optional, self-hosted, later):** because you control the code on a self-hosted Showdown server (it's open source), the frame-busting restriction goes away — a self-hosted instance *can* be embedded and can accept direct "Push to Battle" injection the way the original vision described. This isn't part of the $0 static-hosting base app since it needs a real persistent server process, so it's built as an optional, easy-to-stand-up module (a documented one-command Docker Compose setup) that Co-Dex can point at via a configurable server-URL setting — for Dan, a future community host, or anyone who wants to run one. Default behavior with no configured server is the deep-link in the line above.

### 8.4 Breeding Planner
Core to the theorycrafting side of Co-Dex — planning breeding projects, not just tracking finished specimens. Was part of the original day-one brief; reinstated here as a first-class feature alongside the Team Builder.

- **Egg Group Compatibility Checker:** pick two Vault specimens (or a specimen + a Ditto) and instantly see whether they're breedable, sourced from the same PokéAPI reference data as everything else.
- **Chain Breeding / IV Planner:** given a target IV spread, walks backward through the classic Destiny Knot (5-IV inheritance) + Everstone (nature lock) breeding chain, telling you exactly which intermediate parent combinations you need and how many generations deep — the math nobody wants to do on paper.
- **Egg Move Inheritance Tree:** shows which egg moves are obtainable on a target species, and which specific father-species/move combination passes each one down, with the option to check "do I already have this parent" against your live Vault (same live-inventory pattern as the Teambuilder in 8.1).
- **Breeding Project Lock:** earmarking a specimen as an active breeding parent uses the same Project Lock mechanism as Evolution Reservation (6.7), preventing it from being accidentally traded or transferred away mid-project. A specimen can be locked for evolution and breeding simultaneously without conflict.

### 8.5 Team Synergy Analyzer
Extends the single-Pokémon Damage Calculator (8.2) to the whole party: a 6-vs-6 type coverage matrix showing your team's combined weaknesses, resistances, and immunities at a glance, plus a move-coverage gap check (e.g. "your team has no answer to Fairy-types"). Built entirely from the shared Combat Data Engine (8.2's consolidation note) — no new dataset, just new aggregation logic over an existing team.

---

## 9. Meta Analytics Dashboard

Fetches monthly Smogon usage data on demand from the public `@pkmn/stats` CDN — no scraping, no stored bytes, all client-side.

- Most-used Pokémon per competitive tier (OU, UU, VGC, etc.).
- Most common moves/items/abilities for a selected Pokémon.
- Win-rate benchmarks and common defensive counters.

---

## 10. Nuzlocke Mode

Enforced directly in the Dexie.js local state, scoped to a single `game_instance_id` (Section 5) — toggling Nuzlocke Mode on one playthrough never affects any other save of the same or a different title:

1. If a Pokémon's HP hits 0, it's flagged `dead: true` and auto-transferred to a locked "Graveyard" box.
2. The Map Guide checks local state for a "first encounter" registered on that Route ID. Once one is logged, the capture option for every other wild encounter on that route locks.
3. Every Vault entry auto-logs exact Route ID, level, date, and game context at time of capture (Catch Location History).

---

## 11. Shiny Hunting Companion

Two complementary layers:

**11.1 Full Hunt Calculator Suite** — real-time probability, updating live based on method toggles: Masuda Method (including parent-region logic), Shiny Charm active/inactive, and game-specific methods (Chain Fishing in Gen 6, DexNav Chains in ORAS, SOS Battles in Gen 7, Mass Outbreaks in Gen 8/9).

**11.2 Tactical Hunt Widget** — kept deliberately out of the way for casual collectors: activated only via an explicit long-press (mobile) / right-click (desktop) context menu on a box slot. Once activated, the slot becomes a localized tracker with a tactile tap/click counter, a stopwatch session timer, and the live odds calculator from 11.1 running underneath. A single click on capture converts the tracking widget directly into a verified shiny specimen in the Vault, no re-entry needed.

---

## 12. Social Trade Hub & Profile Engine

Pure data-coordination — Co-Dex never touches or moves an actual game file, only database records, which is core to the legal safe-harbor (Section 3).

### 12.1 Public Profile
Every user gets a shareable profile URL: collection stats, earned Badges (Section 12.4), and an auto-generated "Wants & Needs Sheet" pulled from the gaps in their active game instances.

### 12.2 Two Trading Modes, User's Choice — Not Mutually Exclusive
- **Passive static bulletin (always available as a fallback):** the profile works as a plain read-only reference card for coordinating manual trades on physical consoles — no account linkage required on the other end.
- **Active trade inquiry (in-platform):** User A sends a trade request from User B's profile. On mutual confirmation, ownership of the specific UUID specimens swaps between accounts, updates both users' checklists, and logs the transaction in both users' public history and the specimen's own history ledger.

Both modes are first-class — nobody is forced into the interactive flow just because it exists.

### 12.3 v1 Scope Decision — Live Trading Ships as Link Cable Only
Active, async trade inquiries between two arbitrary strangers (one of whom may be offline) need an always-on hosted service to store profiles and hold pending requests — that's a real backend, which doesn't exist anywhere else in this stack. Rather than compromise the $0/serverless architecture to support it now, or design it in a way that would need to be redone later, the decision is:

- **v1 ships the Passive Bulletin (12.2) and the live, P2P Link Cable (Section 13) as the complete trading experience.** Both are fully $0/serverless — Link Cable works because both people are online in the same session at once, no persistent server required.
- **The async Active Trade Inquiry flow is designed for, not built.** Public profile data (Section 12.1) is already a clean, self-contained, exportable snapshot generated entirely from local Vault data — nothing about it depends on a future backend existing. When a minimal, **profiles-only** hosted service is added later (never game logic, never the authoritative record of what a specimen's owner is — that stays local-first, synced the same "most recent timestamp wins" way as everything else), the Active Trade Inquiry flow can be turned on without changing the data model.
- This keeps the promise in Section 21 ("no server, no per-user cost") fully true for everything shipped, while leaving an intentional, non-breaking door open for exactly one optional exception later.

### 12.4 Rewards Engine: Badges & Certificates
Two related but distinct reward types, both computed entirely from local data — no server, no manual entry.

- **Badges** are persistent achievement icons, earned automatically when a tracked completion threshold is hit — a full regional or national Living Dex, a full Shiny Living Dex, a completed generation of the Game Collection (Section 22), a finished Breeding Planner perfect-IV project (8.4), a first Nuzlocke victory (Section 10), a milestone count of Link Cable trades, and so on. Badges display permanently on the Trainer Profile (12.1) and in an in-app Trophy Case, each with its own progress bar reusing the same visual language as every other completion bar in the app (Sections 6.8, 22.3) — a badge in progress looks and feels like the rest of Co-Dex, not a separate system to learn.
- **Certificates** are not a second achievement system — they're an export action attached to a specific subset of higher-tier badges (a full dex, a shiny living dex, a completed generation, a Nuzlocke win). Hitting one of those badges offers a canvas-rendered, retro-styled certificate image (trainer name, game, completion date, milestone art) that downloads as a shareable PNG — built for showing off on Discord/social media, entirely client-side, no server involved.
- **Not redundant — one feeds the other.** Badges are the broad, ongoing collection of achievement icons that live on your profile forever; certificates are the special, one-time "proof" image generated only for the milestone-tier badges worth sharing outside the app. Every certificate implies a badge; not every badge produces a certificate.
- v1 ships a fixed, curated badge/certificate catalog rather than user-defined custom badges, to keep reward criteria simple and consistent. Extending the catalog later is a data task, the same pattern as Sections 4.1 and 22.4.

---

## 13. WebRTC "Link Cable" — Serverless P2P Layer

No login, no server, no per-user cost — everything below runs over direct WebRTC data channels via PeerJS.

### 13.1 Device Sync (Phone ↔ PC)
1. One device generates a pairing ID, shown as a QR code.
2. The other device scans it to open a PeerJS handshake.
3. The two local databases sync using "most recently updated wins" (same conflict rule as Section 14.2).

### 13.2 Direct P2P Trading & In-Person Meetups
- Two users enter a matching room code (or scan a QR in person) to open a direct WebRTC channel, each pick a Vault specimen, and on dual confirmation the trade executes — rewriting `current_game_instance_id`/ownership on both local databases.
- **Local tournaments:** pairings can be shared as in-person QR codes, with WebRTC pushing live results back to a host's screen.

### 13.3 Serverless Matchmaking (The Lobby) — Decentralized Signaling
Since there's no server to run a matchmaking database, lobby discovery uses a public, free relay as a disposable bulletin board:

1. A player taps "Host Battle" or "Find Battle." The app generates a temporary PeerJS WebRTC ID.
2. The app publishes a small, ephemeral payload to a public Nostr relay:
```json
{ "type": "CODEX_LOBBY_OFFER", "peerId": "peerjs_abc123_xyz", "format": "Gen9_OU", "timestamp": 1783984000 }
```
3. Other Co-Dex clients scanning the same relay populate an "Available Players" list and tap to connect — the two devices establish a direct WebRTC handshake and the battle begins, entirely peer-to-peer.

### 13.4 Ephemeral P2P Chat
A transient, local chat box lives directly inside the Link Cable UI for the duration of a connection — pure peer-to-peer, nothing ever touches an external server. Useful for confirming meeting spots or move/level requirements mid-trade. All messages are wiped immediately on disconnect; nothing is retained.

---

## 14. Offline-First Architecture & Synchronization

### 14.1 Local Storage
All box adjustments, checklist edits, and map markers write to browser IndexedDB (via Dexie.js) or mobile SQLite. Every write carries a millisecond-precision timestamp.

### 14.2 Conflict Resolution
**Most recently updated timestamp wins**, applied automatically on reconnect — no manual conflict-resolution prompts interrupting the user.

### 14.3 Version History (the app's only "undo")
Every write — bulk marks, sandbox transfers, sync overwrites — is appended to a continuous, Quip-style session log. Opening the Version History panel lets a user review what changed and roll back to any earlier state with one click. This is the mechanism that makes the "no PIN lock needed" decision in Rule 2.2 safe.

**Pruning policy:** the log keeps full, granular detail for a rolling recent window (e.g. the last 30 days or last N actions, whichever is larger) so undo always covers realistic "oops" scenarios. Older entries are compacted into a single per-day summary rather than deleted outright, so IndexedDB storage doesn't grow unbounded over years of use while a rough history is still browsable.

---

## 15. Spreadsheet-Killer Power Layer

Built specifically to out-compete the Google Sheets/Excel trackers hardcore collectors already rely on, without losing Co-Dex's simplicity for casual users.

### 15.1 Open-Gate Import/Export
- One-click **Export Vault** to clean, structured JSON and CSV.
- **Smart-Map Importer:** upload any third-party spreadsheet and map its columns (e.g. "Dex No," "Caught Status," "Shiny Variant") onto Co-Dex's schema to populate boxes instantly — no manual re-entry of years of tracking.

### 15.2 Desktop Power Shortcuts
- **Marquee selection:** hold `Shift` and drag a bounding box to multi-select grid slots (desktop/web).
- **Hotkeys** on a selection: `C` toggle caught, `S` toggle shiny, `H` assign a custom tag, `Delete` clear to empty.

### 15.3 Dynamic Tagging
Custom, color-coded capsule tags (`"Nuzlocke Champion"`, `"OT: Erika"`, `"Trade Bait"`) bound to any specimen's UUID, fully searchable via the query bar (`tag:"Nuzlocke"`, `ball:"Premier"`).

**Query grammar (v1 operators):** `tag:"X"` (custom tag), `ball:"X"` (Poké Ball type), `from:XX` (cross-game origin, Section 6.4), `dex:###` (National Dex number). Plain text with no operator falls back to a fuzzy name search. New operators are additive and never break existing saved searches.

### 15.4 Auto-Generated Visual Dashboards
No manual pivot tables — Co-Dex renders retro-styled charts automatically: regional/national completion bars, shiny hunt luck-ratio scatterplots (encounters vs. expected odds), and shareable "Living Dex empty-slot" shopping lists.

---

## 16. Cloud Backup (BYOC — Bring Your Own Cloud)

Optional, client-side only, no Co-Dex-hosted storage:
- Google Drive OAuth2 client flow lets a user push a small structured `save.json` (their Dexie DB state) to their own Drive app-data folder.
- Manual export/import of a single `.codex` file is always available as a no-account-required alternative.

---

## 17. Visual Theme System

- **Light Mode:** high-contrast, paper-white retro theme.
- **Dark Mode:** true-black AMOLED, power-saving.
- **The Co-Dex Warning Protocol:** any mechanical/legality error (sandbox anomalies, illegal transfers) switches the relevant UI element to a sharp, pulsating warning-red state — reserved exclusively for real errors, never used decoratively, so it always reads as "something is actually wrong."
- Pixel-art sprites throughout for Pokémon, items, and game logos; stylized retro "game-feeling" artwork specifically for badges, earmarks, and milestones.

---

## 18. Project Directory Tree

```
co-dex/
├── public/
│   └── maps/                  # Sliced Leaflet tile folders (e.g. /kanto/zoom/x/y.png)
├── src/
│   ├── components/
│   │   ├── ConsoleFrame.tsx   # Handheld console layout frame
│   │   ├── StatBar.tsx        # Color-coded base stat bar
│   │   ├── LinkCable.tsx      # WebRTC sync/trade/chat UI
│   │   ├── MapScreen.tsx      # Leaflet map + walkthrough layers
│   │   ├── DamageCalc.tsx     # @smogon/calc wrapper
│   │   ├── CollectionShelf.tsx # Game Collection box-art grid (grayscale ↔ color)
│   │   ├── BreedingPlanner.tsx # Egg group check, IV chain planner, egg move tree
│   │   ├── TeamSynergy.tsx    # 6-vs-6 coverage matrix
│   │   └── TrophyCase.tsx     # Badge display + certificate export trigger
│   ├── db/
│   │   └── schema.ts          # Dexie.js schema (trainer, vault, map_progress, Nuzlocke state, collectibles, badges)
│   ├── hooks/
│   │   ├── useGoogleDrive.ts  # Client-side BYOC backup
│   │   ├── useNostrLobby.ts   # P2P matchmaking signaling
│   │   └── useWebRTC.ts       # P2P connection handling
│   ├── services/
│   │   ├── pokeapi.ts         # PokéAPI fetch + local cache
│   │   ├── smogonStats.ts     # Meta analytics client-side parser
│   │   ├── gameCatalog.ts     # TheGamesDB box art + metadata fetch + cache
│   │   ├── rewardsEngine.ts   # Badge criteria evaluation
│   │   └── certificateRenderer.ts # Canvas-rendered shareable certificate export
│   ├── App.tsx
│   └── index.css              # Tailwind config & pixel-art overrides
├── package.json
└── vite.config.ts
```

---

## 19. First-Sprint Kickoff Prompt (for Claude Code)

```
Let's build the foundation for Co-Dex with Nuzlocke and Custom Stat UI support.
Initialize a React 19 + Vite + TypeScript project.

Install:
- dexie
- dexie-react-hooks
- @smogon/calc

Step 1: Local Database Schema (src/db/schema.ts)
Set up the Dexie.js schema supporting:
- game_titles (static reference: game_title_id, name, generation, box_count, boxes_slots)
- game_instances (game_instance_id, game_title_id, isNuzlockeMode: boolean, created_date)
- trainer_profile (active game_instance_id)
- vault (uuid, species, level, hp, dead: boolean, catchLocation, nickname, ivs, evs, moves, held_item, tags, box_index, current_game_instance_id, origin_game_instance_id, is_sandbox_anomalous, history_log)
- map_progress (routeId, game_instance_id, firstEncounterLogged: boolean, itemChecklist: object)

Step 2: Interactive StatBar Component (src/components/StatBar.tsx)
Render a base stat (0-255) as a horizontal gauge with dynamic Tailwind color:
- Red <= 59, Orange 60-89, Green 90-119, Blue >= 120

Step 3: Configure Vite + Tailwind for pixelated, retro styling per the CLAUDE.md aesthetic rules.

Provide code and shell commands. Skip conversational explanations.
```

**Suggested build order (approx. 8–15 hours of active prompting):**
1. Database & core state — Vite/React project, Dexie schema (1–2 hrs)
2. Retro UI shell — console frame, fonts, base nav (2–3 hrs)
3. Leaflet overworld map — tile slicing, route component, markers (3–4 hrs)
4. WebRTC "Link Cable" — PeerJS sync/trade/chat (2–3 hrs)
5. Cloud save sync — Google Drive BYOC backup (1–2 hrs)

Damage calculator, meta analytics, Nuzlocke enforcement, and the full Map Guide walkthrough layers extend from this foundation in subsequent sprints.

---

## 20. CLAUDE.md — Developer Guardrails

```markdown
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
   History/Undo (Section 14.3), never by a secondary permission gate.
6. Strict Mode is the default for cross-game transfers; Sandbox Mode is an
   explicit, warned opt-in per transfer, never a global setting.
7. Non-commercial, always: no paywalls, ads, or premium tiers, ever.

## Common CLI Commands
* Dev server: `npm run dev`
* Type check: `npx tsc --noEmit`
* Production build: `npm run build`
```

---

## 21. Feasibility, Demand, and Legal Validation

**Can it be built as designed?** Yes. React/Vite/Tailwind handles the UI and rigid CSS-Grid box system; Dexie.js/IndexedDB handles local-first storage; Leaflet with `L.CRS.Simple` handles the tile map; PeerJS + a public Nostr relay handles P2P sync, trading, battling, and matchmaking without a server; `@smogon/calc` and `@pkmn/stats` handle the damage calculator and meta analytics entirely client-side. Every piece of *what's actually shipping in v1* maps to an existing, free, client-side tool — the one deliberate exception is the async Active Trade Inquiry (Section 12.3), which is designed for but not built, and would need a minimal profiles-only backend if it's ever turned on.

**Would it be used?** Very likely — the Pokémon fan community is large, dedicated, and currently split across four or five disconnected tools (a tracker, Showdown, a spreadsheet, a wiki, a map site). A single app that's beautifully designed, retro, child-accessible, and actually aware of what a player owns is a meaningful upgrade over the status quo.

**Is it legal?** Yes, provided the Section 3 triad is followed without exception: strictly non-commercial, zero hosted copyrighted assets/ROMs, and pure client-side/API-based presentation with no official affiliation implied. This is the same posture that has let Smogon, Serebii, and Bulbapedia operate for two decades.

---

## 22. The Game Collection — Physical Collectibles Catalog

A genuinely separate module from The Vault: The Vault tracks Pokémon *species/specimens* you've caught in-game; the Game Collection tracks physical *objects* you own in real life. Same "living dex" philosophy, different subject.

### 22.1 Core Concept — The Shelf
The Game Collection is a complete, scrollable catalog of every Pokémon game ever released (mainline, remakes, spinoffs), displayed as a grid of box art — not a plain checklist. It behaves like a Living Dex for physical media:

- **Unowned titles** render as desaturated / grayscale box art — present in the catalog, but visibly "not yours yet."
- **Owning a copy "catches" the title** — the moment at least one physical copy is logged, the box art snaps back to full color. This is the exact same interaction pattern as the shiny sprite-swap in Section 6.10, applied to box art instead of a Pokémon sprite.
- The catalog itself is comprehensive and read-only reference data (title, platform, region, release year, box art) — sourced the same way species data is: fetched live from TheGamesDB (Section 4.1) and cached locally, never bundled into the repo, in keeping with the Section 3 legal triad.

### 22.2 Ownership Records — Multiple Copies Per Title
A catalog tile only answers "do I own at least one copy of this." Opening a tile reveals the individual physical copies logged against it, because a collector can own the same title loose, CIB, *and* graded at once. Each physical copy is its own record:

```json
{
  "copy_id": "col_7a21_pkmn_firered_cib",
  "catalog_id": "gba_firered",
  "condition": "CIB",
  "grading": {
    "is_graded": true,
    "company": "WATA",
    "grade": "9.6 A+",
    "cert_number": "1234567"
  },
  "acquisition": {
    "purchase_price": 85.00,
    "purchase_date": "2024-03-02",
    "source": "Local game store"
  },
  "disposition": {
    "is_sold": false,
    "sold_price": null,
    "sold_date": null,
    "sold_via": null
  },
  "linked_game_instance_id": "firered_save_1",
  "notes": "First cartridge, matches childhood copy",
  "tags": ["childhood", "graded"]
}
```

- **Condition:** CIB / Loose / Sealed / New / Box-Only / Manual-Only, freely extensible.
- **Grading:** an on/off toggle per copy — grading company (WATA, VGA, AFA for games; extensible to PSA/BGS/CGC once cards are added), numeric/letter grade, and cert number.
- **Price data — manual by default.** Purchase price/date/source and sold price/date/venue are entered by the user, exactly like every other number in Co-Dex — no live pricing API, no scraping, $0 cost, no ToS risk. A later, fully optional "pull a reference price" button can hit a free-tier lookup (e.g. PriceCharting's no-auth Games & Comics endpoint) purely as a rough guide — clearly labeled as an estimate, never treated as the source of truth.
- **Vault linking is optional, per copy.** A physical copy can be connected to its matching Living Dex game instance (Section 5) — e.g. your graded FireRed cartridge can link to your active FireRed playthrough — via `linked_game_instance_id`. Unlinked copies work exactly the same; this is a convenience, not a requirement.

### 22.3 Views & Filters
- Grid view (box art, color/grayscale by ownership) and a detail list view per title (all owned copies with condition/grading/price).
- Filter by platform, generation, region, owned vs. wishlist, graded vs. raw, and condition.
- Aggregate dashboard: total titles owned vs. full catalog (a completion bar identical in spirit to the Living Dex progress bar), total spent, and total current value if reference prices or manual valuations are entered.
- Wishlist entries feed the same "Wants & Needs Sheet" used by the Social Trade Hub (Section 12.1), so missing games show up right alongside missing Pokémon.

### 22.4 Future Categories — Same Engine, New Catalogs
Cards, movies, and other merch are explicitly a "someday" per Dan, not MVP — but the schema is built generically now so adding them later is a data problem, not an architecture problem. A `CollectibleItem` record has a `category` field (`game` / `card` / `movie` / `merch`); condition, grading, acquisition, and disposition fields are shared across all categories.

- **Cards (future):** catalog sourced from `pokemontcg.io` (free, public, image-inclusive — the same spirit as PokéAPI). Grading companies extend to PSA/BGS/CGC.
- **Movies (future):** catalog keyed by title + physical format (VHS/DVD/Blu-ray/Steelbook).
- **Merch (future):** freeform catalog entries (plushies, figures, apparel) since there's no single authoritative public database for merch — these would be user-added catalog entries rather than API-sourced.

---

## 23. Deferred: Pokémon GO & Pokémon Pokopia

Both stubbed into the data model now, both explicitly **not built** in this pass. Manual-entry only if either is ever built out — no live API integration for either, for different reasons:

- **Pokémon GO:** Niantic has never published a public API, their ToS explicitly prohibits third-party server access, and they have geo-blocked entire country launches over unauthorized access attempts in the past. Any live/account-linked integration would directly conflict with the Section 3 legal safe-harbor this whole app depends on. If built later, it is a manual checklist only — the user types in what they've caught, nothing ever talks to Niantic's servers.
- **Pokémon Pokopia:** a real, official Game Freak/Omega Force life-sim for Switch 2 (released March 2026) — not a catch-and-store game, so it doesn't map onto the PC Box/Living Dex engine at all (no traditional catching, no boxes; it's a crafting/home-building game where Ditto borrows other Pokémon's moves). There's also no public API — it's brand new and unlikely to ever have one. If built later, this is its own small, manually-curated module (tracking decorations, crafting materials, expansion-pass content), not a re-use of existing Vault code.

Both are placeholders in name only: a `future_modules` note in the schema and a "Coming Later" tile in the nav, nothing more, until there's a concrete reason to build further.

---

## 24. Resolved Contradictions (Changelog)

Earlier drafts in this project's history disagreed with each other on a few points. These are the final calls, made in favor of the simplest design that satisfies Section 2:

- **"Junior Guard" PIN lock:** proposed, then cut. Superseded entirely by Version History/Undo (Sections 6.5, 14.3). A lockout mode added a second safety system doing the same job as the first, and fought the two-tap/no-dead-ends rule.
- **Cross-game "shadowy silhouette" overlay:** replaced by the cartridge-spine Origin Badge system (Section 6.4) — a silhouette doesn't say *which* other game you own the Pokémon in; stacked cartridge-colored badges do, at a glance.
- **Sandbox anomaly color:** locked to warning **red**, not orange — orange is already used for the stat-bar "below average" tier (Section 6.14) and for below-legal-but-not-broken states elsewhere; red is reserved exclusively for "this is mechanically illegal."
- **Shiny Hunt widget activation:** locked to the deliberate long-press/right-click context menu (Section 11.2), not a widget visible by default — keeps it out of the way for players who don't hunt shinies.
- **Vault vs. PC Box as separate databases:** consolidated into one — the PC Box is a filtered view over the Vault, not a second table (Section 5).
- **Pokémon GO / Pokopia:** considered for live integration, both deferred (Section 23) — GO for legal/ToS conflict with Section 3, Pokopia for architectural mismatch (it isn't a catching game) and lack of any public data source.
- **Game Collection pricing:** decided manual-entry-first (Section 22.2) rather than a live pricing API, since no free, legal, comprehensive option exists (PriceCharting's real API is paid; eBay sold-comp scraping violates their ToS) — keeps the feature at true $0 cost and consistent with the local-first philosophy everywhere else.
- **Social Trade Hub scope:** the async, stranger-to-stranger Active Trade Inquiry (12.2) needs an always-on backend that doesn't exist in this stack. v1 ships Passive Bulletin + Link Cable only (Section 12.3); the async flow is designed for via a clean, exportable profile snapshot, but deliberately not built until a minimal profiles-only hosted service is added later.
- **Showdown Tier 3:** the literal "embedded iframe" plan doesn't work — `play.pokemonshowdown.com` actively blocks iframing. v1 uses a deep-link ("Push to Battle" opens a new tab, team pre-packaged); a self-hosted Showdown server (which removes the framing restriction entirely, since you control the code) is documented as an optional later module, not the default (Section 8.3).
- **Reference data sourcing:** box counts, dex order, generation-legality rules, and map coordinates all come from the open Pokémon decompilation projects (pret's `pokered`/`pokeemerald`/etc.) as facts, processed at build time — not from PokéAPI, which doesn't cover any of this (Section 4.1). Map tile *art* still has to be original/licensed pixel art, which is real art work, not a data problem.
- **Box art source:** IGDB dropped in favor of TheGamesDB — IGDB's OAuth2 client-secret exchange has no safe home in a pure static client-side app; TheGamesDB's simple API-key model does (Section 4.1, 22.1).
- **Game Title vs. Game Instance:** split into two concepts so a player can run multiple simultaneous saves of the same title (e.g. a normal and a Nuzlocke Emerald run) without schema conflicts (Section 5). All "current game" references elsewhere resolve to `game_instance_id`.
- **v1 game scope:** one game, fully working end-to-end, before expanding — the box/dex/map reference data above is one-time content-pipeline work, not something that scales for free across every game at once (Section 4.1).
- **Platform target:** PWA only for v1 — installable, offline-capable, works everywhere. A native App Store/Play Store wrapper (Capacitor/Tauri) is explicitly not in scope.
- **Breeding Planner reinstated (Section 8.4):** part of the original day-one brief ("dynamic breeding utilities"), dropped somewhere in consolidation, added back as a first-class feature alongside the Team Builder — egg group checks, IV chain breeding, and egg move inheritance.
- **Trade-evolution matching added (Section 6.7):** trade-only evolutions are flagged and matched against Link Cable trade history instead of being left for the player to remember.
- **Team Synergy Analyzer added (Section 8.5):** full 6-vs-6 coverage matrix, built from the existing Combat Data Engine.
- **Badges vs. Certificates — decided complementary, not redundant (Section 12.4):** Badges are the persistent, ongoing achievement layer shown on the profile and Trophy Case; Certificates are a shareable export action attached to a subset of the higher-tier badges. Both ship together, one feeding the other.
