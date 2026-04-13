import { SyncEntity } from 'SpectaclesSyncKit.lspkg/Core/SyncEntity'
import { StorageProperty } from 'SpectaclesSyncKit.lspkg/Core/StorageProperty'
import { StoragePropertySet } from 'SpectaclesSyncKit.lspkg/Core/StoragePropertySet'
import { SessionController } from 'SpectaclesSyncKit.lspkg/Core/SessionController'
import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaPlayerState } from './AshaPlayerState'
import { resolveRound, getVerb } from './AshaResolver'
import { ELEMENTS, MATRIX } from './AshaConstants'
import { AI_EMOJIS, AI_NAMES } from './AshaAiBots'

const TAG = 'AshaGameManager'

type BattleParticipant = { name: string; choice: number }

function storageInt(prop: StorageProperty<number>, fallback: number): number {
  const v = prop.currentOrPendingValue ?? prop.currentValue
  if (v === null || v === undefined) return fallback
  return v as number
}

function storageString(prop: StorageProperty<string>, fallback: string): string {
  const v = prop.currentOrPendingValue ?? prop.currentValue
  if (v === null || v === undefined) return fallback
  return v as string
}

type HandPanelLike = { setEnabled(enabled: boolean): void }
type SoloPanelLike = { setVisible(visible: boolean): void }

@component
export class AshaGameManager extends BaseScriptComponent {

  // Inspector-assigned references
  @input nextRoundButton: SceneObject   // disabled until host sees reveal
  @input battleLogText: SceneObject     // Text3D for battle log display

  // ── Shared state (unowned — any player can write) ──────────────────────
  private phaseProp        = StorageProperty.manualString('ashaPhase', 'waiting')
  private roundProp        = StorageProperty.manualInt('ashaRound', 1)
  private totalRoundsProp  = StorageProperty.manualInt('ashaTotalRounds', 5)
  /** Synced AI slots for solo (1–5). 0 = not chosen yet or multiplayer (no AI). */
  private aiOpponentCountProp = StorageProperty.manualInt('ashaAiOpponentCount', 0)

  // ── Event triggers (increment = fire, onRemoteChange = receive) ────────
  // NetworkedEvent is unavailable — this increment pattern is the equivalent.
  // Incrementing by 1 is a one-shot broadcast. Listeners check onRemoteChange.
  private revealTrigger    = StorageProperty.manualInt('ashaRevealTrig', 0)
  private nextRoundTrigger = StorageProperty.manualInt('ashaNextRndTrig', 0)
  private gameOverTrigger  = StorageProperty.manualInt('ashaGameOverTrig', 0)

  private syncEntity: SyncEntity
  private readonly log = new SyncKitLogger(TAG)
  private isReady = false
  private elementHandPanel: HandPanelLike | null = null
  private soloSetupPanel: SoloPanelLike | null = null

  /** Filled on host when resolving a round that includes AI; remotes use real players only. */
  private lastBattleParticipants: BattleParticipant[] | null = null
  private aiScores: number[] = []
  private lastHumanElementChoice = -1
  private hostBeginAttempts = 0

  onAwake() {
    this.syncEntity = new SyncEntity(
      this,
      new StoragePropertySet([
        this.phaseProp,
        this.roundProp,
        this.totalRoundsProp,
        this.aiOpponentCountProp,
        this.revealTrigger,
        this.nextRoundTrigger,
        this.gameOverTrigger,
      ]),
      false,      // unowned: any player can write phase changes
      'Session'   // persists while at least one player is in session
    )

    this.syncEntity.notifyOnReady(() => this.onReady())

    // Hide next-round button at start
    if (this.nextRoundButton) this.nextRoundButton.enabled = false
  }

  /** Called from ElementHandPanel onAwake — avoids circular module imports. */
  public registerElementHandPanel(panel: HandPanelLike) {
    this.elementHandPanel = panel
    this.syncUiToPhase(storageString(this.phaseProp, ''))
  }

