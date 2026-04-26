<div align="center">

# ✦ ASHA ✦

### *A connected‑lens AR game for Snap Spectacles*

[![Lens Studio](https://img.shields.io/badge/Lens%20Studio-5.15-FFFC00?logo=snapchat&logoColor=black)](https://ar.snap.com/lens-studio)
[![Spectacles](https://img.shields.io/badge/Spectacles-2024-000?logo=snapchat&logoColor=white)](https://www.spectacles.com/)
[![SIK](https://img.shields.io/badge/SpectaclesInteractionKit-0.15-7A5FFF)](https://developers.snap.com/spectacles/about-spectacles-features/spectacles-interaction-kit/getting-started)
[![SyncKit](https://img.shields.io/badge/Spectacles%20Sync%20Kit-1.3-3DDBD9)](https://developers.snap.com/spectacles/about-spectacles-frameworks/spectacles-sync-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](#)

**Inspiration (tone only):** naming and mood nod to **Asha Vahishta** and the **sacred fire (Atar)** in Zoroastrian tradition — truth, order, and light as a through‑line. The product is a **Spectacles** multiplayer / solo element game, not religious instruction.

**Repository:** reference for the **Spectacles team** (build review, handoff, internal docs). **Not** an open‑source or public redistribution release — no license to fork or ship outside Snap is granted here unless explicitly agreed in writing.

</div>

---

## ✦ What it is

**ASHA** is built **for Spectacles**: colocated **Connected Lens** sessions, hand‑first UI (SIK), five elemental “cards” (**ATAR · ABAN · ZAM · VAYU · KHSHATHRA**), a shared **Arena Orb**, solo vs **Magi** bots, and optional world placement + XR polish layers. Everything is authored in **Lens Studio** with TypeScript.

---

## ✦ The Five Elements

| # | Name | Element | Glyph | Beats | Loses |
|---|------|---------|:---:|:---:|:---:|
| 0 | **ATAR** — Sacred Fire | Fire | 🔥 | ZAM, VAYU | ABAN, KHSHATHRA |
| 1 | **ABAN** — the Waters | Water | 💧 | ATAR, KHSHATHRA | ZAM, VAYU |
| 2 | **ZAM** — the Earth | Earth | 🪨 | ABAN, VAYU | ATAR, KHSHATHRA |
| 3 | **VAYU** — the Wind | Wind | 🌪 | ATAR, ABAN | ZAM, KHSHATHRA |
| 4 | **KHSHATHRA** — Sovereign Metal | Metal | ⚔ | ZAM, VAYU | ATAR, ABAN |

A cyclical 5‑element resolution matrix — every element is the answer to two others and the question of two more. There is no dominant element, only the dance.

---

## ✦ Gameplay

### Solo — *Against the Magi*
Choose **1–5 Magi** (AI opponents) and **3 / 5 / 7 / 10 rounds**.
Each Magi picks an element after a contemplative beat, and the Arena Orb resolves the round.

### Multiplayer — *Connected Lens*
Two or more Spectacles wearers join the same session. The host selects the round count; everyone picks privately, all at once. Truth is revealed together.

### Round flow
1. **Choose** — five glowing element cards face the picker.
2. **Lock** — your card stays revealed only to you. The other four flip face‑down.
3. **Resolve** — the Arena Orb counts rhythm, beats, and ties using the cosmic matrix.
4. **Reveal** — every chosen card returns to face, labelled with its chooser's name. Winners pulse in a heartbeat rhythm.
5. **Continue** — the next round, or the final scoreboard with a return‑to‑setup button.

---

## ✦ XR & polish layers *(actually used in this project)*

Core rules live in `AshaGameManager` + `AshaResolver`. Everything below is **additive**: wire it in the scene or leave it unwired — the round still resolves.

| Script | What it does in practice |
|---|---|
| `AshaXrCoordinator` | Listens to phase / triggers and fans out to other XR scripts (host + client safe via polling where needed). |
| `AshaWorldPlacement` | Optional **World Query** hit‑test flow: user taps **Place Arena**, then pinch‑release to commit; arena can stay at scene default or move to a surface; **local‑only** or **synced** placement (inspector toggle). |
| `AshaAudio` | `AudioComponent` one‑shots for reveal / pick / hover when tracks are assigned. |
| `AshaOrbVfx` | Element‑tinted orb burst on reveal (wired from coordinator). |
| `AshaVfx` | Enables/disables **SceneObject** prefabs for short selection + reveal bursts (`selectionFxDurationSec` defaults to 3s for local pick feedback). |
| `AshaElementTrail` | After a pick, clones a **trail template** `SceneObject` per element and parents it to a **dominant hand** anchor — simple follow‑transform, no custom shader in code. |
| `AshaHandAura` | Hover feedback while cards are interactable (SIK `Interactable` hover). |
| `AshaXrPickFeedback` | Extra local feedback on pick (wired from XR layer, not core rules). |
| `AshaArenaOrb` | Orb text / child mesh visibility around phases and choices. |
| `AshaHandTrailVfx` | **Scaffold only** — helper for optional GPU particle trails on hand trackers; not part of the default shipped gameplay loop unless you wire templates in Lens Studio. |
| `AshaPrivateCardVisuals` | **Deprecated no‑op** — card faces / backs / flip / reveal are owned by `ElementHandPanel` only (kept so old scenes do not break). |

**Not used in ASHA today:** Bitmoji, `GestureModule` (SIK handles pinch / interactables), Snap Cloud ladders, voice ML, or custom shaders beyond whatever you put inside assigned prefabs / materials in the scene.

---

## ✦ Architecture

```
ColocatedWorld
└── EnableOnReady
    ├── ASHA_GameManager       ← single SyncEntity, all shared state lives here
    ├── ASHA_HandPanel         ← 5 element buttons + face / back / labels per card
    ├── ASHA_SoloSetup         ← AI count + rounds picker (host‑only in MP)
    ├── ASHA_UI                ← Title / Round / Status / Battle Log / Next Round
    ├── ASHA_Scoreboard        ← per‑slot name + score (optional)
    ├── ASHA_ArenaOrb          ← central orb visuals
    ├── ASHA_AudioLayer        ← spatial audio sources
    ├── ASHA_Vfx               ← selection / reveal bursts
    └── ASHA_XR                ← XrCoordinator + WorldPlacement + Aura + Trails
```

State is held in **one shared `SyncEntity`** on `AshaGameManager`, mirroring the Tic‑Tac‑Toe sync pattern from the official Spectacles samples:

- `phaseProp` — `waiting | solo_setup | mp_setup | choosing | resolving | reveal | game_over`
- `roundProp`, `totalRdsProp`, `humanCountProp`, `aiCountProp`
- `nProps[6]`, `cProps[6]`, `sProps[6]` — flat slot arrays for **n**ame / **c**hoice / **s**core
- `revealTrig`, `goTrig`, `advReq` — host‑authored triggers
- `roundLogProp` — synced battle log so every device shows identical results

This avoids per‑player `SyncEntity` complexity entirely — late joiners hydrate from one shared blob.

---

## ✦ Tech stack *(what this repo actually calls)*

- **[Lens Studio](https://ar.snap.com/lens-studio) 5.15+** — project + TypeScript components
- **[Spectacles](https://www.spectacles.com/) (2024)** — primary target hardware
- **[Spectacles Interaction Kit](https://developers.snap.com/spectacles/about-spectacles-features/spectacles-interaction-kit/getting-started) 0.15** — `PinchButton`, `Interactable`, hover callbacks for cards and UI
- **[Spectacles Sync Kit](https://developers.snap.com/spectacles/about-spectacles-frameworks/spectacles-sync-kit) 1.3** — `SyncEntity`, `StorageProperty`, `SessionController`, colocated session flow
- **[World Query / HitTestSession](https://developers.snap.com/spectacles/about-spectacles-features/apis/world-query)** — optional arena placement (`AshaWorldPlacement`); semantic classification is optional and guarded because it needs **Experimental APIs** in project settings
- **Built‑in Lens Studio** — `AudioComponent`, `Text`, `SceneObject` enable/disable, `DelayedCallbackEvent`, `UpdateEvent`, `Transform` lerps for card flip / winner pulse

You can still drop **GPU particle templates** or richer VFX under the assigned prefabs in the scene — the scripts only toggle objects and positions; they do not author particle graphs in TypeScript.

---

## ✦ Getting started *(Spectacles team)*

### Prerequisites
- macOS or Windows
- **[Lens Studio](https://ar.snap.com/lens-studio) 5.15** or newer
- **[Spectacles](https://www.spectacles.com/)** hardware + paired account for on‑device validation

### Open the project
Clone from your **internal** remote (or the team‑approved GitHub mirror if one exists), then open `Asha.esproj` in Lens Studio.

The repo ships with required packages (SIK, Sync Kit) under `Packages/` so the project opens self‑contained after clone.

### Run in the Editor
1. Open `Asha.esproj` in **Lens Studio**.
2. Use the dual **Preview** windows to simulate **two connected Spectacles** at once.
3. In Preview 1 press **Solo** for a single‑player Magi match, or **Multiplayer** in both previews to test the connected lens.

### Push to Spectacles
1. Pair your Spectacles via Lens Studio.
2. **Send to Device** from the toolbar.
3. Launch the lens on Spectacles and pinch the **Solo** or **Multiplayer** button.

### Project Layout
```
Assets/
└── ASHA/
    ├── Scripts/
    │   ├── AshaGameManager.ts        ← core game state + sync
    │   ├── ElementHandPanel.ts       ← 5 element buttons, flip + reveal
    │   ├── AshaSoloSetupPanel.ts     ← AI count + rounds picker
    │   ├── AshaResolver.ts           ← pure resolution logic
    │   ├── AshaConstants.ts          ← element matrix + verbs
    │   ├── AshaScoreboardUI.ts
    │   ├── AshaArenaOrb.ts
    │   ├── AshaVfx.ts
    │   ├── AshaAiBots.ts
    │   ├── AshaHandTooltip.ts
    │   └── XR/                       ← additive Spectacles enhancement layers
    │       ├── AshaXrCoordinator.ts
    │       ├── AshaWorldPlacement.ts
    │       ├── AshaOrbVfx.ts
    │       ├── AshaAudio.ts
    │       ├── AshaElementTrail.ts
    │       ├── AshaHandAura.ts
    │       ├── AshaHandTrailVfx.ts
    │       ├── AshaXrPickFeedback.ts
    │       └── AshaPrivateCardVisuals.ts (deprecated, no‑op)
    └── SCENE_SETUP.md                ← full inspector wiring guide
```

---

## ✦ Design Principles

1. **Additive only.** No XR enhancement is allowed to mutate core game logic; failures degrade gracefully.
2. **One source of truth.** A single shared `SyncEntity` holds all replicated state — no per‑player entities, no race conditions.
3. **Phase‑driven UI.** Every visual layer reads `phaseProp` and renders the correct state, instead of being told.
4. **Local + Connected first.** Solo and multiplayer share the same code path; bots are just non‑human slots.
5. **Beauty over decoration.** Every glow, pulse, and cue should serve clarity and drama in the round — not noise.

---

## ✦ Pain points *(building connected ritual AR is hard)*

- **Two owners, one mesh.** When two scripts toggled the same face/back objects (`AshaPrivateCardVisuals` vs `ElementHandPanel`), reveal frames fought every `UpdateEvent` — labels looked right while quads went blank. **Lesson:** one script owns each visual channel; deprecate the rest loudly.
- **Host writes ≠ remote callbacks.** Storage triggers incremented on the host do not always fire `onRemoteChange` locally — polling `revealTrig` / `goTrig` from `AshaXrCoordinator` keeps SFX and orb VFX consistent for everyone.
- **Phase edges are sharp.** Entering `reveal` a frame before all `cProps` settle produced “unresolved choice” guards and empty battle logs on clients — explicit validation + synced `roundLogProp` from the host fixed the worst of it.
- **World Query is a product decision.** Hit‑testing is powerful but easy to trigger by accident; button‑gated placement (`Place Arena`) + optional sync keeps sessions from “teleporting” the table without intent.
- **Inspector surface area.** Five elements × faces × backs × labels × buttons × XR hooks is a lot of wiring — `SCENE_SETUP.md` is mandatory documentation, not optional reading.
- **Preview ≠ Spectacles.** Dual Preview simulates sync well; hand comfort, brightness, and world mesh still deserve on‑device passes before you call a build “done.”

---

## ✦ Future update ideas *(none of these are promised — pick what resonates)*

**Identity & social**
- **Bitmoji or 3D busts per slot** — *maybe.* Today names come from `UserInfo.displayName` + **Magi N** for bots; avatars would read instantly in MP but add asset weight, sync questions, and privacy review. Worth a design spike, not a commitment.

**Combat theatre (no new rules — pure spectacle)**  
Keep the same 5×5 matrix; add a **“strike pass”** only after reveal resolves:
- **Winner’s gauntlet** — for ~1–2s, the winning element’s colour runs along the **dominant‑hand mesh** (ribbon, mesh trail, or GPU ribbon) as a “seal of Asha” — like a lightsaber ignition beat, not damage.
- **Losing elements flicker out** — non‑winning chosen cards get a quick ember‑dissolve or wind‑shear shader on the **back** only, so faces stay readable for the log.
- **Final‑round crescendo** — on `round === totalRounds`, orb shader + audio stinger intensify once (no slower gameplay, just one unmistakable ritual moment).

**Hands as instruments**
- Finish **`AshaHandTrailVfx`** with real GPU templates: **rainbow** while everyone is still choosing → **solid element colour** after you lock → **hidden** at reveal for non‑locals (already sketched in code comments).
- **Two‑hand chord** (wild idea): optional house rule where holding two different element anchors boosts a tie into a “harmony” mini‑animation — would need explicit UX + host toggle.

**Session & persistence**
- **Remember the table** — optional spatial anchor for arena root between launches (same room, next day).
- **Spectator join** — phone or third Spectacles as read‑only orb + log (no `submitChoice` path).

**Leaderboards** *(called out — we do not have this yet)*
- **Session podium** — end‑of‑match board: best delta, most wins, ties broken cleanly (local + synced summary object).
- **Persistent ladder** — weekly / all‑time rankings via **Lens Cloud** or edge functions, keyed by `displayName` or internal id (privacy + abuse review required).
- **Solo Magi hall of fame** — best run streak vs N Magi at each difficulty preset.

**Audio & voice**
- **Stinger mix per element** — subtle leitmotif on pick + different resolve chord on draw vs win (still one `AudioComponent`, smarter playlists).
- **Voice cue toggle** — optional one‑shot line per element on pick (localization + consent heavy; behind a setting).

**Meta**
- **Seasons / events** — time‑boxed leaderboards or cosmetic orb skins (only if product wants live ops; large scope).

---

## ✦ Credits

- Concept, design, and dev: [@urbanpeppermint](https://github.com/urbanpeppermint)
- Creative inspo: *Jashan of Asha Vahishta* / fire‑and‑order imagery (naming & tone only).
- Platform: **Snap Spectacles**, **Lens Studio**, **Spectacles Interaction Kit**, **Spectacles Sync Kit**

---

## ✦ Use of this repository

**Proprietary / internal.** This codebase is maintained for **Spectacles team** workflows (review, QA, handoff). It is **not** offered as open source; copying, redistribution, or derivative public lenses are **not** permitted except under Snap’s internal policies and explicit approvals.

---

<div align="center">

✦

</div>
