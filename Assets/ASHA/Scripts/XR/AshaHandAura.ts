import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { Interactable } from 'SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable'
import { AshaAudio } from './AshaAudio'

const TAG = 'AshaHandAura'

const AURA_COLORS: vec3[] = [
  new vec3(1.0, 0.3, 0.0),
  new vec3(0.1, 0.5, 1.0),
  new vec3(0.45, 0.28, 0.1),
  new vec3(0.85, 1.0, 0.5),
  new vec3(0.75, 0.8, 0.9),
]

/**
 * Enhancement 7 — hover aura on element cards (additive, local).
 * Wires SIK Interactable hover on the same buttons as ElementHandPanel.
 */
@component
export class AshaHandAura extends BaseScriptComponent {

  @input auraSphere: SceneObject
  @input auraMaterial: RenderMeshVisual
  @input('SceneObject[]') buttonObjects: SceneObject[] = []
  @input('Component.ScriptComponent') @allowUndefined
  ashaAudio: ScriptComponent

  private readonly log = new SyncKitLogger(TAG)
  private hovered: number = -1

  onAwake() {
    if (this.auraSphere) this.auraSphere.enabled = false
    this.createEvent('OnStartEvent').bind(() => this.wireHovers())
  }

  private findInteractable(root: SceneObject): Interactable | null {
    const direct = root.getComponent(Interactable.getTypeName()) as Interactable | null
    if (direct) return direct
    const cc = root.getChildrenCount()
    for (let i = 0; i < cc; i++) {
      const hit = this.findInteractable(root.getChild(i))
      if (hit) return hit
    }
    return null
  }

  private wireHovers() {
    for (let i = 0; i < 5; i++) {
      const btn = this.buttonObjects[i]
      if (!btn) continue
      const ia = this.findInteractable(btn)
      if (!ia) {
        this.log.w(`No Interactable on button ${i}`)
        continue
      }
      const id = i
      ia.onHoverEnter.add(() => this.onHoverEnter(id))
      ia.onHoverExit.add(() => this.onHoverExit())
    }
    this.log.i('Hand aura hover wired')
  }

  private onHoverEnter(elementId: number) {
    if (this.hovered === elementId) return
    this.hovered = elementId
    const audio = this.ashaAudio as unknown as AshaAudio | null
    audio?.playHover()

    const c = AURA_COLORS[elementId]
    if (this.auraSphere) this.auraSphere.enabled = true

    if (this.auraMaterial) {
      try {
        const mat = this.auraMaterial.getMaterial(0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mp = mat as any
        if (mp?.mainPass) {
          if (mp.mainPass.emissiveColor !== undefined) mp.mainPass.emissiveColor = c
          if (mp.mainPass.emissiveStrength !== undefined) mp.mainPass.emissiveStrength = 1.2
        }
      } catch (_e) { /* ignore */ }
    }
  }

  private onHoverExit() {
    this.hovered = -1
    if (this.auraMaterial) {
      try {
        const mat = this.auraMaterial.getMaterial(0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mp = mat as any
        if (mp?.mainPass?.emissiveStrength !== undefined) mp.mainPass.emissiveStrength = 0
      } catch (_e) { /* ignore */ }
    }
    if (this.auraSphere) this.auraSphere.enabled = false
  }

  public resetAura() {
    this.onHoverExit()
  }
}
