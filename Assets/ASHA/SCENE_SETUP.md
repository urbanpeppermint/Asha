# ASHA — Lens Studio Scene Setup (Final, Simplified)

## Architecture

ONE shared `SyncEntity` lives on the `AshaGameManager` object.
It holds ALL game state: phase, round, humanCount, aiCount, `advReq`, `mpHostRoundsPick` (MP host round mirror), and a flat
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
    │   └── BeginBtn             ← PinchButton  (triggerUp → confirmAndStart; label e.g. “Confirm” in MP for host)
    │
    ├── ASHA_UI
    │   ├── TitleLabel           ← Text component (shows "ASHA")
    │   ├── RoundLabel           ← Text component (shows "Round X of Y")
    │   ├── StatusLabel          ← Text component (shows hints/awaiting)
    │   ├── BattleLogLabel       ← Text component (battle log / final standings)
    │   └── NextRoundBtn         ← PinchButton
    │       └── ButtonLabel      ← Text child (e.g. NEXT ROUND / BACK TO SETUP on last reveal)
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
| startMenuRoot     | (Optional) Drag the Sync Kit **StartMenu** scene object if auto-find fails — used to **hide** it during in-lens setup so it cannot stay stuck on one device. |
| backToMenuButton  | (Optional) PinchButton — host only — same reset as final **BACK TO SETUP** (round setup inside the lens). |
| editorDisplayNameOverride | (Optional) String — in **Connected Preview**, Sync Kit often reports `displayName` as **Preview 0**. Set a name here to test scoreboard labels in Lens Studio; leave **empty** on device for real Snapchat `UserInfo`. |

**No SyncEntity component needs to be added manually** — the script creates
its own SyncEntity in code with `new SyncEntity(this, ...)`.

### Player identity (`n0`…`n5` synced “names”)

- Each device picks a label with **`resolveLocalSlotDisplayName`**: prefers the first non-placeholder string among `UserInfo` fields (`displayName`, `username`, `snapchatUsername`, etc.), merges **`getUsers()`** entry matching **`getLocalConnectionId()`** when available, skips strings that look like **Lens Preview** (`Preview 0`, …), then falls back to **`getLocalUserId()`** / connection id / `"Player"`.
- Use **`editorDisplayNameOverride`** on `AshaGameManager` when Connected Preview still shows **Preview N** and you want a readable name in the editor.
- On a **real Snapchat build**, leave the override empty; `displayName` / `username` should reflect the signed-in account when the platform provides them.
- AI opponents use **`Magi 1`**, **`Magi 2`**, … in slot strings.
- Official reference: [Spectacles Sync Kit — User information](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit/features/user-information).

### Spectacles Start Menu vs in-lens round setup

- The **Spectacles** Solo / Multi **Start Menu** is only for the **initial** session choice from the framework.
- After a match (or host **Back to menu**), the lens **does not** re-open that Start Menu for everyone. The host routes to **`solo_setup`** or **`mp_setup`**, and **`AshaGameManager` hides the Start Menu** whenever those phases run.
- **Multiplayer rounds:** **only the host** taps **3 / 5 / 7 / 10**. The host’s choice is synced as **`mpHostRoundsPick`** so other players **see** the same count. **Only the host** taps **Confirm** (`confirmAndStart`) to start the match — that is the confirmation for the setup the host requested.

### Start Menu auto-discovery

If `startMenuRoot` is empty, `AshaGameManager` looks for  
`HiddenFromSceneView` → `EnableOnAwake` → `StartMenu` (typical Sync Kit layout),  
or any scene object named `StartMenu`.

### ElementHandPanel (on `ASHA_HandPanel`)

| Field             | Drag from scene                |
|-------------------|--------------------------------|
| gameManager       | → ASHA_GameManager             |
| buttonObjects     | → [AtarBtn, AbanBtn, ZamBtn, VayuBtn, KshathraBtn] |
| cardFaceObjects   | → [AtarFace, AbanFace, ZamFace, VayuFace, KshathraFace] (optional local PNG face visuals) |
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

### NextRoundBtn (Next / “Back to menu”)

Wire `triggerUpCallbacks`:
- **Target:** ASHA_GameManager object
- **Function:** `advanceToNextRound`

Behavior:
- **Mid-match (`reveal`, not last round):** advances to the next round (`choosing`). Any player can press Next; non-hosts bump a synced `advReq` so the **host** runs the same advance logic.
- **Last round (`reveal`, round == total rounds):** label **BACK TO SETUP** (not the setup **Confirm** button). One press: **final standings** + **per-device** status, then the host moves everyone to **`solo_setup`** / **`mp_setup`**. **Confirm** on the setup panel is only for locking **AI + rounds** (solo) or **rounds** (host, MP). No separate `gameover` phase.

---

## Game Flow (matches HTML preview)

