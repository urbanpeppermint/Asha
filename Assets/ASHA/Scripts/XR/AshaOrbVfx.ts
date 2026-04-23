import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'

const TAG = 'AshaOrbVfx'

const ELEMENT_COLORS: vec4[] = [
  new vec4(1.0, 0.3, 0.0, 1.0),
  new vec4(0.1, 0.5, 1.0, 1.0),
  new vec4(0.45, 0.28, 0.1, 1.0),
  new vec4(0.85, 1.0, 0.5, 1.0),
  new vec4(0.75, 0.8, 0.9, 1.0),
]

/**
 * Enhancement 5 — orb burst + tint (additive). VFX SceneObjects are toggled on briefly.
 */
@component
export class AshaOrbVfx extends BaseScriptComponent {

  @input orbMeshVisual: RenderMeshVisual
  @input orbTransform: SceneObject
  @input('SceneObject[]') elementVfx: SceneObject[] = []
  @input neutralColor: vec4 = new vec4(0.5, 0.4, 0.8, 1.0)

  private readonly log = new SyncKitLogger(TAG)
  private baseScale: vec3 | null = null

  onAwake() {
    for (const v of this.elementVfx) if (v) v.enabled = false
    if (this.orbTransform) this.baseScale = this.orbTransform.getTransform().getLocalScale()
  }

  public playReveal(elementId: number) {
    if (elementId < 0 || elementId > 4) return
    this.log.i(`Orb reveal VFX element ${elementId}`)

    if (this.orbTransform && this.baseScale) {
      const tr = this.orbTransform.getTransform()
      const s0 = this.baseScale
      tr.setLocalScale(new vec3(s0.x * 1.35, s0.y * 1.35, s0.z * 1.35))
      const d = this.createEvent('DelayedCallbackEvent')
      d.bind(() => tr.setLocalScale(s0))
      d.reset(0.28)
    }

    if (this.orbMeshVisual) {
      try {
        const mat = this.orbMeshVisual.getMaterial(0)
        if (mat && mat.mainPass) mat.mainPass.baseColor = ELEMENT_COLORS[elementId]
      } catch (e) {
        this.log.w(`Orb tint skipped: ${e}`)
      }
    }

    const vfx = this.elementVfx[elementId]
    if (vfx) {
      vfx.enabled = true
      const off = this.createEvent('DelayedCallbackEvent')
      off.bind(() => { vfx.enabled = false })
      off.reset(2.0)
    }

    const revert = this.createEvent('DelayedCallbackEvent')
    revert.bind(() => {
      if (!this.orbMeshVisual) return
      try {
        const mat = this.orbMeshVisual.getMaterial(0)
        if (mat && mat.mainPass) mat.mainPass.baseColor = this.neutralColor
      } catch (_e) { /* ignore */ }
    })
    revert.reset(3.0)
  }
}
