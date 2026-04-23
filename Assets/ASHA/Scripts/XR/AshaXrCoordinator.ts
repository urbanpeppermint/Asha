import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaGameManager } from '../AshaGameManager'
import { resolveRound } from '../AshaResolver'
import { AshaAudio } from './AshaAudio'
import { AshaOrbVfx } from './AshaOrbVfx'
import { AshaElementTrail } from './AshaElementTrail'
import { AshaHandAura } from './AshaHandAura'
import { AshaWorldPlacement } from './AshaWorldPlacement'

const TAG = 'AshaXrCoordinator'

function st(p: any, fb: string): string {
  const v = p?.currentOrPendingValue ?? p?.currentValue
  return (v !== null && v !== undefined) ? String(v) : fb
}
function si(p: any, fb: number): number {
  const v = p?.currentOrPendingValue ?? p?.currentValue
  return (v !== null && v !== undefined) ? (v as number) : fb
}

type GmPriv = {
  phaseProp?: unknown
  roundProp?: unknown
  totalRdsProp?: unknown
  revealTrig?: unknown
  goTrig?: unknown
}

/**
 * Binds XR layers without editing AshaGameManager / ElementHandPanel.
 * Polls `phase` each frame (host local writes may not emit onRemoteChange).
 */
@component
export class AshaXrCoordinator extends BaseScriptComponent {

  @input gameManager: AshaGameManager
  @input('Component.ScriptComponent') @allowUndefined ashaAudio: ScriptComponent
  @input('Component.ScriptComponent') @allowUndefined orbVfx: ScriptComponent
  @input('Component.ScriptComponent') @allowUndefined elementTrail: ScriptComponent
  @input('Component.ScriptComponent') @allowUndefined handAura: ScriptComponent
  @input('Component.ScriptComponent') @allowUndefined worldPlacement: ScriptComponent
  @input('SceneObject') @allowUndefined cardsMenuRoot: SceneObject
  @input('Component.ScriptComponent') @allowUndefined handPanelScript: ScriptComponent
  /** Strict mode: if worldPlacement is missing, choosing is blocked. */
  @input requireWorldPlacementForChoosing: boolean = true

  private readonly log = new SyncKitLogger(TAG)
  private lastPhase = ''
  private lastRevealTrig = -1
  private lastGoTrig = -1
  private cardsGateAnnounced = false
  private lastCardsEnabled: boolean | null = null
  private missingWpWarned = false

  onAwake() {
    this.createEvent('OnStartEvent').bind(() => this.hookRevealAndMatch())
    this.createEvent('UpdateEvent').bind(() => this.pollPhase())
  }

  private gmPriv(): GmPriv {
    return this.gameManager as unknown as GmPriv
  }

  private hookRevealAndMatch() {
    const gm = this.gmPriv()
    if (!this.gameManager) {
      this.log.e('gameManager missing — XR coordinator idle')
      return
    }
    // Remote changes are still useful for non-host devices.
    // Host-local writes are handled in pollPhase/pollTriggers below.
    ;(gm.revealTrig as any)?.onRemoteChange?.add?.(() => this.onRevealRound())
    ;(gm.goTrig as any)?.onRemoteChange?.add?.(() => this.onMatchEnd())
    this.log.i('XR coordinator reveal/match hooks active')
  }

  private pollPhase() {
    if (!this.gameManager) return
    const phase = st(this.gmPriv().phaseProp, '')
    this.pollTriggers()
    this.applyCardsGate(phase)
    if (phase === this.lastPhase) return
    this.lastPhase = phase
    if (phase === 'choosing') {
      ;(this.elementTrail as unknown as AshaElementTrail | null)?.resetAll?.()
      ;(this.handAura as unknown as AshaHandAura | null)?.resetAura?.()
    }
  }

  private applyCardsGate(phase: string) {
    const hp = this.handPanelScript as unknown as { setEnabled?: (v: boolean) => void } | null
    if (!this.cardsMenuRoot && !hp) return
    if (phase !== 'choosing') {
      this.applyCardsEnabled(false, hp)
      return
    }
    const wp = this.worldPlacement as unknown as AshaWorldPlacement | null
    const hasWp = !!wp && typeof wp.isPlaced === 'function'
    const placed = hasWp ? (wp.isPlaced() === true) : !this.requireWorldPlacementForChoosing
    if (!hasWp && this.requireWorldPlacementForChoosing && !this.missingWpWarned) {
      this.missingWpWarned = true
      this.log.w('worldPlacement is not wired on XrCoordinator; choosing is blocked by strict gate')
    }
    this.applyCardsEnabled(placed, hp)
    if (!placed && !this.cardsGateAnnounced) {
      this.cardsGateAnnounced = true
      this.gameManager.showSetupHint?.('Place arena on surface first...')
    }
    if (placed && this.cardsGateAnnounced) {
      this.cardsGateAnnounced = false
      this.gameManager.showSetupHint?.('Choose your element')
    }
  }

  private applyCardsEnabled(enabled: boolean, hp: { setEnabled?: (v: boolean) => void } | null) {
    if (this.lastCardsEnabled === enabled) return
    this.lastCardsEnabled = enabled
    if (this.cardsMenuRoot) this.cardsMenuRoot.enabled = enabled
    hp?.setEnabled?.(enabled)
  }

  private pollTriggers() {
    const g = this.gmPriv()
    const revealNow = si(g.revealTrig as any, 0)
    if (revealNow !== this.lastRevealTrig) {
      if (this.lastRevealTrig >= 0) this.onRevealRound()
      this.lastRevealTrig = revealNow
    }
    const goNow = si(g.goTrig as any, 0)
    if (goNow !== this.lastGoTrig) {
      if (this.lastGoTrig >= 0) this.onMatchEnd()
      this.lastGoTrig = goNow
    }
  }

  private onRevealRound() {
    const audio = this.ashaAudio as unknown as AshaAudio | null
    const orb = this.orbVfx as unknown as AshaOrbVfx | null
    audio?.playReveal()

    const gm = this.gameManager
    const g = this.gmPriv()
    const n = gm.getSlotCount()
    const choices: number[] = []
    for (let i = 0; i < n; i++) choices.push(gm.getSlotChoice(i))
    const my = gm.getMySlot()
    const mine = my >= 0 && my < choices.length ? choices[my] : -1
    if (mine >= 0 && mine <= 4) orb?.playReveal(mine)

    const round = si(g.roundProp, 1)
    const total = si(g.totalRdsProp, 5)
    const isFinalReveal = round >= total

    if (!isFinalReveal) {
      const deltas = resolveRound(choices)
      const dMine = my >= 0 && my < deltas.length ? deltas[my] : 0
      if (dMine > 0) audio?.playRoundResult(true)
      else if (dMine < 0) audio?.playRoundResult(false)
    }

    let oi = 0
    for (let j = 0; j < n; j++) {
      if (j === my) continue
      const c = gm.getSlotChoice(j)
      if (c < 0 || c > 4) continue
      audio?.playOpponentReveal(oi, c)
      oi++
      if (oi >= 6) break
    }
  }

  private onMatchEnd() {
    const gm = this.gameManager
    const audio = this.ashaAudio as unknown as AshaAudio | null
    const n = gm.getSlotCount()
    const my = gm.getMySlot()
    let max = -999999
    for (let i = 0; i < n; i++) max = Math.max(max, gm.getSlotScore(i))
    let leaders = 0
    for (let i = 0; i < n; i++) if (gm.getSlotScore(i) === max) leaders++
    const mine = gm.getSlotScore(my)
    const wonOrTiedTop = mine === max
    audio?.playRoundResult(wonOrTiedTop)
  }
}
