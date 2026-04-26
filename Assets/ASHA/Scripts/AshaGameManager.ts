import { SyncEntity } from 'SpectaclesSyncKit.lspkg/Core/SyncEntity'
import { StorageProperty } from 'SpectaclesSyncKit.lspkg/Core/StorageProperty'
import { StoragePropertySet } from 'SpectaclesSyncKit.lspkg/Core/StoragePropertySet'
import { SessionController } from 'SpectaclesSyncKit.lspkg/Core/SessionController'
import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { StartMenu } from 'SpectaclesSyncKit.lspkg/StartMenu/Scripts/StartMenu'
import { resolveRound, getVerb } from './AshaResolver'
import { ELEMENTS, MATRIX } from './AshaConstants'

const TAG = 'AshaGameManager'
const MAX_SLOTS = 6
const SOLO_WAIT_SEC = 1.0
const SOLO_BOT_PICK_DELAY_SEC = 1.8

function sInt(p: StorageProperty<number>, fb: number): number {
  const v = p.currentOrPendingValue ?? p.currentValue
  return (v !== null && v !== undefined) ? (v as number) : fb
}
function sStr(p: StorageProperty<string>, fb: string): string {
  const v = p.currentOrPendingValue ?? p.currentValue
  return (v !== null && v !== undefined) ? (v as string) : fb
}

/** Lens Studio Connected Preview often uses `Preview 0` as displayName — treat as placeholder. */
function isLensPreviewPlaceholder(name: string): boolean {
  const t = name.trim().toLowerCase()
  return /^preview\b/.test(t) || /^user\s*\d+$/i.test(name.trim())
}

/** Detect mock/opaque IDs so we keep searching for a human-friendly name. */
function isNonHumanLabel(name: string): boolean {
  const t = name.trim()
  const l = t.toLowerCase()
  if (!t) return true
  if (isLensPreviewPlaceholder(t)) return true
  if (l.includes('mock_user')) return true
  // Typical opaque ids: long alnum/underscore/dash tokens with no spaces.
  if (/^[a-z0-9_-]{12,}$/i.test(t)) return true
  return false
}

function sessionUserRecordForLocal(sc: SessionController): Record<string, unknown> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scAny = sc as any
  const myConn = scAny.getLocalConnectionId?.() as string | undefined
  const users = scAny.getUsers?.() as unknown[] | undefined
  if (!myConn || !users) return null
  for (const u of users) {
    if (u && typeof u === 'object' && String((u as any).connectionId) === String(myConn)) {
      return u as unknown as Record<string, unknown>
    }
  }
  return null
}

function resolveLocalSlotDisplayName(sc: SessionController, editorOverride: string | undefined): string {
  const o = editorOverride && String(editorOverride).trim()
  if (o) return o

  const merged: Record<string, unknown> = {}
  const local = sc.getLocalUserInfo() as unknown as Record<string, unknown> | null
  if (local) Object.assign(merged, local)
  const su = sessionUserRecordForLocal(sc)
  if (su) Object.assign(merged, su)

  const keys = [
    'displayName', 'username', 'snapchatUsername', 'mutableUsername',
    'localizedDisplayName', 'name',
  ] as const
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const k of keys) {
    const v = merged[k]
    if (v === undefined || v === null) continue
    const t = String(v).trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    candidates.push(t)
  }
  for (const c of candidates) {
    if (!isLensPreviewPlaceholder(c)) return c
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uid = (sc as any).getLocalUserId?.() as string | undefined
  if (uid && String(uid).trim()) return String(uid).trim()
  if (candidates.length > 0) return candidates[0]!
  const conn = (sc as any).getLocalConnectionId?.() as string | undefined
  if (conn) return conn
  return 'Player'
}

type PanelLike = { setEnabled(e: boolean): void }
type SetupLike = {
  setVisible(v: boolean, mode?: 'solo' | 'mp'): void
  /** MP: host’s chosen round count mirrored to clients (display only). */
  applyMirroredHostRounds?(n: number): void
}

@component
export class AshaGameManager extends BaseScriptComponent {

  @input nextRoundButton: SceneObject
  @input battleLogText: SceneObject
  @input titleText: SceneObject
  @input roundText: SceneObject
  @input statusText: SceneObject
  @input('SceneObject') @hint('Optional: in-game "Back to Main Menu" button (host only)')
  @allowUndefined
  backToMenuButton: SceneObject
  @input('SceneObject') @hint('Optional: the Sync Kit StartMenu scene object. If wired, "Back to Main Menu" will re-show the built-in Solo / Multi selector.')
  @allowUndefined
  startMenuRoot: SceneObject
  @input revealDelaySec: number = 1.2
  @input('string')
  @hint('Connected Preview often shows displayName as Preview 0. Set to test names in Lens Studio; leave empty on device for real UserInfo.')
  @allowUndefined
  editorDisplayNameOverride: string