  /** Called from AshaSoloSetupPanel onAwake. */
  public registerSoloSetupPanel(panel: SoloPanelLike) {
    this.soloSetupPanel = panel
    this.syncUiToPhase(storageString(this.phaseProp, ''))
  }

  /**
   * Solo flow: pick AI count (1–5) and total rounds, then start `choosing`.
   * Host only; call from AshaSoloSetupPanel confirm button.
   */
  public applySoloSetupAndStart(aiCount: number, totalRounds: number) {
    if (!this.isReady) return
    if (!SessionController.getInstance().isHost()) return
    if (storageString(this.phaseProp, '') !== 'solo_setup') return

    const n = Math.min(5, Math.max(1, Math.floor(aiCount)))
    const r = [3, 5, 7, 10].includes(Math.floor(totalRounds))
      ? Math.floor(totalRounds)
      : 5

    this.aiOpponentCountProp.setPendingValue(n)
    this.totalRoundsProp.setPendingValue(r)
    this.log.i(`Solo config: ${n} AI, ${r} rounds`)

    this.phaseProp.setPendingValue('choosing')
    this.onPhaseChanged('choosing')
  }

  private sessionHumanCount(): number {
    const users = SessionController.getInstance().getUsers()
    return users ? users.length : 0
  }

  private getAiSlotCount(): number {
    if (this.sessionHumanCount() !== 1) return 0
    return Math.min(5, Math.max(0, storageInt(this.aiOpponentCountProp, 0)))
  }

  private onReady() {
    this.isReady = true
    this.log.i('SyncEntity ready')

    // Subscribe to remote changes (fires on all devices EXCEPT the writer)
    this.phaseProp.onRemoteChange.add((v) => this.onPhaseChanged(v))
    this.revealTrigger.onRemoteChange.add(() => this.onReveal())
    this.nextRoundTrigger.onRemoteChange.add(() => this.onNextRound())
    this.gameOverTrigger.onRemoteChange.add(() => this.onGameOver())

    if (SessionController.getInstance().isHost()) {
      const delay = this.createEvent('DelayedCallbackEvent')
      delay.bind(() => this.hostBeginAfterSceneRegistered())
      delay.reset(0.1)
    }
  }

  /** After AshaPlayerState has registered (getAll reliable). */
  private hostBeginAfterSceneRegistered() {
    if (!SessionController.getInstance().isHost()) return

    let humans = this.sessionHumanCount()
    if (humans === 0 && this.hostBeginAttempts < 8) {
      this.hostBeginAttempts++
      const retry = this.createEvent('DelayedCallbackEvent')
      retry.bind(() => this.hostBeginAfterSceneRegistered())
      retry.reset(0.15)
      return
    }
    if (humans === 0) {
      this.log.w('No session users after retries — assuming solo (preview)')
      humans = 1
    }

    if (humans === 1) {
      this.log.i('Host: solo session → solo_setup (pick AI count & rounds)')
      this.aiOpponentCountProp.setPendingValue(0)
      this.phaseProp.setPendingValue('solo_setup')
      this.onPhaseChanged('solo_setup')
    } else {
      this.log.i(`Host: ${humans}-player session → choosing`)
      this.aiOpponentCountProp.setPendingValue(0)
      this.phaseProp.setPendingValue('choosing')
      this.onPhaseChanged('choosing')
    }
  }

  private syncUiToPhase(phase: string) {
    if (!this.isReady) return
    if (phase === 'solo_setup') {
      if (this.soloSetupPanel) this.soloSetupPanel.setVisible(true)
      if (this.elementHandPanel) this.elementHandPanel.setEnabled(false)
    } else if (phase === 'choosing') {
      if (this.soloSetupPanel) this.soloSetupPanel.setVisible(false)
      if (this.elementHandPanel) this.elementHandPanel.setEnabled(true)
    } else {
      if (this.soloSetupPanel) this.soloSetupPanel.setVisible(false)
      if (this.elementHandPanel) this.elementHandPanel.setEnabled(false)
    }
  }

