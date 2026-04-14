# ASHA — Scripts, scene hierarchy, and setup (Spectacles Sync Kit)

This guide matches **Lens Studio 5.15** + **Spectacles Sync Kit** sample layout. ASHA lives **only** under `ColocatedWorld > EnableOnReady` (Rule 2).

---

## 1. Scripts you must have (`Assets/ASHA/Scripts/`)

| Script | Role |
|--------|------|
| `AshaConstants.ts` | Element table + `MATRIX` (do not edit per design lock). |
| `AshaResolver.ts` | `resolveRound`, `getVerb`, `getWinnerIndices`. |
| `AshaAiBots.ts` | AI name/emoji lists for solo VS computer. |
| `AshaGameManager.ts` | Session-scoped phase machine, battle log, host next round, solo vs multi gate. |
| `AshaPlayerState.ts` | **Exactly one object in scene**; per-user state is synced through ownership/store, not by duplicating scene seats. |
| `ElementHandPanel.ts` | Five element buttons → `submitChoice`. |
| `AshaSoloSetupPanel.ts` | **Solo only:** AI opponent count (1–5) + rounds (3/5/7/10) + confirm. |

Do **not** edit anything inside `.lspkg` packages.

---

## 2. Modes (how the lens decides)

| Session | What happens |
|---------|----------------|
| **1 user** (Solo / Mocked Online with one preview) | Host enters phase **`solo_setup`**. Player must use **AshaSoloSetupPanel**: pick **number of AI opponents (1–5)** and **total rounds**, then **Confirm**. Then phase **`choosing`** (element hand). |
| **2+ users** (multiplayer session) | Host skips setup and goes straight to **`choosing`**. **No AI.** Keep exactly **one** `AshaPlayerState` SceneObject in hierarchy. |

The game uses `SessionController.getInstance().getUsers().length` for this split — not the number of preview windows on one machine.

---

## 3. Hierarchy (under `EnableOnReady` only)

Create or verify this structure **inside** `ColocatedWorld > EnableOnReady`:

```
EnableOnReady
├── AshaGameManager              ← SceneObject + script AshaGameManager.ts
├── AshaPlayerState              ← single shared player-state object (DO NOT duplicate)
├── AshaSoloSetupPanel           ← SceneObject + script AshaSoloSetupPanel.ts
│   ├── SoloSetup_Root           ← assign to panelRoot (container)
│   │   ├── Title_Text (optional Text3D)
│   │   ├── Label_AI (optional)
│   │   ├── AiCount_1 … AiCount_5   ← buttons → pickAi1 … pickAi5
│   │   ├── Label_Rounds (optional)
│   │   ├── Rounds_3,5,7,10         ← buttons → pickRounds3 … pickRounds10
│   │   └── ConfirmButton           → confirmAndStart
├── ElementHandPanel             ← script ElementHandPanel.ts
│   └── buttonObjects (parent)
│       ├── AtarBtn   → pickAtar
│       ├── AbanBtn   → pickAban
│       ├── ZamBtn    → pickZam
│       ├── VayuBtn   → pickVayu
│       └── KshathraBtn → pickKhshathra
├── NextButton                   ← host “next round” (starts disabled)
├── BattleLogText                ← Text component for log
├── AshaOrb                      ← optional visuals
└── AshaScoreboard               ← optional; wire later to AshaPlayerState
```

**Start Menu (Sync Kit prefab — one inspector change):**  
`SpectaclesSyncKit > … > StartMenu > SoloButton` → `singlePlayerType` = **Mocked Online (Automatic)**.

---

## 4. Multiplayer seat setup (human players)

- **Do not duplicate `AshaPlayerState` SceneObjects.** Duplicate seats cause exactly the repeated logs and broken score rows you reported.
- Human seats in ASHA are **logical**, not one SceneObject per person.
- Use one `AshaPlayerState` object + one `ElementHandPanel` object; Sync Kit ownership/session data handles per-user identity.
- If you need visual chairs/anchors in the arena, create separate **visual seat objects** (`Seat_A`, `Seat_B`, `Seat_C`) with transforms/meshes only; do not attach `AshaPlayerState` to those.

---

## 5. Inspector wiring checklist

### AshaGameManager

| Field | Assign |
|--------|--------|
| `nextRoundButton` | `EnableOnReady > NextButton` |
| `battleLogText` | `EnableOnReady > BattleLogText` |

Wire **NextButton** interaction (e.g. SIK `PinchButton` / `Interactable` **trigger** or `RectangleButton` **triggerUpCallbacks**) to **AshaGameManager** → **`advanceToNextRound`**.

### AshaPlayerState (single object)

| Field | Assign |
|--------|--------|
| `gameManager` | `EnableOnReady > AshaGameManager` |

### ElementHandPanel

| Field | Assign |
|--------|--------|
| `playerState` | The **`AshaPlayerState`** this hand controls (usually local seat). |
| `buttonParent` | Parent of the five buttons (optional). |
| `buttonObjects[0–4]` | Atar … Kshathra button roots. |

Per-button **trigger up** → `ElementHandPanel` on same object: `pickAtar`, `pickAban`, … (exact names).

### AshaSoloSetupPanel

| Field | Assign |
|--------|--------|
| `gameManager` | `EnableOnReady > AshaGameManager` |
| `panelRoot` | `SoloSetup_Root` (whole panel; script hides/shows this). |

Wire **AI count** buttons to `pickAi1` … `pickAi5`. Wire **round** buttons to `pickRounds3`, `pickRounds5`, `pickRounds7`, `pickRounds10`. Wire **Confirm** to **`confirmAndStart`**.

**Flow reminder:** Tap an AI count (1–5), choose rounds (defaults to 5 until you tap another), then **Confirm**. If you confirm without selecting AI count, the panel logs an error.

---

## 6. Phases (for debugging)

| Phase | Meaning |
|-------|---------|
| `waiting` | Initial storage default before host starts. |
| `solo_setup` | Solo session — show **AshaSoloSetupPanel**, hide element hand. |
| `choosing` | Players pick elements; hand visible. |
| `reveal` | Battle log filled; host gets Next after delay. |
| `gameover` | Final scores logged. |

---

## 7. Verification order

1. **TypeScript:** zero errors (Window → Utilities → TypeScript Status).  
2. **Solo:** Start session → **setup panel** → pick AI + rounds → confirm → **five cards** → pick → log + next round.  
3. **Multi:** Two+ users, single `AshaPlayerState` object in hierarchy → all pick → reveal → next round.

---

## 8. Reference

- [Spectacles Sync Kit overview](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit/overview)  
- Sample repo: `Spectacles-Sample` → `Spectacles Sync Kit`