  // ── ONE shared SyncEntity — flat registry ─────────────────────────────
  private phaseProp      = StorageProperty.manualString('phase', 'waiting')
  private roundProp      = StorageProperty.manualInt('round', 1)
  private totalRdsProp   = StorageProperty.manualInt('totalRds', 5)
  private aiCountProp    = StorageProperty.manualInt('aiCnt', 0)
  private humanCountProp = StorageProperty.manualInt('hCnt', 0)
  private revealTrig     = StorageProperty.manualInt('rTrig', 0)
  private nextTrig       = StorageProperty.manualInt('nTrig', 0)
  private goTrig         = StorageProperty.manualInt('gTrig', 0)
  private advReq         = StorageProperty.manualInt('advR', 0)
  private roundLogProp   = StorageProperty.manualString('rLog', '')
  /** MP setup: host-only round choice, mirrored to clients (-1 = none). */
  private mpHostRoundsPick = StorageProperty.manualInt('mHRd', -1)

  private c0 = StorageProperty.manualInt('c0', -1)
  private c1 = StorageProperty.manualInt('c1', -1)
  private c2 = StorageProperty.manualInt('c2', -1)
  private c3 = StorageProperty.manualInt('c3', -1)
  private c4 = StorageProperty.manualInt('c4', -1)
  private c5 = StorageProperty.manualInt('c5', -1)
  private s0 = StorageProperty.manualInt('s0', 0)
  private s1 = StorageProperty.manualInt('s1', 0)
  private s2 = StorageProperty.manualInt('s2', 0)
  private s3 = StorageProperty.manualInt('s3', 0)
  private s4 = StorageProperty.manualInt('s4', 0)
  private s5 = StorageProperty.manualInt('s5', 0)
  private n0 = StorageProperty.manualString('n0', '')
  private n1 = StorageProperty.manualString('n1', '')
  private n2 = StorageProperty.manualString('n2', '')
  private n3 = StorageProperty.manualString('n3', '')
  private n4 = StorageProperty.manualString('n4', '')
  private n5 = StorageProperty.manualString('n5', '')

  private get cProps(): StorageProperty<number>[] { return [this.c0,this.c1,this.c2,this.c3,this.c4,this.c5] }
  private get sProps(): StorageProperty<number>[] { return [this.s0,this.s1,this.s2,this.s3,this.s4,this.s5] }
  private get nProps(): StorageProperty<string>[] { return [this.n0,this.n1,this.n2,this.n3,this.n4,this.n5] }

  private syncEntity: SyncEntity
  private readonly log = new SyncKitLogger(TAG)
  private ready = false
  private mySlot = -1
  private lastHumanChoice = -1
  private soloDecided = false
  private handPanel: PanelLike | null = null
  private setupPanel: SetupLike | null = null
  /** Host: ignore extra Next taps while final-round → menu transition is queued. */
  private endSequenceScheduled = false
  private nameRefreshScheduled = false
  private soloAiSequenceActive = false

  // ── Lifecycle ─────────────────────────────────────────────────────────
  onAwake() {
    const all: StorageProperty<any>[] = [
      this.phaseProp, this.roundProp, this.totalRdsProp,
      this.aiCountProp, this.humanCountProp,
      this.revealTrig, this.nextTrig, this.goTrig, this.advReq, this.roundLogProp,
      this.mpHostRoundsPick,
      this.c0,this.c1,this.c2,this.c3,this.c4,this.c5,
      this.s0,this.s1,this.s2,this.s3,this.s4,this.s5,
      this.n0,this.n1,this.n2,this.n3,this.n4,this.n5,
    ]
    this.syncEntity = new SyncEntity(this, new StoragePropertySet(all), false, 'Session')
    this.syncEntity.notifyOnReady(() => this.onReady())
    if (this.nextRoundButton) this.nextRoundButton.enabled = false
    if (this.backToMenuButton) this.backToMenuButton.enabled = false
  }

  public registerHandPanel(p: PanelLike) {
    this.handPanel = p
    this.syncUi(sStr(this.phaseProp, ''))
  }
  /** Single unified setup panel — handles both solo_setup and mp_setup. */
  public registerSetupPanel(p: SetupLike) {
    this.setupPanel = p
    this.syncUi(sStr(this.phaseProp, ''))
  }
  /** @deprecated use registerSetupPanel — kept for backwards compatibility. */
  public registerSoloSetupPanel(p: SetupLike) {
    this.registerSetupPanel(p)
  }

