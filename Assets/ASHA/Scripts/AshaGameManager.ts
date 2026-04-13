import { SyncEntity } from 'SpectaclesSyncKit.lspkg/Core/SyncEntity'
import { StorageProperty } from 'SpectaclesSyncKit.lspkg/Core/StorageProperty'
import { StoragePropertySet } from 'SpectaclesSyncKit.lspkg/Core/StoragePropertySet'
import { SessionController } from 'SpectaclesSyncKit.lspkg/Core/SessionController'
import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaPlayerState } from './AshaPlayerState'
import { resolveRound, getVerb } from './AshaResolver'
import { ELEMENTS, MATRIX } from './AshaConstants'

const TAG = 'AshaGameManager'

type HandPanelLike = { setEnabled(enabled: boolean): void }

@component
export class AshaGameManager extends BaseScriptComponent {

  // Inspector-assigned references
  @input nextRoundButton: SceneObject   // disabled until host sees reveal
  @input battleLogText: SceneObject     // Text3D for battle log display

  // ── Shared state (unowned — any player can write) ──────────────────────
  private phaseProp        = StorageProperty.manualString('ashaPhase', 'waiting')
  private roundProp        = StorageProperty.manualInt('ashaRound', 1)
  private totalRoundsProp  = StorageProperty.manualInt('ashaTotalRounds', 5)

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

  onAwake() {
    this.syncEntity = new SyncEntity(
      this,
      new StoragePropertySet([
        this.phaseProp,
        this.roundProp,
        this.totalRoundsProp,
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
    // If host already advanced to choosing before this panel registered, show it now.
    if (this.isReady && this.phaseProp.currentValue === 'choosing') {
      panel.setEnabled(true)
    }
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
      this.log.i('Host: starting game, phase → choosing')
      this.phaseProp.setPendingValue('choosing')
      this.onPhaseChanged('choosing')   // ← must call directly; host won't receive its own onRemoteChange
    }
  }

  // ── Called by AshaPlayerState.submitChoice (after local readyProp set) ──
  public checkAllChosen() {
    if (!this.isReady) return
    if (!SessionController.getInstance().isHost()) return

    const players = AshaPlayerState.getAll()
    if (players.length === 0) return

    const allReady = players.every(p => p.isReady)
    if (!allReady) {
      const readyCount = players.filter(p => p.isReady).length
      this.log.i(`Waiting: ${readyCount}/${players.length} ready`)
      return
    }

    this.log.i('All players chosen — resolving round')
    const choices  = players.map(p => p.choice)
    const deltas   = resolveRound(choices)

    // Apply score deltas (each player handles their own via doIOwnStore guard)
    players.forEach((p, i) => p.applyDelta(deltas[i]))

    // Fire reveal trigger — increment so remote devices see onRemoteChange
    this.revealTrigger.setPendingValue(this.revealTrigger.currentValue + 1)
    this.phaseProp.setPendingValue('reveal')

    // ← call directly on host; host won't receive its own onRemoteChange
    this.onReveal()
    this.onPhaseChanged('reveal')
  }

  // ── Called by host button after reveal ─────────────────────────────────
  public advanceToNextRound() {
    if (!this.isReady) return
    if (!SessionController.getInstance().isHost()) return

    if (this.nextRoundButton) this.nextRoundButton.enabled = false

    const next = this.roundProp.currentValue + 1   // currentValue is a getter, no ()

    if (next > this.totalRoundsProp.currentValue) {
      this.log.i('Final round complete — game over')
      this.gameOverTrigger.setPendingValue(this.gameOverTrigger.currentValue + 1)
      this.phaseProp.setPendingValue('gameover')
      this.onGameOver()           // ← direct call on host
      this.onPhaseChanged('gameover')
    } else {
      this.log.i(`Advancing to round ${next}`)
      this.roundProp.setPendingValue(next)
      this.nextRoundTrigger.setPendingValue(this.nextRoundTrigger.currentValue + 1)
      this.phaseProp.setPendingValue('choosing')
      this.onNextRound()          // ← direct call on host
      this.onPhaseChanged('choosing')
    }
  }

  // ── Phase handler (all devices) ─────────────────────────────────────────
  private onPhaseChanged(phase: string) {
    this.log.i(`Phase → ${phase}`)

    if (phase === 'choosing') {
      // Reset all locally-owned player states for new round
      AshaPlayerState.getAll().forEach(p => p.resetForRound())
      if (this.elementHandPanel) this.elementHandPanel.setEnabled(true)
    } else {
      if (this.elementHandPanel) this.elementHandPanel.setEnabled(false)
    }

    if (phase === 'reveal') {
      // Battle log is populated in onReveal()
    }
  }

  // ── Reveal handler (all devices) ────────────────────────────────────────
  private onReveal() {
    this.log.i('Reveal fired')

    const players = AshaPlayerState.getAll()

    // Build battle log text
    const lines: string[] = []
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const ci = players[i].choice
        const cj = players[j].choice
        if (ci === -1 || cj === -1) continue

        const r = MATRIX[ci][cj]

        if (r === 0) {
          lines.push(`${ELEMENTS[ci].emoji} ${players[i].displayName} & ${players[j].displayName}: draw`)
        } else if (r === 1) {
          lines.push(`${ELEMENTS[ci].emoji} ${players[i].displayName} ${getVerb(ci, cj)} ${players[j].displayName}`)
        } else {
          lines.push(`${ELEMENTS[cj].emoji} ${players[j].displayName} ${getVerb(cj, ci)} ${players[i].displayName}`)
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
    this.log.i(`Round ${this.roundProp.currentValue} starting`)
    if (this.battleLogText) {
      const textComp = this.battleLogText.getComponent('Component.Text')
      if (textComp) (textComp as any).text = ''
    }
  }

  // ── Game over handler (all devices) ─────────────────────────────────────
  private onGameOver() {
    this.log.i('Game over')
    const sorted = [...AshaPlayerState.getAll()].sort((a, b) => b.score - a.score)
    const medals = ['WINNER', '2nd', '3rd']
    sorted.forEach((p, i) => {
      this.log.i(`${medals[i] ?? ''} ${p.displayName}: ${p.score} pts`)
    })
  }
}