### Solo (1 preview window)
1. StartMenu → Solo → session connects → EnableOnReady activates
2. Host gets slot 0 (from `getUsers().length - 1 = 0`)
3. Host waits 1.0s. No other users arrive → `solo_setup` phase
4. SoloSetupPanel appears. Player picks AI count + rounds, taps **Confirm**
5. AI fills slots 1..N (after human slot 0). Phase → `choosing`
6. Player picks an element → AI auto-picks → all chosen
7. → `resolving` (1.2s delay), then `reveal` with battle log
8. Tap **Next** → next round, or on the **final** reveal tap **BACK TO SETUP** → end standings + **`solo_setup`**

### Multiplayer (2+ preview windows)
1. StartMenu → Multiplayer → both connect to same session
2. Preview 1 (host) gets slot 0; host sets `humanCount` from session users
3. After a short wait, host runs `hostDecide()` → **`mp_setup`** (rounds picker), not straight into `choosing`
4. **Host** picks rounds, then taps **Confirm** → phase → `choosing` (non-host round pills and Confirm are disabled)
5. Preview 2 gets slot 1 (from `getUsers().length - 1 = 1`)
6. Both see ElementHandPanel, each picks an element
7. Host checks all human slots chosen → resolve → reveal → Next for further rounds
8. On **final** round, **BACK TO SETUP** → per-device status + **`mp_setup`** (host picks rounds again, then **Confirm**)
9. No AI involved in pure multiplayer (`aiCount = 0`)

### Late joiner during solo_setup
If Preview 2 connects while host is in `solo_setup`:
- Host clears any AI names already written
- Host sets aiCount = 0, switches to **`mp_setup`** (multiplayer)

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

## XR Enhancements (Additive)

These layers are additive and do not replace core game flow.

### New XR Scene Objects

Add these under `EnableOnReady`:

- `WorldPlacement` → `AshaWorldPlacement.ts`
- `AshaAudio` → `AshaAudio.ts`
- `ElementTrail` → `AshaElementTrail.ts`
- `OrbVfx` (usually under `ArenaOrb`) → `AshaOrbVfx.ts`
- `HandAura` → `AshaHandAura.ts`
- `XrCoordinator` → `AshaXrCoordinator.ts`
- `XrPickFeedback` → `AshaXrPickFeedback.ts`

### XR Hierarchy Example

```
EnableOnReady
├── WorldPlacement            ← AshaWorldPlacement
├── AshaAudio                 ← AshaAudio
├── ElementTrail              ← AshaElementTrail
├── XrCoordinator             ← AshaXrCoordinator
├── XrPickFeedback            ← AshaXrPickFeedback
├── PrivateCardVisuals        ← AshaPrivateCardVisuals
├── ASHA_HandPanel            ← existing ElementHandPanel + buttons
└── ASHA_ArenaOrb
    └── OrbVfx                ← AshaOrbVfx
```

### XR Inspector Wiring

#### AshaWorldPlacement

| Field            | Drag from scene |
|------------------|-----------------|
| `arenaRoot`      | `Arena` root object |
| `hideArenaUntilPlaced` | true (recommended; matches sample behavior) |
| `fallbackDistance` | 80 (default cm) |
| `filterEnabled` | true (recommended) |
| `useSemanticClassification` | false by default; set true only if Experimental APIs are enabled |
| `allowFallbackWithoutHit` | **false** to force real surface hit before cards |
| `fallbackDelaySec` | 3.0 (used only when fallback is enabled) |
| `defaultScale` | initial arena scale (shared across users) |
| `scaleStep` | amount used by `scaleUp/scaleDown` |
| `placementIndicatorRoot` | optional reticle/marker SceneObject shown while waiting for placement |
| `placementHintText` | optional world Text object shown while waiting |
| `pendingHint` | message shown in `placementHintText` while placement is pending |

`AshaWorldPlacement` exposes `isPlaced()` and is used by `AshaXrCoordinator` to gate card input.
If you do not wire `placementIndicatorRoot`/`placementHintText`, no visual cue will appear (script logs one warning).

Placement interaction now matches sample style:
- live hit cursor follows valid surface hits
- releasing pinch/trigger commits placement
- committed placement is synced to all devices (same position/rotation/scale)

Optional control buttons can call:
- `enablePlacementMode()` (start re-placement mode)
- `confirmCurrentHitPlacement()` (manual confirm)
- `scaleUp()` / `scaleDown()` (shared scale)

#### AshaAudio

| Field | Drag from scene / assets |
|------|----------------------------|
| `elementSounds[0..4]` | `atar_fire`, `aban_water`, `zam_earth`, `vayu_wind`, `khshathra_metal` |
| `revealSound` | `reveal_gong` |
| `winSound` | `win_fanfare` |
| `loseSound` | `lose_descent` |
| `hoverSound` | `hover_tick` |
| `orbAudioComponent` | AudioComponent on `ArenaOrb` |
| `opponentAudioSources` | Optional AI/opponent 3D sources |

`ArenaOrb` audio settings: Spatial Audio ON, logarithmic rolloff, max distance around 300 cm.

#### AshaElementTrail

| Field | Drag from scene |
|------|------------------|
| `trailTemplates[0..4]` | five disabled trail/VFX objects (ATAR..KHSHATHRA order) |
| `dominantHand` | right-hand anchor/joint from SIK hierarchy |