  // ── SyncEntity ready — assign slot like Tic Tac Toe pattern ───────────
  private onReady() {
    this.ready = true
    this.log.i('SyncEntity ready')
    this.resolveStartMenuRootIfNeeded()

    this.phaseProp.onRemoteChange.add(v => this.onPhaseChanged(v))
    this.revealTrig.onRemoteChange.add(() => this.onReveal())
    this.nextTrig.onRemoteChange.add(() => this.onNextRound())
    this.goTrig.onRemoteChange.add(() => this.onGameOver())
    this.roundLogProp.onRemoteChange.add(() => {
      if (sStr(this.phaseProp, '') === 'reveal') this.setText(this.battleLogText, sStr(this.roundLogProp, ''))
    })
    if (SessionController.getInstance().isHost()) {
      this.advReq.onRemoteChange.add(() => this.hostHandleAdvance())
    }
    this.mpHostRoundsPick.onRemoteChange.add(() => this.applyHostMpRoundsPickToPanel())
    for (let i = 0; i < MAX_SLOTS; i++) {
      this.cProps[i].onRemoteChange.add(() => this.checkAllChosen())
    }

    const users = SessionController.getInstance().getUsers()
    const userCount = users ? users.length : 1
    this.mySlot = userCount - 1

    const sc0 = SessionController.getInstance()
    const display = resolveLocalSlotDisplayName(sc0, this.editorDisplayNameOverride)
    this.nProps[this.mySlot].setPendingValue(display)
    this.log.i(`Slot ${this.mySlot} → "${display}" (${userCount} user${userCount > 1 ? 's' : ''} in session)`)
    this.refreshLocalDisplayNameAsync(sc0)

    this.setText(this.titleText, 'ASHA')

    const sc = SessionController.getInstance()

    if (sc.isHost()) {
      this.humanCountProp.setPendingValue(userCount)

      sc.onUserJoinedSession.add(
        (_session: any, _userInfo: any) => this.onUserJoined()
      )
      sc.onUserLeftSession.add(
        (_session: any, _userInfo: any) => this.onUserLeft()
      )

      if (sc.isSingleplayer()) {
        this.hostDecide()
      } else {
        const d = this.createEvent('DelayedCallbackEvent')
        d.bind(() => this.hostDecide())
        d.reset(SOLO_WAIT_SEC)
      }
    } else {
      const currentPhase = sStr(this.phaseProp, '')
      if (currentPhase && currentPhase !== 'waiting') {
        this.log.i(`Late join — phase already "${currentPhase}"`)
        this.onPhaseChanged(currentPhase)
      }
    }
  }

  private refreshLocalDisplayNameAsync(sc: SessionController) {
    if (this.nameRefreshScheduled) return
    this.nameRefreshScheduled = true
    const applyCandidate = (raw: unknown) => {
      const next = String(raw ?? '').trim()
      if (!next) return
      const current = sStr(this.nProps[this.mySlot], '')
      if (!isNonHumanLabel(next) && (isNonHumanLabel(current) || next !== current)) {
        this.nProps[this.mySlot].setPendingValue(next)
        this.log.i(`Upgraded local display label → "${next}"`)
      }
    }

    // Try Sync Kit session user lookup first (preferred for connected sessions).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionAny = (sc.getSession?.() ?? null) as any
    const localInfo = sc.getLocalUserInfo()
    if (sessionAny && localInfo && typeof sessionAny.getSnapchatUser === 'function') {
      sessionAny.getSnapchatUser(localInfo, (snapchatUser: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const su = snapchatUser as any
        if (!su) return
        applyCandidate(su.displayName)
        applyCandidate(su.userName)
      })
    }

    // Fallback: UserContextSystem direct display name request.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ucs = (globalThis as any).userContextSystem as any
    if (ucs && typeof ucs.requestDisplayName === 'function') {
      ucs.requestDisplayName((displayName: string) => applyCandidate(displayName))
    }
    if (ucs && typeof ucs.requestUsername === 'function') {
      ucs.requestUsername((username: string) => applyCandidate(username))
    }
  }

  // ── Host: route straight to the proper setup phase ────────────────────
  // The Sync Kit StartMenu already handled Solo/Multi selection. Here we
  // only need to decide which setup panel to show inside the session.
  private hostDecide() {
    const phase = sStr(this.phaseProp, 'waiting')
    if (phase !== 'waiting') return
    this.soloDecided = true

    const sc = SessionController.getInstance()
    const humans = sInt(this.humanCountProp,
      (sc.getUsers() ? sc.getUsers().length : 1))

    if (sc.isSingleplayer() || humans < 2) {
      this.log.i('Host → solo_setup')
      this.phaseProp.setPendingValue('solo_setup')
      this.onPhaseChanged('solo_setup')
    } else {
      this.log.i(`Host → mp_setup (${humans} humans)`)
      this.phaseProp.setPendingValue('mp_setup')
      this.onPhaseChanged('mp_setup')
    }
  }

