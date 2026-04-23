import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'

const TAG = 'AshaElementTrail'

/**
 * Enhancement 2 — local-only element trails (additive).
 * Five optional template SceneObjects (disabled in scene). While active, the
 * chosen template follows `dominantHand` each frame (no network sync).
 */
@component
export class AshaElementTrail extends BaseScriptComponent {

  @input('SceneObject[]') trailTemplates: SceneObject[] = []
  @input dominantHand: SceneObject

  private readonly log = new SyncKitLogger(TAG)
  private active: SceneObject | null = null
  private following = false

  onAwake() {
    this.createEvent('UpdateEvent').bind(() => this.tickFollow())
  }

  private tickFollow() {
    if (!this.following || !this.active || !this.dominantHand) return
    const ht = this.dominantHand.getTransform()
    const at = this.active.getTransform()
    try {
      at.setWorldTransform(ht.getWorldTransform())
    } catch (_e) {
      at.setWorldPosition(ht.getWorldPosition())
    }
  }

  public playTrail(elementId: number) {
    this.stopTrail()
    const tpl = this.trailTemplates[elementId]
    if (!tpl || !this.dominantHand) {
      this.log.w(`Trail missing for element ${elementId}`)
      return
    }
    tpl.enabled = true
    this.active = tpl
    this.following = true
    this.tickFollow()
    this.log.i(`Trail started for element ${elementId}`)

    const stop = this.createEvent('DelayedCallbackEvent')
    stop.bind(() => this.stopTrail())
    stop.reset(3.0)
  }

  public stopTrail() {
    this.following = false
    if (this.active) {
      this.active.enabled = false
      this.active = null
    }
  }

  public resetAll() {
    this.stopTrail()
  }
}
