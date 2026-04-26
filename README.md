<div align="center">

# ✦ ASHA ✦

### *A Spectacles AR ritual of Truth, Fire, and Sacred Order.*

**Inspired by the *Jashan of Asha Vahishta* — the radiant Amesha Spenta of Truth, Purity, Divine Order, and the sacred rhythm of well-being that holds creation together.**

[![Lens Studio](https://img.shields.io/badge/Lens%20Studio-5.15-FFFC00?logo=snapchat&logoColor=black)](https://ar.snap.com/lens-studio)
[![Spectacles](https://img.shields.io/badge/Spectacles-2024-000?logo=snapchat&logoColor=white)](https://www.spectacles.com/)
[![SIK](https://img.shields.io/badge/SpectaclesInteractionKit-0.15-7A5FFF)](https://developers.snap.com/spectacles/about-spectacles-features/spectacles-interaction-kit/getting-started)
[![SyncKit](https://img.shields.io/badge/Spectacles%20Sync%20Kit-1.3-3DDBD9)](https://developers.snap.com/spectacles/about-spectacles-frameworks/spectacles-sync-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-MIT-success)](#license)

</div>

---

## ✦ The Vision

> Asha is not merely *truth* in the simple sense.
> It is the divine force of **rightness, harmony, justice, and order** —
> the holy pattern that binds all things together and gives the world its meaning, balance, and life.
> It is the rhythm by which creation flourishes.
>
> Asha Vahishta is bound to **Atar**, the sacred fire, because fire reveals, purifies, illuminates, and makes visible what is holy.

**ASHA** is a connected‑lens AR game for **Snap Spectacles** that draws its symbols and language from Zoroastrian cosmology. Players gather around a shared luminous **Arena Orb**, summon one of the five primal elements, and let the matrix of cosmic order resolve who carried the truer rhythm that round.

> *On this blessed day, may we align ourselves more deeply with Asha through good thoughts, good words, and good deeds — and choose truth, purity, and divine order over falsehood and chaos.*

---

## ✦ The Five Elements

| # | Name | Element | Glyph | Beats | Loses |
|---|------|---------|:---:|:---:|:---:|
| 0 | **ATAR** — सacred Fire | Fire | 🔥 | ZAM, VAYU | ABAN, KHSHATHRA |
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

## ✦ XR Layers

ASHA's core game logic is platform‑agnostic. Layered on top is a stack of strictly **additive XR enhancements** designed for Spectacles' display, audio, and hand tracking:

| Layer | What it does |
|---|---|
| `AshaArenaOrb` | The luminous central orb that pulses with each round |
| `AshaWorldPlacement` | Optional surface re‑placement ("Place Arena") with shared or local‑only sync |
| `AshaXrCoordinator` | Bridges core game state with XR layers without modifying core logic |
| `AshaAudio` | Spatial reveal / pick / win cues |
| `AshaOrbVfx` | Element‑coloured reveal burst from the orb |
| `AshaElementTrail` | Per‑pick element trail from hand → orb |
| `AshaHandAura` | Hover glow over each card while choosing |
| `AshaHandTrailVfx` | Optional hand particle trail tinted by chosen element / multi‑colour pre‑reveal |
| `AshaPrivateCardVisuals` | *(deprecated — `ElementHandPanel` now owns all card visuals)* |

The principle: the game is fully playable without any XR layer. Each layer can be toggled or unwired and the experience still resolves correctly.

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

## ✦ Tech Stack

- **[Lens Studio](https://ar.snap.com/lens-studio) 5.15+** — authoring environment
- **[Spectacles](https://www.spectacles.com/) (2024)** — target device
- **[Spectacles Interaction Kit](https://developers.snap.com/spectacles/about-spectacles-features/spectacles-interaction-kit/getting-started) 0.15** — `PinchButton`, `Interactable`, hover wiring
- **[Spectacles Sync Kit](https://developers.snap.com/spectacles/about-spectacles-frameworks/spectacles-sync-kit) 1.3** — `SyncEntity`, `StorageProperty`, `SessionController`
- **[World Query](https://developers.snap.com/spectacles/about-spectacles-features/apis/world-query)** — optional surface placement
- **[GestureModule](https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module)** — pinch / targeting events
- **[GPU Particles](https://developers.snap.com/lens-studio/features/graphics/particles/gpu-particles/gpu-particles-templates/particles)** — element trails and reveal bursts
- **TypeScript (strict)** with `BaseScriptComponent` + `@component` decorators

---

## ✦ Getting Started

### Prerequisites
- macOS or Windows
- **[Lens Studio](https://ar.snap.com/lens-studio) 5.15** or newer
- A Snap account paired with **[Spectacles](https://www.spectacles.com/)** (for on‑device testing)

### Clone & Open
```bash
git clone https://github.com/urbanpeppermint/Asha.git
cd Asha
open Asha.esproj   # macOS — or open the project from Lens Studio's launcher
```

The project ships with all required packages (SIK, Sync Kit) inside `Packages/` so it opens self‑contained.

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
5. **Beauty over decoration.** Every glow, every pulse, every audio cue serves the rhythm of Asha — not the other way around.

---

## ✦ Roadmap

- [ ] Snapchat **Bitmoji** avatars per slot (currently `displayName` text labels)
- [ ] Persistent ladder via Snap Cloud edge functions
- [ ] Voice‑activated element invocation ("Atar!", "Aban!" ...)
- [ ] Spatial audio mix tied to round momentum
- [ ] Five‑colour rainbow pre‑reveal hand trail (groundwork in `AshaHandTrailVfx`)
- [ ] On‑device persistent player nameplate

---

## ✦ Credits

- Concept, design, and dev: [@urbanpeppermint](https://github.com/urbanpeppermint)
- Cosmology & blessing: ancient Avestan tradition — *Jashan of Asha Vahishta*
- Built on **Snap's Spectacles platform**, **Lens Studio**, **Spectacles Interaction Kit**, and **Spectacles Sync Kit**

---

## ✦ License

Released under the **MIT License** — share, remix, and align it with your own rhythm.

---

<div align="center">

> *Humata · Hukhta · Hvarshta*
> **Good thoughts · Good words · Good deeds**

✦

</div>