  // ── User join/leave handlers (host only) ──────────────────────────────
  private onUserJoined() {
    if (!SessionController.getInstance().isHost()) return
    const users = SessionController.getInstance().getUsers()
    const humans = users ? users.length : 1
    this.humanCountProp.setPendingValue(humans)
    this.log.i(`User joined → ${humans} humans`)

    const phase = sStr(this.phaseProp, 'waiting')

    // If a second human arrives while we're still on the solo setup
    // panel, swap to multi setup. Don't disrupt a match already running.
    if ((phase === 'waiting' || phase === 'solo_setup') && humans >= 2) {
      for (let i = 1; i < MAX_SLOTS; i++) {
        this.nProps[i].setPendingValue('')
        this.cProps[i].setPendingValue(-1)
      }
      this.aiCountProp.setPendingValue(0)
      this.log.i('Second human joined during setup → switching to mp_setup')
      this.mpHostRoundsPick.setPendingValue(-1)
      this.phaseProp.setPendingValue('mp_setup')
      this.onPhaseChanged('mp_setup')
    }
  }

  private onUserLeft() {
    if (!SessionController.getInstance().isHost()) return
    const users = SessionController.getInstance().getUsers()
    const humans = users ? users.length : 1
    this.humanCountProp.setPendingValue(humans)
    this.log.i(`User left → ${humans} humans`)
  }

  // ── Solo setup: called from AshaSoloSetupPanel ────────────────────────
  public applySoloSetupAndStart(aiCount: number, totalRounds: number) {
    if (!this.ready || !SessionController.getInstance().isHost()) return
    if (sStr(this.phaseProp, '') !== 'solo_setup') return

    if (![3, 5, 7, 10].includes(Math.floor(totalRounds))) {
      this.log.w('Pick number of rounds before Begin')
      this.setText(this.statusText, 'Pick a round count (3 / 5 / 7 / 10) first')
      return
    }

    const humans = sInt(this.humanCountProp, 1)
    const ai = Math.min(5, Math.max(1, Math.floor(aiCount)))
    const rds = Math.floor(totalRounds)

    this.aiCountProp.setPendingValue(ai)
    this.totalRdsProp.setPendingValue(rds)
    this.log.i(`Solo config: ${ai} AI, ${rds} rounds, humans at slots 0..${humans-1}, AI at slots ${humans}..${humans+ai-1}`)

    for (let i = 0; i < ai; i++) {
      const slot = humans + i
      this.nProps[slot].setPendingValue(`Magi ${i + 1}`)
    }

    this.roundProp.setPendingValue(1)
    this.phaseProp.setPendingValue('choosing')
    this.onPhaseChanged('choosing')
  }

  // ── Multiplayer setup: called from AshaSoloSetupPanel in 'mp' mode ────
  public applyMpSetupAndStart(totalRounds: number) {
    if (!this.ready || !SessionController.getInstance().isHost()) return
    if (sStr(this.phaseProp, '') !== 'mp_setup') return

    if (![3, 5, 7, 10].includes(Math.floor(totalRounds))) {
      this.log.w('Pick number of rounds before Begin')
      this.setText(this.statusText, 'Pick a round count (3 / 5 / 7 / 10) first')
      return
    }

    const humans = sInt(this.humanCountProp, 1)
    if (humans < 2) {
      this.log.w('Multi Player requires 2+ humans')
      this.setText(this.statusText, 'Need 2+ humans in the session')
      return
    }

    this.aiCountProp.setPendingValue(0)
    this.totalRdsProp.setPendingValue(Math.floor(totalRounds))
    this.log.i(`MP config: ${humans} humans, ${totalRounds} rounds`)

    this.roundProp.setPendingValue(1)
    this.mpHostRoundsPick.setPendingValue(-1)
    this.phaseProp.setPendingValue('choosing')
    this.onPhaseChanged('choosing')
  }

  // ── Back to main menu — clears scores/choices, returns to Solo/Multi ──
  public backToMainMenu() {
    if (!this.ready) return
    if (SessionController.getInstance().isHost()) {
      this.hostBackToMenu()
    } else {
      // Non-hosts can't return to menu directly — only host can reset.
      this.log.i('Only the host can return to Main Menu')
    }
  }

  /** After a match or explicit “main menu”: reset scores and return to in-lens round setup (not Sync Kit Start Menu). */
  private hostBackToMenu() {
    this.endSequenceScheduled = false
    this.log.i('→ Round setup (solo / multi per session; Start Menu hidden)')
    this.clearAllSlots()
    this.aiCountProp.setPendingValue(0)
    this.roundProp.setPendingValue(1)
    if (this.nextRoundButton) this.nextRoundButton.enabled = false
    this.setBtnLabel('NEXT ROUND')
    this.roundLogProp.setPendingValue('')

    this.soloDecided = false
    this.hideStartMenuForSession()
    this.hostReturnToRoundSetupPhase()
  }

  /** Host: same routing as `hostDecide` but without requiring `waiting` (post-match). */
  private hostReturnToRoundSetupPhase() {
    if (!SessionController.getInstance().isHost()) return
    const sc = SessionController.getInstance()
    const humans = sInt(this.humanCountProp, sc.getUsers() ? sc.getUsers().length : 1)
    if (sc.isSingleplayer() || humans < 2) {
      this.phaseProp.setPendingValue('solo_setup')
      this.onPhaseChanged('solo_setup')
    } else {
      this.mpHostRoundsPick.setPendingValue(-1)
      this.phaseProp.setPendingValue('mp_setup')
      this.onPhaseChanged('mp_setup')
    }
  }