  // ── Called by AshaPlayerState.submitChoice (after local readyProp set) ──
  public checkAllChosen() {
    if (!this.isReady) return
    if (!SessionController.getInstance().isHost()) return

    const players = AshaPlayerState.getAll()
    if (players.length === 0) return

    const humansInSession = this.sessionHumanCount()
    if (humansInSession > 1 && players.length < humansInSession) {
      this.log.w(
        `ASHA: ${humansInSession} users in session but ${players.length} AshaPlayerState — add one SceneObject per seat (see SCENE_SETUP.md).`
      )
    }

    const aiSlots = this.getAiSlotCount()
    const soloVsAi = humansInSession === 1 && aiSlots > 0

    if (!soloVsAi) {
      if (players.length < humansInSession) return
      const seats = players.slice(0, humansInSession)
      const allReady = seats.every(p => p.isReady)
      if (!allReady) {
        const readyCount = seats.filter(p => p.isReady).length
        this.log.i(`Waiting: ${readyCount}/${humansInSession} ready`)
        return
      }
    } else {
      if (!players[0].isReady) {
        this.log.i('Waiting: 0/1 ready')
        return
      }
    }

    this.log.i('All players chosen — resolving round')

    let participants: BattleParticipant[]

    if (soloVsAi) {
      const h = players[0]
      const humanChoice = h.choice
      this.lastHumanElementChoice = humanChoice
      while (this.aiScores.length < aiSlots) this.aiScores.push(0)
      const aiChoices: number[] = []
      for (let i = 0; i < aiSlots; i++) {
        aiChoices.push(this.pickAiElement())
      }
      participants = [
        { name: h.displayName, choice: humanChoice },
        ...aiChoices.map((choice, i) => ({
          name: `${AI_EMOJIS[i % AI_EMOJIS.length]} ${AI_NAMES[i % AI_NAMES.length]}`,
          choice,
        })),
      ]
    } else {
      participants = players.map(p => ({ name: p.displayName, choice: p.choice }))
    }

    this.lastBattleParticipants = participants
    const choices = participants.map(p => p.choice)
    const deltas = resolveRound(choices)

    if (soloVsAi) {
      players[0].applyDelta(deltas[0])
      for (let i = 0; i < aiSlots; i++) {
        this.aiScores[i] = (this.aiScores[i] ?? 0) + deltas[i + 1]
      }
    } else {
      players.forEach((p, i) => p.applyDelta(deltas[i]))
    }

    const trig = storageInt(this.revealTrigger, 0)
    this.revealTrigger.setPendingValue(trig + 1)
    this.phaseProp.setPendingValue('reveal')

    this.onReveal()
    this.onPhaseChanged('reveal')
  }

  private pickAiElement(): number {
    const last = this.lastHumanElementChoice
    if (last >= 0 && last <= 4 && Math.random() < 0.3) {
      const loses = ELEMENTS[last].loses
      return loses[Math.floor(Math.random() * loses.length)]
    }
    return Math.floor(Math.random() * 5)
  }

  // ── Called by host button after reveal ─────────────────────────────────
  public advanceToNextRound() {
    if (!this.isReady) return
    if (!SessionController.getInstance().isHost()) return

    if (this.nextRoundButton) this.nextRoundButton.enabled = false

    const round = storageInt(this.roundProp, 1)
    const next = round + 1
    const total = storageInt(this.totalRoundsProp, 5)

    if (next > total) {
      this.log.i('Final round complete — game over')
      const goTrig = storageInt(this.gameOverTrigger, 0)
      this.gameOverTrigger.setPendingValue(goTrig + 1)
      this.phaseProp.setPendingValue('gameover')
      this.onGameOver()           // ← direct call on host
      this.onPhaseChanged('gameover')
    } else {
      this.log.i(`Advancing to round ${next}`)
      this.roundProp.setPendingValue(next)
      const nrTrig = storageInt(this.nextRoundTrigger, 0)
      this.nextRoundTrigger.setPendingValue(nrTrig + 1)
      this.phaseProp.setPendingValue('choosing')
      this.onNextRound()          // ← direct call on host
      this.onPhaseChanged('choosing')
    }
  }