#### AshaOrbVfx

| Field | Drag from scene |
|------|------------------|
| `orbMeshVisual` | `RenderMeshVisual` on `ArenaOrb` |
| `orbTransform` | `ArenaOrb` SceneObject |
| `elementVfx[0..4]` | 5 disabled reveal VFX objects in element order |
| `neutralColor` | keep default or match orb material baseline |

#### AshaHandAura

| Field | Drag from scene |
|------|------------------|
| `auraSphere` | glow sphere attached to dominant hand tip |
| `auraMaterial` | `RenderMeshVisual` on `auraSphere` |
| `buttonObjects[0..4]` | `AtarBtn`, `AbanBtn`, `ZamBtn`, `VayuBtn`, `KshathraBtn` |
| `ashaAudio` | Drag the **Script Component** from `AshaAudio` object (optional for hover tick) |

#### AshaXrCoordinator

| Field | Drag from scene |
|------|------------------|
| `gameManager` | `ASHA_GameManager` |
| `ashaAudio` | **Script Component** on `AshaAudio` object |
| `orbVfx` | **Script Component** on `OrbVfx` object |
| `elementTrail` | **Script Component** on `ElementTrail` object |
| `handAura` | **Script Component** on `HandAura` object |
| `worldPlacement` | **Script Component** on `WorldPlacement` object |
| `cardsMenuRoot` | hand cards root (`ASHA_HandPanel/buttonParent`) |
| `handPanelScript` | **Script Component** on `ASHA_HandPanel` (`ElementHandPanel`) |

What it drives:
- resets trail/aura when phase returns to `choosing`
- reveal gong + orb reveal VFX
- per-round local win/lose stingers
- opponent reveal sounds from `opponentAudioSources`
- **cards gate:** in `choosing`, keeps cards hidden until `worldPlacement.isPlaced()` is true
- gate is enforced both on `cardsMenuRoot.enabled` and `handPanelScript.setEnabled(...)` so GameManager cannot re-show cards early
- if `worldPlacement` is not wired, choosing remains blocked (fail-safe)

#### AshaXrPickFeedback

| Field | Drag from scene |
|------|------------------|
| `ashaAudio` | **Script Component** on `AshaAudio` |
| `elementTrail` | **Script Component** on `ElementTrail` |

If Inspector shows `Unknown type`, clear the slot and drag the **script component row** (not the parent object).

### Button Callback Additions (No core script edits required)

Keep existing `ElementHandPanel.pick...` callbacks. Add one extra callback per button:

- `AtarBtn` add `XrPickFeedback.feedbackAtar`
- `AbanBtn` add `XrPickFeedback.feedbackAban`
- `ZamBtn` add `XrPickFeedback.feedbackZam`
- `VayuBtn` add `XrPickFeedback.feedbackVayu`
- `KshathraBtn` add `XrPickFeedback.feedbackKhshathra`

This gives local pick sound + local hand trail without touching `ElementHandPanel.ts`.

#### AshaPrivateCardVisuals

| Field | Drag from scene |
|------|------------------|
| `gameManager` | `ASHA_GameManager` |
| `localFaceObjects[0..4]` | local card face objects attached to element buttons (ATAR..KHSHATHRA order) |
| `opponentBackObjects` | floating back-of-card objects (one per visible opponent slot) |
| `backAnchors` | optional anchor objects for each opponent back |
| `hideWhenAllChosen` | true (recommended) |
| `keepLocalFaceAfterChoice` | true (recommended; keep face shown until all players are ready) |
| `floatAmplitudeCm` / `floatSpeedHz` | tune back-card floating animation |

Behavior:
- in `choosing`, local faces are visible only to local user (and can stay visible after local pick)
- unresolved non-local slots show only card backs (floating animation)
- after all slots submit choices, both faces and back animations hide

### XR Verification Order

1. World placement: look at table/floor for 1 second; arena should place from World Query hit, else fallback.
2. During placement, card menu should stay hidden/disabled (no element picks yet).
3. After placement succeeds/fallback completes, cards appear and can be selected.
4. Pick element in solo: hear element pick sound (from `AshaAudio`).
5. Hover cards: aura sphere lights + optional tick.
6. Reveal: orb tint/pulse + reveal burst + gong.
7. Next round: trail/aura reset on `choosing`.
8. Final reveal: result stinger + return to setup still works as before.

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
| XR/AshaWorldPlacement.ts | Surface/fallback arena placement |
| XR/AshaAudio.ts          | Element/reveal/result/hover audio |
| XR/AshaElementTrail.ts   | Local trail follow after pick |
| XR/AshaOrbVfx.ts         | Orb reveal pulse/tint/element burst |
| XR/AshaHandAura.ts       | Hover glow near hand |
| XR/AshaXrCoordinator.ts  | Non-invasive XR event orchestration |
| XR/AshaXrPickFeedback.ts | Extra per-button feedback callbacks |
| XR/AshaPrivateCardVisuals.ts | Local card faces + opponent back-only visuals |