  /** Hide Spectacles Sync Kit Start Menu so it cannot stay stuck on one device after MP rematch. */
  private hideStartMenuForSession() {
    this.resolveStartMenuRootIfNeeded()
    if (!this.startMenuRoot) return
    const sm = this.startMenuRoot.getComponent(StartMenu.getTypeName()) as StartMenu | null
    if (sm && typeof (sm as any).hide === 'function') {
      (sm as any).hide()
    }
    this.startMenuRoot.enabled = false
  }

  private resolveStartMenuRootIfNeeded() {
    if (this.startMenuRoot) return

    // Expected hierarchy in Sync Kit sample:
    // HiddenFromSceneView > EnableOnAwake > StartMenu
    const hidden = this.findSceneObjectByName('HiddenFromSceneView')
    const enableOnAwake = hidden ? this.findChildByName(hidden, 'EnableOnAwake') : null
    const startMenu = enableOnAwake ? this.findChildByName(enableOnAwake, 'StartMenu') : null
    if (startMenu) {
      this.startMenuRoot = startMenu
      this.log.i('Auto-wired StartMenu root from scene hierarchy')
      return
    }

    // Fallback: first object named StartMenu anywhere in the scene.
    const anyStart = this.findSceneObjectByName('StartMenu')
    if (anyStart) {
      this.startMenuRoot = anyStart
      this.log.i('Auto-wired StartMenu root by name lookup')
    }
  }

