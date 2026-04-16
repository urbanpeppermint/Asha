# ASHA — Lens Studio Scene Setup (Final, Simplified)

## Architecture

ONE shared `SyncEntity` lives on the `AshaGameManager` object.
It holds ALL game state: phase, round, humanCount, aiCount, and a flat
array of 6 player slots (choice, score, name per slot). No per-player
SyncEntities. Follows the Tic Tac Toe sample pattern.

- **Slot assignment:** Each device gets `mySlot = getUsers().length - 1`
  at `onReady` time (same as Tic Tac Toe's player assignment).
- **Solo:** Host = slot 0. AI fills slots 1..N (after human slots).
- **Multiplayer:** Host = slot 0, second player = slot 1, etc.
  AI slots NEVER overlap with human slots.

You only need **1 ElementHandPanel** and **1 AshaGameManager** in the scene.
No `AshaPlayerState` objects — that file is deleted.

---

## Scene Hierarchy

```
ColocatedWorld
└── EnableOnReady
    ├── ASHA_GameManager         ← AshaGameManager.ts script component
    │                               + SyncEntity auto-created by script (no manual SyncEntity needed)
    ├── ASHA_HandPanel           ← ElementHandPanel.ts script component
    │   ├── AtarBtn              ← PinchButton  (triggerUpCallbacks → ElementHandPanel.pickAtar)
    │   ├── AbanBtn              ← PinchButton  (triggerUpCallbacks → ElementHandPanel.pickAban)
    │   ├── ZamBtn               ← PinchButton  (triggerUpCallbacks → ElementHandPanel.pickZam)
    │   ├── VayuBtn              ← PinchButton  (triggerUpCallbacks → ElementHandPanel.pickVayu)
    │   └── KshathraBtn          ← PinchButton  (triggerUpCallbacks → ElementHandPanel.pickKhshathra)
    │
    ├── ASHA_SoloSetup           ← AshaSoloSetupPanel.ts script component
    │   ├── Ai1Btn..Ai5Btn       ← PinchButton  (triggerUp → pickAi1..pickAi5)
    │   ├── Rds3Btn..Rds10Btn    ← PinchButton  (triggerUp → pickRounds3..pickRounds10)
    │   └── BeginBtn             ← PinchButton  (triggerUp → confirmAndStart)
    │
    ├── ASHA_UI
    │   ├── TitleLabel           ← Text component (shows "ASHA")
    │   ├── RoundLabel           ← Text component (shows "Round X of Y")
    │   ├── StatusLabel          ← Text component (shows hints/awaiting)
    │   ├── BattleLogLabel       ← Text component (battle log / final standings)
    │   └── NextRoundBtn         ← PinchButton
    │       └── ButtonLabel      ← Text component child (shows "NEXT ROUND" / "PLAY AGAIN")
    │
    ├── ASHA_Scoreboard          ← (Optional) AshaScoreboardUI.ts
    │   ├── Slot0_Name           ← Text
    │   ├── Slot0_Score          ← Text
    │   ├── Slot0_State          ← Text
    │   ├── Slot1_Name / Score / State
    │   └── Slot2_Name / Score / State  (up to 6 slots)
    │
    ├── ASHA_Tooltip             ← (Optional) AshaHandTooltip.ts
    ├── ASHA_ArenaOrb            ← (Optional) AshaArenaOrb.ts
    └── ASHA_VFX                 ← (Optional) AshaVfx.ts
```

---

## Inspector Wiring

### AshaGameManager (on `ASHA_GameManager`)

| Field             | Drag from scene                |
|-------------------|--------------------------------|
| nextRoundButton   | → ASHA_UI / NextRoundBtn       |
| battleLogText     | → ASHA_UI / BattleLogLabel     |
| titleText         | → ASHA_UI / TitleLabel         |
| roundText         | → ASHA_UI / RoundLabel         |
| statusText        | → ASHA_UI / StatusLabel        |
| revealDelaySec    | 1.2 (default)                  |

**No SyncEntity component needs to be added manually** — the script creates
its own SyncEntity in code with `new SyncEntity(this, ...)`.

### ElementHandPanel (on `ASHA_HandPanel`)

| Field             | Drag from scene                |
|-------------------|--------------------------------|
| gameManager       | → ASHA_GameManager             |
| buttonObjects     | → [AtarBtn, AbanBtn, ZamBtn, VayuBtn, KshathraBtn] |
| buttonParent      | → ASHA_HandPanel (itself)      |
| arenaOrbScript    | → (optional) ASHA_ArenaOrb's script component |
| vfxScript         | → (optional) ASHA_VFX's script component |
| tooltipScript     | → (optional) ASHA_Tooltip's script component |

### AshaSoloSetupPanel (on `ASHA_SoloSetup`)

| Field         | Drag from scene            |
|---------------|----------------------------|
| gameManager   | → ASHA_GameManager         |
| panelRoot     | → ASHA_SoloSetup (itself)  |

### AshaScoreboardUI (on `ASHA_Scoreboard`)

| Field         | Drag from scene                     |
|---------------|-------------------------------------|
| gameManager   | → ASHA_GameManager                  |
| nameTexts     | → [Slot0_Name, Slot1_Name, ...]     |
| scoreTexts    | → [Slot0_Score, Slot1_Score, ...]    |
| stateTexts    | → [Slot0_State, Slot1_State, ...]    |

### NextRoundBtn

Wire `triggerUpCallbacks`:
- **Target:** ASHA_GameManager object
- **Function:** `advanceToNextRound`

---

## Game Flow (matches HTML preview)

### Solo (1 preview window)
1. StartMenu → Solo → session connects → EnableOnReady activates
2. Host gets slot 0 (from `getUsers().length - 1 = 0`)
3. Host waits 1.0s. No other users arrive → `solo_setup` phase
4. SoloSetupPanel appears. Player picks AI count + rounds, taps Begin
5. AI fills slots 1..N (after human slot 0). Phase → `choosing`
6. Player picks an element → AI auto-picks → all chosen
7. → `resolving` (1.2s delay), then `reveal` with battle log
8. Tap Next → next round or game over
9. Tap Play Again → back to `solo_setup`

### Multiplayer (2+ preview windows)
1. StartMenu → Multiplayer → both connect to same session
2. Preview 1 (host) gets slot 0. Phase stays `waiting`
3. Preview 2 connects → `onUserJoinedSession` fires on host
4. Host updates humanCount to 2, skips solo, phase → `choosing`
5. Preview 2 gets slot 1 (from `getUsers().length - 1 = 1`)
6. Both see ElementHandPanel, each picks an element
7. Host checks all human slots chosen → resolve → reveal → next round
8. No AI involved in pure multiplayer (aiCount = 0)

### Late joiner during solo_setup
If Preview 2 connects while host is in `solo_setup`:
- Host clears any AI names already written
- Host sets aiCount = 0, switches to `choosing` (multiplayer)

---

## Key Differences from Old Setup

| Old (broken)                    | New (working)                      |
|---------------------------------|------------------------------------|
| N AshaPlayerState objects       | ZERO AshaPlayerState — deleted     |
| Per-player SyncEntities         | ONE SyncEntity on GameManager      |
| Seat ownership / claiming       | Flat slot index (host=0, join=1+)  |
| ElementHandPanel → PlayerState  | ElementHandPanel → GameManager     |
| ScoreboardUI → PlayerState      | ScoreboardUI → GameManager         |

---

## Files

| File                    | Purpose                         |
|-------------------------|---------------------------------|
| AshaConstants.ts        | Element data + MATRIX           |
| AshaResolver.ts         | Pure resolution logic           |
| AshaAiBots.ts           | AI name/emoji lists             |
| AshaGameManager.ts      | ALL game state + sync + phases  |
| ElementHandPanel.ts     | 5-button hand → calls manager   |
| AshaSoloSetupPanel.ts   | Solo config UI                  |
| AshaScoreboardUI.ts     | Per-slot name/score display     |
| AshaHandTooltip.ts      | Element info on hover           |
| AshaArenaOrb.ts         | Center orb visual               |
| AshaVfx.ts              | Selection/reveal VFX            |
