import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { Interactable } from 'SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable'
import { AshaGameManager } from './AshaGameManager'
import { resolveRound } from './AshaResolver'

const TAG = 'ElementHandPanel'
const ELEMENT_COUNT = 5

@component
export class ElementHandPanel extends BaseScriptComponent {
  @input gameManager: AshaGameManager

  @input('SceneObject[]') buttonObjects: SceneObject[] = []
  @input('SceneObject[]') cardFaceObjects: SceneObject[] = []
  @input('SceneObject[]') cardBackObjects: SceneObject[] = []
  @input('SceneObject[]') buttonLabelTexts: SceneObject[] = []

  @input buttonParent: SceneObject
  @input arenaOrbScript: ScriptComponent
  @input vfxScript: ScriptComponent
  @input tooltipScript: ScriptComponent

  @input flipDurationSec: number = 0.45
  @input winnerPulseSec: number = 1.5

  private readonly log = new SyncKitLogger(TAG)
  private panelEnabled = false
  private lockedFace = -1
  private pickPending = false
  private revealApplied = false
  private revealPulseStarted = false

  private baseRotations: (quat | null)[] = []
  private defaultLabels: string[] = []

  private flipActive: boolean[] = []
  private flipElapsed: number[] = []
  private flipSwapped: boolean[] = []

  onAwake() {
    this.cacheBaseRotations()
    this.cacheDefaultLabels()

    for (let i = 0; i < ELEMENT_COUNT; i++) {
      this.flipActive[i] = false
      this.flipElapsed[i] = 0
      this.flipSwapped[i] = false
    }

    this.setAllFaces(false)
    this.setAllBacks(false)
    this.panelEnabled = false
    if (this.buttonParent) this.buttonParent.enabled = false

    if (this.gameManager) this.gameManager.registerHandPanel(this)
    this.createEvent('OnStartEvent').bind(() => this.wireHoverFromButtons())
    this.createEvent('UpdateEvent').bind(() => this.tickAll())
    this.log.i('ElementHandPanel ready')
  }

  // ───────────── Public API ─────────────

  /** GameManager calls setEnabled(true) when phase becomes "choosing", false otherwise. */
  public setEnabled(enabled: boolean) {
    const wasEnabled = this.panelEnabled
    this.panelEnabled = enabled

    // buttonParent visibility is now phase-driven (see tickAll); do not toggle here.
    if (enabled && !wasEnabled) {
      this.lockedFace = -1
      this.pickPending = false
      this.revealApplied = false
      this.revealPulseStarted = false
      for (let i = 0; i < ELEMENT_COUNT; i++) {
        this.flipActive[i] = false
        this.flipElapsed[i] = 0
        this.flipSwapped[i] = false
      }
      this.resetButtonRotations()
      this.setAllFaces(true)
      this.setAllBacks(false)
      this.restoreDefaultLabels()
    }

    this.log.i(`Panel ${enabled ? 'shown' : 'hidden'}`)
  }

  public pickAtar() { this.pick(0) }
  public pickAban() { this.pick(1) }
  public pickZam() { this.pick(2) }
  public pickVayu() { this.pick(3) }
  public pickKhshathra() { this.pick(4) }

  public hoverAtar() { this.showTip(0, this.buttonObjects[0]) }
  public hoverAban() { this.showTip(1, this.buttonObjects[1]) }
  public hoverZam() { this.showTip(2, this.buttonObjects[2]) }
  public hoverVayu() { this.showTip(3, this.buttonObjects[3]) }
  public hoverKhshathra() { this.showTip(4, this.buttonObjects[4]) }
  public hoverEnd() {
    const tip = this.tooltipScript as any
    tip?.setFollowAnchor?.(null)
    tip?.hide?.()
  }

  // ───────────── Pick flow ─────────────

  private pick(elementId: number) {
    if (!this.panelEnabled || this.pickPending) return
    if (!this.gameManager) {
      this.log.e('gameManager not assigned')
      return
    }

    this.pickPending = true
    this.lockedFace = elementId
    this.log.i(`Picked element ${elementId}`)

    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const f = this.cardFaceObjects[i]
      const b = this.cardBackObjects[i]
      if (i === elementId) {
        if (f) f.enabled = true
        if (b) b.enabled = false
        this.flipActive[i] = false
      } else {
        if (f) f.enabled = true
        if (b) b.enabled = false
        this.flipActive[i] = true
        this.flipElapsed[i] = 0
        this.flipSwapped[i] = false
      }
    }

