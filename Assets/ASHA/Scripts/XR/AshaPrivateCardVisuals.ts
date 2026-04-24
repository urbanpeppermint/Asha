import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaGameManager } from '../AshaGameManager'

const TAG = 'AshaPrivateCardVisuals'

type GmPriv = {
  phaseProp?: unknown
}

function sStr(p: any, fb: string): string {
  const v = p?.currentOrPendingValue ?? p?.currentValue
  return (v !== null && v !== undefined) ? String(v) : fb
}

/**
 * Local-only card presentation layer:
 * - local user sees their own card faces on the 5 element buttons
 * - opponent side is represented as floating "card back" objects
 * - once all choices are locked, everything hides
 */
@component
export class AshaPrivateCardVisuals extends BaseScriptComponent {
  @input gameManager: AshaGameManager

  /** Optional face objects mapped to the 5 local buttons (ATAR..KHSHATHRA). */
  @input('SceneObject[]') localFaceObjects: SceneObject[] = []

  /** Optional card-back objects shown for non-local players while choosing. */
  @input('SceneObject[]') opponentBackObjects: SceneObject[] = []

  /** Optional anchor objects for opponent backs (same count/order as backs). */
  @input('SceneObject[]') backAnchors: SceneObject[] = []

  /** If true, hide face/back visuals once all slots have submitted a choice. */
  @input hideWhenAllChosen: boolean = true
  /** Keep local face visible after local pick until round resolution. */
  @input keepLocalFaceAfterChoice: boolean = true

  @input floatAmplitudeCm: number = 2.5
  @input floatSpeedHz: number = 0.8

  private readonly log = new SyncKitLogger(TAG)
  private t = 0
  private wasVisible = false
  private baseBackLocalPos: vec3[] = []
  private setupLogged = false

  onAwake() {
    this.autoFillBackObjectsFromAnchors()
    for (const o of this.localFaceObjects) if (o) o.enabled = false
    for (const o of this.opponentBackObjects) if (o) o.enabled = false
    this.cacheBackBases()
    this.createEvent('UpdateEvent').bind(() => this.tick())
    this.logSetupOnce()
  }

  private gmPriv(): GmPriv {
    return this.gameManager as unknown as GmPriv
  }

  private tick() {
    if (!this.gameManager) return
    const phase = sStr(this.gmPriv().phaseProp, '')
    if (phase !== 'choosing') {
      this.setAllHidden()
      return
    }

    const n = this.gameManager.getSlotCount()
    if (n <= 0) {
      this.setAllHidden()
      return
    }
    const mySlot = this.gameManager.getMySlot()
    const myChosen = mySlot >= 0 ? this.gameManager.getSlotChoice(mySlot) >= 0 : false

    let allChosen = true
    for (let i = 0; i < n; i++) {
      if (this.gameManager.getSlotChoice(i) < 0) {
        allChosen = false
        break
      }
    }
    if (this.hideWhenAllChosen && allChosen) {
      this.setAllHidden()
      return
    }

    // Local faces can persist after local pick until all are ready/reveal.
    const showLocalFaces = this.keepLocalFaceAfterChoice ? true : !myChosen
    for (const o of this.localFaceObjects) if (o) o.enabled = showLocalFaces

    // Opponent backs: one per non-local unresolved slot (up to object count).
    let backIdx = 0
    for (let slot = 0; slot < n && backIdx < this.opponentBackObjects.length; slot++) {
      if (slot === mySlot) continue
      const unresolved = this.gameManager.getSlotChoice(slot) < 0
      const back = this.opponentBackObjects[backIdx]
      if (back) {
        back.enabled = unresolved
        if (unresolved) this.animateBack(backIdx, back)
      }
      backIdx++
    }
    for (; backIdx < this.opponentBackObjects.length; backIdx++) {
      const back = this.opponentBackObjects[backIdx]
      if (back) back.enabled = false
    }

    const nowVisible = showLocalFaces || this.anyBackVisible()
    if (nowVisible && !this.wasVisible) this.log.i('Private card visuals active')
    this.wasVisible = nowVisible
  }

  private anyBackVisible(): boolean {
    for (const b of this.opponentBackObjects) {
      if (b && b.enabled) return true
    }
    return false
  }

  private setAllHidden() {
    for (const o of this.localFaceObjects) if (o) o.enabled = false
    for (const o of this.opponentBackObjects) if (o) o.enabled = false
    this.wasVisible = false
  }

  private cacheBackBases() {
    this.baseBackLocalPos = []
    for (let i = 0; i < this.opponentBackObjects.length; i++) {
      const b = this.opponentBackObjects[i]
      if (!b) {
        this.baseBackLocalPos.push(vec3.zero())
        continue
      }
      const anchor = this.backAnchors[i]
      if (anchor) {
        const p = anchor.getTransform().getWorldPosition()
        b.getTransform().setWorldPosition(p)
      }
      this.baseBackLocalPos.push(b.getTransform().getLocalPosition())
    }
  }

  /** Convenience: if opponentBackObjects is empty, use first child under each anchor. */
  private autoFillBackObjectsFromAnchors() {
    let hasExplicitBack = false
    for (const b of this.opponentBackObjects) {
      if (b) { hasExplicitBack = true; break }
    }
    if (hasExplicitBack) return

    const filled: SceneObject[] = []
    for (const anchor of this.backAnchors) {
      if (!anchor) continue
      if (anchor.getChildrenCount() > 0) {
        const child = anchor.getChild(0)
        if (child) filled.push(child)
      }
    }
    if (filled.length > 0) {
      this.opponentBackObjects = filled
    }
  }

  private logSetupOnce() {
    if (this.setupLogged) return
    this.setupLogged = true
    const f = this.localFaceObjects.filter(Boolean).length
    const b = this.opponentBackObjects.filter(Boolean).length
    const a = this.backAnchors.filter(Boolean).length
    this.log.i(`PrivateCardVisuals wiring: faces=${f}, backs=${b}, anchors=${a}`)
  }

  private animateBack(i: number, back: SceneObject) {
    this.t += getDeltaTime()
    const base = this.baseBackLocalPos[i] ?? back.getTransform().getLocalPosition()
    const y = base.y + Math.sin((this.t + i * 0.35) * Math.PI * 2 * this.floatSpeedHz) * this.floatAmplitudeCm
    back.getTransform().setLocalPosition(new vec3(base.x, y, base.z))
  }
}

