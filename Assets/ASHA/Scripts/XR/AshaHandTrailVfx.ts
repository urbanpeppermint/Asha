import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'

const TAG = 'AshaHandTrailVfx'

/**
 * Hand trail controller for GPU particle templates.
 * Authoring pattern:
 * - provide 5 pre-colored trail objects per hand (element colors)
 * - provide 1 rainbow trail object per hand
 * - script toggles which set is visible based on game state
 */
@component
export class AshaHandTrailVfx extends BaseScriptComponent {
  @input @allowUndefined rightHandTracker: SceneObject
  @input @allowUndefined leftHandTracker: SceneObject

  /** 5 right-hand trails in element order: Atar, Aban, Zam, Vayu, Khshathra */
  @input('SceneObject[]') rightElementTrails: SceneObject[] = []
  /** 5 left-hand trails in element order: Atar, Aban, Zam, Vayu, Khshathra */
  @input('SceneObject[]') leftElementTrails: SceneObject[] = []

  /** Rainbow trails shown before local choice is made. */
  @input @allowUndefined rightRainbowTrail: SceneObject
  @input @allowUndefined leftRainbowTrail: SceneObject

  private readonly log = new SyncKitLogger(TAG)
  private mode: 'hidden' | 'rainbow' | 'element' = 'hidden'
  private selectedElement = -1
  private warnedInvalidElement = false

  onAwake() {
    this.hideAll()
    this.createEvent('UpdateEvent').bind(() => this.tickFollow())
  }

  public showRainbow() {
    if (this.mode === 'rainbow') return
    this.mode = 'rainbow'
    this.selectedElement = -1
    this.applyVisibility()
  }

  public showElement(elementId: number) {
    if (elementId < 0 || elementId > 4) {
      if (!this.warnedInvalidElement) {
        this.warnedInvalidElement = true
        this.log.w(`showElement ignored for invalid id=${elementId}`)
      }
      return
    }
    if (this.mode === 'element' && this.selectedElement === elementId) return
    this.mode = 'element'
    this.selectedElement = elementId
    this.applyVisibility()
  }

  public hideAll() {
    this.mode = 'hidden'
    this.selectedElement = -1
    this.applyVisibility()
  }

  private tickFollow() {
    this.followPair(this.rightHandTracker, this.activeRight())
    this.followPair(this.leftHandTracker, this.activeLeft())
  }

  private activeRight(): SceneObject | null {
    if (this.mode === 'rainbow') return this.rightRainbowTrail ?? null
    if (this.mode === 'element') return this.rightElementTrails[this.selectedElement] ?? null
    return null
  }

  private activeLeft(): SceneObject | null {
    if (this.mode === 'rainbow') return this.leftRainbowTrail ?? null
    if (this.mode === 'element') return this.leftElementTrails[this.selectedElement] ?? null
    return null
  }

  private followPair(tracker: SceneObject | null | undefined, trail: SceneObject | null) {
    if (!tracker || !trail || !trail.enabled) return
    const from = tracker.getTransform()
    const to = trail.getTransform()
    try {
      to.setWorldTransform(from.getWorldTransform())
    } catch (_e) {
      to.setWorldPosition(from.getWorldPosition())
    }
  }

  private applyVisibility() {
    this.setEnabledArray(this.rightElementTrails, -1)
    this.setEnabledArray(this.leftElementTrails, -1)
    if (this.rightRainbowTrail) this.rightRainbowTrail.enabled = false
    if (this.leftRainbowTrail) this.leftRainbowTrail.enabled = false

    if (this.mode === 'rainbow') {
      if (this.rightRainbowTrail) this.rightRainbowTrail.enabled = true
      if (this.leftRainbowTrail) this.leftRainbowTrail.enabled = true
      return
    }
    if (this.mode === 'element') {
      this.setEnabledArray(this.rightElementTrails, this.selectedElement)
      this.setEnabledArray(this.leftElementTrails, this.selectedElement)
    }
  }

  private setEnabledArray(arr: SceneObject[], enabledIndex: number) {
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i]
      if (!o) continue
      o.enabled = (i === enabledIndex)
    }
  }
}