  private findSceneObjectByName(name: string): SceneObject | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sceneAny = (globalThis as any).scene
    if (!sceneAny || !sceneAny.findByName) return null
    return sceneAny.findByName(name) as SceneObject | null
  }

  private findChildByName(root: SceneObject, name: string): SceneObject | null {
    const cc = root.getChildrenCount()
    for (let i = 0; i < cc; i++) {
      const child = root.getChild(i)
      if (child.name === name) return child
      const nested = this.findChildByName(child, name)
      if (nested) return nested
    }
    return null
  }

  private clearAllSlots() {
    for (let i = 0; i < MAX_SLOTS; i++) {
      this.cProps[i].setPendingValue(-1)
      this.sProps[i].setPendingValue(0)
    }
    // Keep local player's name; clear everyone else so old AI names don't linger
    const humans = sInt(this.humanCountProp, 1)
    for (let i = humans; i < MAX_SLOTS; i++) {
      this.nProps[i].setPendingValue('')
    }
    this.soloAiSequenceActive = false
  }

  // ── Player submits choice (called from ElementHandPanel) ──────────────
  public submitChoice(elementId: number) {
    if (!this.ready || this.mySlot < 0) return
    if (sInt(this.cProps[this.mySlot], -1) !== -1) return

    this.log.i(`Slot ${this.mySlot} chose element ${elementId}`)
    this.cProps[this.mySlot].setPendingValue(elementId)
    this.lastHumanChoice = elementId
    this.checkAllChosen()
  }

  public getMySlot(): number { return this.mySlot }

  // ── Check readiness (host only) ───────────────────────────────────────
  private checkAllChosen() {
    if (!this.ready || !SessionController.getInstance().isHost()) return
    if (sStr(this.phaseProp, '') !== 'choosing') return

    const humans = sInt(this.humanCountProp, 1)
    const ai = sInt(this.aiCountProp, 0)
    const total = humans + ai
    if (total === 0) return

    // Solo pacing: each Magi picks with a visible 1.8s cadence.
    if (ai > 0) {
      let pendingAi = 0
      for (let i = humans; i < humans + ai && i < MAX_SLOTS; i++) {
        if (sInt(this.cProps[i], -1) === -1) pendingAi++
      }
      if (pendingAi > 0) {
        if (!this.soloAiSequenceActive) this.startSoloAiSequence(humans, ai)
        this.log.i(`Waiting: humans picked, bots pending ${pendingAi}`)
        this.setText(this.statusText, `... Magi choosing (${ai - pendingAi + 1}/${ai})`)
        return
      }
    }

    let readyCount = 0
    for (let i = 0; i < total; i++) {
      if (sInt(this.cProps[i], -1) !== -1) readyCount++
    }

    if (readyCount < total) {
      this.log.i(`Waiting: ${readyCount}/${total} ready`)
      this.setText(this.statusText, `... Awaiting ${readyCount}/${total}`)
      return
    }

    this.resolveAndReveal(total)
  }

  private startSoloAiSequence(humans: number, ai: number) {
    if (this.soloAiSequenceActive) return
    this.soloAiSequenceActive = true
    this.runNextAiPick(humans, ai)
  }

  private runNextAiPick(humans: number, ai: number) {
    if (!this.ready || !SessionController.getInstance().isHost()) {
      this.soloAiSequenceActive = false
      return
    }
    if (sStr(this.phaseProp, '') !== 'choosing') {
      this.soloAiSequenceActive = false
      return
    }
    const slot = this.findNextPendingAiSlot(humans, ai)
    if (slot < 0) {
      this.soloAiSequenceActive = false
      this.checkAllChosen()
      return
    }
    const magiIndex = slot - humans + 1
    this.setText(this.statusText, `Magi ${magiIndex} is choosing...`)
    const d = this.createEvent('DelayedCallbackEvent')
    d.bind(() => {
      if (sStr(this.phaseProp, '') !== 'choosing') {
        this.soloAiSequenceActive = false
        return
      }
      if (sInt(this.cProps[slot], -1) === -1) this.cProps[slot].setPendingValue(this.pickAi())
      this.runNextAiPick(humans, ai)
    })
    d.reset(SOLO_BOT_PICK_DELAY_SEC)
  }

  private findNextPendingAiSlot(humans: number, ai: number): number {
    for (let i = humans; i < humans + ai && i < MAX_SLOTS; i++) {
      if (sInt(this.cProps[i], -1) === -1) return i
    }
    return -1
  }

  private pickAi(): number {
    if (this.lastHumanChoice >= 0 && this.lastHumanChoice <= 4 && Math.random() < 0.3) {
      const counters = ELEMENTS[this.lastHumanChoice].loses
      return counters[Math.floor(Math.random() * counters.length)]
    }
    return Math.floor(Math.random() * 5)
  }

  // ── Resolution ────────────────────────────────────────────────────────
  private resolveAndReveal(total: number) {
    this.log.i('All chosen — resolving')
    this.phaseProp.setPendingValue('resolving')
    this.setText(this.statusText, 'Shuffling the astrolabe...')
    this.syncUi('resolving')

    const delay = this.createEvent('DelayedCallbackEvent')
    delay.bind(() => {
      const choices: number[] = []
      const names: string[] = []
      for (let i = 0; i < total; i++) {
        choices.push(sInt(this.cProps[i], 0))
        names.push(sStr(this.nProps[i], `seat_${i}`))
      }

      const deltas = resolveRound(choices)

      for (let i = 0; i < total; i++) {
        const cur = sInt(this.sProps[i], 0)
        this.sProps[i].setPendingValue(cur + deltas[i])
      }

      const roundLog = this.buildBattleLog(names, choices, deltas, total)
      this.roundLogProp.setPendingValue(roundLog)

      const trig = sInt(this.revealTrig, 0)
      this.revealTrig.setPendingValue(trig + 1)
      this.phaseProp.setPendingValue('reveal')
      this.setText(this.statusText, '')
      this.onReveal()
      this.onPhaseChanged('reveal')
    })
    delay.reset(Math.max(0, this.revealDelaySec))
  }

  private buildBattleLog(names: string[], choices: number[], deltas: number[], total: number): string {
    const round = sInt(this.roundProp, 1)
    const lines: string[] = [`— Round ${round} Tauroctony —`]

    for (let i = 0; i < total; i++) {
      for (let j = i + 1; j < total; j++) {
        const ci = choices[i], cj = choices[j]
        const r = MATRIX[ci][cj]
        if (r === 0) {
          lines.push(`${ELEMENTS[ci].emoji} ${names[i]} & ${names[j]}: draw`)
        } else if (r === 1) {
          lines.push(`${ELEMENTS[ci].emoji} ${names[i]} ${getVerb(ci, cj)} ${names[j]}`)
        } else {
          lines.push(`${ELEMENTS[cj].emoji} ${names[j]} ${getVerb(cj, ci)} ${names[i]}`)
        }
      }
    }

    for (let i = 0; i < total; i++) {
      const d = deltas[i]
      const sign = d > 0 ? '+' : ''
      lines.push(`${names[i]}: ${sign}${d} (total ${sInt(this.sProps[i], 0)})`)
    }

    const text = lines.join('\n')
    this.setText(this.battleLogText, text)
    return text
  }

  // ── advanceToNextRound — wired to NextButton (any player can press) ──
  public advanceToNextRound() {
    if (!this.ready) return
    if (SessionController.getInstance().isHost()) {
      this.hostHandleAdvance()
    } else {
      const phase = sStr(this.phaseProp, '')
      if (phase === 'reveal') {
        this.advReq.setPendingValue(sInt(this.advReq, 0) + 1)
      }
    }
  }

  private hostHandleAdvance() {
    if (!SessionController.getInstance().isHost()) return
    const phase = sStr(this.phaseProp, '')
    if (phase !== 'reveal') return
    if (this.endSequenceScheduled) return

    if (this.nextRoundButton) this.nextRoundButton.enabled = false

    const round = sInt(this.roundProp, 1)
    const total = sInt(this.totalRdsProp, 5)

    if (round >= total) {
      this.log.i('Final round → end standings + return to round setup')
      this.endSequenceScheduled = true
      this.onGameOver()
      const t = sInt(this.goTrig, 0)
      this.goTrig.setPendingValue(t + 1)
      // Defer slot reset so non-hosts can run `onGameOver` from `goTrig` while scores still match host.
      const end = this.createEvent('DelayedCallbackEvent')
      end.bind(() => {
        this.endSequenceScheduled = false
        this.hostBackToMenu()
      })
      end.reset(0.12)
    } else {
      const next = round + 1
      this.log.i(`→ Round ${next}`)
      this.roundProp.setPendingValue(next)
      const t = sInt(this.nextTrig, 0)
      this.nextTrig.setPendingValue(t + 1)
      this.phaseProp.setPendingValue('choosing')
      this.onNextRound()
      this.onPhaseChanged('choosing')
    }
  }

  // ── Phase handler ─────────────────────────────────────────────────────
  private onPhaseChanged(phase: string) {
    this.log.i(`Phase → ${phase}`)

    if (phase === 'waiting') {
      this.setText(this.titleText, 'ASHA')
      this.setText(this.roundText, '')
      this.setText(this.statusText, '')
      this.setText(this.battleLogText, '')
    }

    if (phase === 'solo_setup') {
      this.hideStartMenuForSession()
      this.setText(this.statusText, 'Solo Setup')
      this.setText(this.battleLogText,
        'Pick AI count (1–5) and rounds, then tap Confirm to start.')
    }

    if (phase === 'mp_setup') {
      this.hideStartMenuForSession()
      this.setText(this.statusText, 'Multiplayer Setup')
      const isHost = SessionController.getInstance().isHost()
      this.setText(this.battleLogText, isHost
        ? 'Host: pick rounds (3 / 5 / 7 / 10), then tap Confirm to start.'
        : 'Host is choosing rounds — you will see their pick here.')
    }

    if (phase === 'choosing') {
      this.soloAiSequenceActive = false
      const humans = sInt(this.humanCountProp, 1)
      const ai = sInt(this.aiCountProp, 0)
      const total = humans + ai
      for (let i = 0; i < total; i++) this.cProps[i].setPendingValue(-1)

      const r = sInt(this.roundProp, 1)
      const t = sInt(this.totalRdsProp, 5)
      this.setText(this.roundText, `Round ${r} of ${t}`)
      this.setText(this.statusText, 'Choose your element')
      this.setText(this.battleLogText,
        'Fire>Earth/Metal  Water>Fire/Metal  Earth>Water/Wind  Wind>Fire/Water  Metal>Earth/Wind')
      this.roundLogProp.setPendingValue('')
    }

    this.syncUi(phase)

    if (phase === 'mp_setup') this.applyHostMpRoundsPickToPanel()
  }

  private onReveal() {
    this.log.i('Reveal')
    const syncedLog = sStr(this.roundLogProp, '')
    if (syncedLog) {
      this.setText(this.battleLogText, syncedLog)
      return
    }
    this.rebuildBattleLog()
  }

  private rebuildBattleLog() {
    const humans = sInt(this.humanCountProp, 1)
    const ai = sInt(this.aiCountProp, 0)
    const total = humans + ai
    if (total <= 0) return
    const choices: number[] = []
    const names: string[] = []
    for (let i = 0; i < total; i++) {
      choices.push(sInt(this.cProps[i], 0))
      names.push(sStr(this.nProps[i], `seat_${i}`))
    }
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]
      if (c < 0 || c > 4) {
        this.log.w('Skip rebuildBattleLog: unresolved choice state')
        return
      }
    }
    const deltas = resolveRound(choices)
    const round = sInt(this.roundProp, 1)
    const lines: string[] = [`— Round ${round} Tauroctony —`]
    for (let i = 0; i < total; i++) {
      for (let j = i + 1; j < total; j++) {
        const ci = choices[i], cj = choices[j]
        const r = MATRIX[ci][cj]
        if (r === 0) {
          lines.push(`${ELEMENTS[ci].emoji} ${names[i]} & ${names[j]}: draw`)
        } else if (r === 1) {
          lines.push(`${ELEMENTS[ci].emoji} ${names[i]} ${getVerb(ci, cj)} ${names[j]}`)
        } else {
          lines.push(`${ELEMENTS[cj].emoji} ${names[j]} ${getVerb(cj, ci)} ${names[i]}`)
        }
      }
    }
    for (let i = 0; i < total; i++) {
      const d = deltas[i]
      const sign = d > 0 ? '+' : ''
      lines.push(`${names[i]}: ${sign}${d} (total ${sInt(this.sProps[i], 0)})`)
    }
    this.setText(this.battleLogText, lines.join('\n'))
  }

  private onNextRound() {
    this.log.i(`Round ${sInt(this.roundProp, 1)} starting`)
  }

  private onGameOver() {
    this.log.i('Game over')
    const humans = sInt(this.humanCountProp, 1)
    const ai = sInt(this.aiCountProp, 0)
    const total = humans + ai
    const rows: { name: string; score: number }[] = []
    for (let i = 0; i < total; i++) {
      rows.push({
        name: sStr(this.nProps[i], `seat_${i}`),
        score: sInt(this.sProps[i], 0),
      })
    }
    rows.sort((a, b) => b.score - a.score)

    const medals = ['WINNER', '2nd', '3rd', '4th', '5th', '6th']
    const lines = rows.map((r, i) => `${medals[i] ?? ''} ${r.name}: ${r.score} pts`)
    this.setText(this.battleLogText, lines.join('\n'))
    this.applyLocalEndStatus(humans, total)
    this.setBtnLabel('BACK TO SETUP')

    if (this.nextRoundButton) this.nextRoundButton.enabled = true
  }

  /** Per-device: winner vs non-winner status (humans only; AI seats ignored). */
  private applyLocalEndStatus(humans: number, total: number) {
    if (this.mySlot < 0 || this.mySlot >= humans) {
      this.setText(this.statusText, 'Match complete.')
      return
    }
    let maxScore = -999999
    for (let i = 0; i < total; i++) {
      const sc = sInt(this.sProps[i], 0)
      if (sc > maxScore) maxScore = sc
    }
    let leaders = 0
    for (let i = 0; i < total; i++) {
      if (sInt(this.sProps[i], 0) === maxScore) leaders++
    }
    const mine = sInt(this.sProps[this.mySlot], 0)
    if (mine === maxScore && leaders === 1) {
      this.setText(this.statusText, 'Victory — you had the highest score.')
    } else if (mine === maxScore && leaders > 1) {
      this.setText(this.statusText, 'You tied for the highest score.')
    } else {
      this.setText(this.statusText, 'Game over — another player scored higher.')
    }
  }

  // ── UI sync ───────────────────────────────────────────────────────────
  private syncUi(phase: string) {
    if (!this.ready) return
    const isSolo    = phase === 'solo_setup'
    const isMpSetup = phase === 'mp_setup'
    const isChoose  = phase === 'choosing'

    if (this.setupPanel) {
      this.setupPanel.setVisible(isSolo || isMpSetup, isMpSetup ? 'mp' : 'solo')
    }
    if (this.handPanel) this.handPanel.setEnabled(isChoose)

    if (phase !== 'reveal') {
      if (this.nextRoundButton) this.nextRoundButton.enabled = false
    }

    if (this.backToMenuButton) {
      const isHost = SessionController.getInstance().isHost()
      this.backToMenuButton.enabled = isHost && phase !== 'waiting'
    }

    if (phase === 'reveal') {
      const isFinal = sInt(this.roundProp, 1) >= sInt(this.totalRdsProp, 5)
      this.setBtnLabel(isFinal ? 'BACK TO SETUP' : 'NEXT ROUND')
      const d = this.createEvent('DelayedCallbackEvent')
      d.bind(() => { if (this.nextRoundButton) this.nextRoundButton.enabled = true })
      d.reset(3.0)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private setText(obj: SceneObject, val: string) {
    if (!obj) return
    const t = obj.getComponent('Component.Text')
    if (t) (t as any).text = val
  }

  private setBtnLabel(label: string) {
    if (!this.nextRoundButton) return
    const self = this.nextRoundButton.getComponent('Component.Text')
    if (self) { (self as any).text = label; return }
    const cc = this.nextRoundButton.getChildrenCount()
    for (let i = 0; i < cc; i++) {
      const t = this.nextRoundButton.getChild(i).getComponent('Component.Text')
      if (t) { (t as any).text = label; return }
    }
  }

  // ── Surface a transient hint in the status / battle log (e.g. setup errors) ─
  public showSetupHint(message: string) {
    this.setText(this.statusText, message)
  }

  /** MP: host only — syncs chosen round count so other players see the same setup. */
  public hostProposeMpRounds(n: number) {
    if (!this.ready || !SessionController.getInstance().isHost()) return
    if (sStr(this.phaseProp, '') !== 'mp_setup') return
    if (![3, 5, 7, 10].includes(Math.floor(n))) return
    this.mpHostRoundsPick.setPendingValue(Math.floor(n))
  }

  private applyHostMpRoundsPickToPanel() {
    const n = sInt(this.mpHostRoundsPick, -1)
    const fn = this.setupPanel?.applyMirroredHostRounds
    if (!fn) return
    if (n === 3 || n === 5 || n === 7 || n === 10) fn.call(this.setupPanel, n)
  }

  // ── Public getters for scoreboard UI ──────────────────────────────────
  public getSlotCount(): number {
    return sInt(this.humanCountProp, 0) + sInt(this.aiCountProp, 0)
  }
  public getSlotName(i: number): string { return i < MAX_SLOTS ? sStr(this.nProps[i], '') : '' }
  public getSlotScore(i: number): number { return i < MAX_SLOTS ? sInt(this.sProps[i], 0) : 0 }
  public getSlotChoice(i: number): number { return i < MAX_SLOTS ? sInt(this.cProps[i], -1) : -1 }
}