    if (this.arenaOrbScript) (this.arenaOrbScript as any).onChoiceSelected?.(elementId)
    if (this.vfxScript) (this.vfxScript as any).playSelection?.(elementId)
    this.hoverEnd()
    this.gameManager.submitChoice(elementId)

    // Lock further input but keep visuals visible.
    this.panelEnabled = false
  }

  // ───────────── Per-frame logic ─────────────

  private tickAll() {
    if (!this.gameManager) return

    const phase = this.getPhase()
    const visiblePhases = (phase === 'choosing' || phase === 'resolving' || phase === 'reveal')
    if (this.buttonParent && this.buttonParent.enabled !== visiblePhases) {
      this.buttonParent.enabled = visiblePhases
    }

    this.tickFlip()

    if (phase === 'reveal' && !this.revealApplied) {
      this.applyRevealCardState()
    }
  }

  private tickFlip() {
    const dur = Math.max(0.05, this.flipDurationSec)
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      if (!this.flipActive[i]) continue

      this.flipElapsed[i] += getDeltaTime()
      const t = Math.min(1, this.flipElapsed[i]! / dur)

      const btn = this.buttonObjects[i]
      const base = this.baseRotations[i]
      if (btn && base) {
        // 0 → 90° → 0° around X-axis (card flips up, returns to base).
        const phase01 = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5)
        const angleRad = phase01 * (Math.PI / 2)
        btn.getTransform().setLocalRotation(base.multiply(quat.angleAxis(angleRad, vec3.right())))
      }

      if (!this.flipSwapped[i] && t >= 0.5) {
        const f = this.cardFaceObjects[i]
        const b = this.cardBackObjects[i]
        if (f) f.enabled = false
        if (b) b.enabled = true
        this.flipSwapped[i] = true
      }

      if (t >= 1) {
        this.flipActive[i] = false
        if (btn && base) btn.getTransform().setLocalRotation(base)
      }
    }
  }

  // ───────────── Reveal ─────────────

  private applyRevealCardState() {
    const n = this.gameManager.getSlotCount()
    if (n <= 0) return

    const choices: number[] = []
    const chooserByElement: string[][] = [[], [], [], [], []]
    for (let i = 0; i < n; i++) {
      const c = this.gameManager.getSlotChoice(i)
      if (c < 0 || c > 4) return
      choices.push(c)
      const name = this.gameManager.getSlotName(i) || `Slot ${i + 1}`
      chooserByElement[c]!.push(name)
    }

    this.revealApplied = true

    for (let i = 0; i < ELEMENT_COUNT; i++) {
      this.flipActive[i] = false
      this.flipElapsed[i] = 0
      this.flipSwapped[i] = false
      const btn = this.buttonObjects[i]
      const base = this.baseRotations[i]
      if (btn && base) btn.getTransform().setLocalRotation(base)
    }

    for (let e = 0; e < ELEMENT_COUNT; e++) {
      const wasChosen = chooserByElement[e]!.length > 0
      const f = this.cardFaceObjects[e]
      const b = this.cardBackObjects[e]
      if (f) f.enabled = wasChosen
      if (b) b.enabled = !wasChosen
      this.setLabel(e, wasChosen ? chooserByElement[e]!.join(' • ') : '')
    }

    if (this.revealPulseStarted) return
    this.revealPulseStarted = true

    const deltas = resolveRound(choices)
    let max = -Infinity
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i] as number
      if (d > max) max = d
    }
    const winnerElements: boolean[] = [false, false, false, false, false]
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i] as number
      if (d === max && d > 0) winnerElements[choices[i]!] = true
    }
    this.pulseWinnerButtons(winnerElements, this.winnerPulseSec)
    if (this.vfxScript) (this.vfxScript as any).playReveal?.()
  }

  private pulseWinnerButtons(winnerElements: boolean[], secs: number) {
    const targets: SceneObject[] = []
    const startScales: vec3[] = []
    for (let e = 0; e < this.buttonObjects.length; e++) {
      if (!winnerElements[e]) continue
      const btn = this.buttonObjects[e]
      if (!btn) continue
      targets.push(btn)
      startScales.push(btn.getTransform().getLocalScale())
    }
    if (targets.length === 0) return

    let elapsed = 0
    const up = this.createEvent('UpdateEvent')
    up.bind(() => {
      elapsed += getDeltaTime()
      const t = Math.min(1, elapsed / Math.max(0.1, secs))
      const beat = 1 + Math.sin(t * Math.PI * 6) * 0.12
      for (let i = 0; i < targets.length; i++) {
        const base = startScales[i]!
        targets[i]!.getTransform().setLocalScale(new vec3(base.x * beat, base.y * beat, base.z * beat))
      }
      if (t >= 1) {
        for (let i = 0; i < targets.length; i++) {
          targets[i]!.getTransform().setLocalScale(startScales[i]!)
        }
        up.enabled = false
      }
    })
  }

  // ───────────── Helpers ─────────────

  private setAllFaces(on: boolean) {
    for (const o of this.cardFaceObjects) if (o) o.enabled = on
  }

  private setAllBacks(on: boolean) {
    for (const o of this.cardBackObjects) if (o) o.enabled = on
  }

  private cacheBaseRotations() {
    this.baseRotations = []
    for (let i = 0; i < this.buttonObjects.length; i++) {
      const btn = this.buttonObjects[i]
      this.baseRotations[i] = btn ? btn.getTransform().getLocalRotation() : null
    }
  }

  private resetButtonRotations() {
    for (let i = 0; i < this.buttonObjects.length; i++) {
      const btn = this.buttonObjects[i]
      const base = this.baseRotations[i]
      if (btn && base) btn.getTransform().setLocalRotation(base)
    }
  }

  private cacheDefaultLabels() {
    this.defaultLabels = []
    for (let i = 0; i < this.buttonLabelTexts.length; i++) {
      const so = this.buttonLabelTexts[i]
      const t = so?.getComponent('Component.Text') as any
      this.defaultLabels[i] = (t?.text as string) ?? ''
    }
  }

  private restoreDefaultLabels() {
    for (let i = 0; i < this.buttonLabelTexts.length; i++) {
      this.setLabel(i, this.defaultLabels[i] ?? '')
    }
  }

  private setLabel(i: number, v: string) {
    const so = this.buttonLabelTexts[i]
    if (!so) return
    const t = so.getComponent('Component.Text') as any
    if (t) t.text = v
  }

  private getPhase(): string {
    const gm: any = this.gameManager as any
    const p = gm?.phaseProp
    const v = p?.currentOrPendingValue ?? p?.currentValue
    return (v !== null && v !== undefined) ? String(v) : ''
  }

  private wireHoverFromButtons() {
    for (let el = 0; el < ELEMENT_COUNT; el++) {
      const btn = this.buttonObjects[el]
      if (!btn) continue
      const ia = this.findInteractableInHierarchy(btn)
      if (!ia) {
        this.log.w(`No Interactable on button index ${el} — hover tooltip disabled for that card`)
        continue
      }
      if (!this.tooltipScript) continue
      ia.onHoverEnter.add(() => this.showTip(el, btn))
      ia.onHoverExit.add(() => this.hoverEnd())
    }
  }

  private findInteractableInHierarchy(root: SceneObject): Interactable | null {
    const direct = root.getComponent(Interactable.getTypeName()) as Interactable | null
    if (direct) return direct
    const cc = root.getChildrenCount()
    for (let i = 0; i < cc; i++) {
      const child = root.getChild(i)
      const hit = this.findInteractableInHierarchy(child)
      if (hit) return hit
    }
    return null
  }

  private showTip(elementId: number, anchor?: SceneObject) {
    if (!this.panelEnabled || !this.tooltipScript) return
    const tip = this.tooltipScript as any
    tip?.setFollowAnchor?.(anchor ?? null)
    tip?.showForElement?.(elementId, anchor ?? null)
  }
}