  // ── Phase handler (all devices) ─────────────────────────────────────────
  private onPhaseChanged(phase: string) {
    this.log.i(`Phase → ${phase}`)

    if (phase === 'solo_setup') {
      this.syncUiToPhase('solo_setup')
      return
    }

    if (phase === 'choosing') {
      this.lastBattleParticipants = null
      AshaPlayerState.getAll().forEach(p => p.resetForRound())
    }

    this.syncUiToPhase(phase)
  }

  // ── Reveal handler (all devices) ────────────────────────────────────────
  private onReveal() {
    this.log.i('Reveal fired')

    const roster =
      this.lastBattleParticipants && this.lastBattleParticipants.length > 0
        ? this.lastBattleParticipants
        : AshaPlayerState.getAll().map(p => ({
            name: p.displayName,
            choice: p.choice,
          }))

    // Build battle log text
    const lines: string[] = []
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        const ci = roster[i].choice
        const cj = roster[j].choice
        if (ci === -1 || cj === -1) continue

        const r = MATRIX[ci][cj]

        if (r === 0) {
          lines.push(`${ELEMENTS[ci].emoji} ${roster[i].name} & ${roster[j].name}: draw`)
        } else if (r === 1) {
          lines.push(`${ELEMENTS[ci].emoji} ${roster[i].name} ${getVerb(ci, cj)} ${roster[j].name}`)
        } else {
          lines.push(`${ELEMENTS[cj].emoji} ${roster[j].name} ${getVerb(cj, ci)} ${roster[i].name}`)
        }
      }
    }

    // Update battle log Text3D
    if (this.battleLogText) {
      const textComp = this.battleLogText.getComponent('Component.Text')
      if (textComp) (textComp as any).text = lines.join('\n')
    }

    // Show next-round button on host after a 3-second delay
    if (SessionController.getInstance().isHost()) {
      const delay = this.createEvent('DelayedCallbackEvent')
      delay.bind(() => {
        if (this.nextRoundButton) this.nextRoundButton.enabled = true
      })
      delay.reset(3.0)
    }
  }

  // ── Next round handler (all devices) ────────────────────────────────────
  private onNextRound() {
    this.log.i(`Round ${storageInt(this.roundProp, 1)} starting`)
    if (this.battleLogText) {
      const textComp = this.battleLogText.getComponent('Component.Text')
      if (textComp) (textComp as any).text = ''
    }
  }

  // ── Game over handler (all devices) ─────────────────────────────────────
  private onGameOver() {
    this.log.i('Game over')
    const humans = [...AshaPlayerState.getAll()].sort((a, b) => b.score - a.score)
    const rows: { label: string; score: number }[] = humans.map(p => ({
      label: p.displayName,
      score: p.score,
    }))
    const aiSlots = this.getAiSlotCount()
    if (humans.length === 1 && aiSlots > 0) {
      for (let i = 0; i < aiSlots; i++) {
        rows.push({
          label: `${AI_EMOJIS[i % AI_EMOJIS.length]} ${AI_NAMES[i % AI_NAMES.length]} (AI)`,
          score: this.aiScores[i] ?? 0,
        })
      }
    }
    rows.sort((a, b) => b.score - a.score)
    const medals = ['WINNER', '2nd', '3rd']
    rows.forEach((r, i) => {
      this.log.i(`${medals[i] ?? ''} ${r.label}: ${r.score} pts`)
    })
  }
}
