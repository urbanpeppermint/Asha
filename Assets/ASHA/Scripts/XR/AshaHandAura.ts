import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { Interactable } from 'SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable'
import { AshaAudio } from './AshaAudio'

const TAG = 'AshaHandAura'

@component
export class AshaHandAura extends BaseScriptComponent {

  @input('SceneObject[]') auraSpheres: SceneObject[] = []
  @input('RenderMeshVisual[]') auraMaterials: RenderMeshVisual[] = []
  @input @allowUndefined auraSphere: SceneObject
  @input @allowUndefined auraMaterial: RenderMeshVisual
  @input('SceneObject[]') buttonObjects: SceneObject[] = []
  @input('Component.ScriptComponent') @allowUndefined
  ashaAudio: ScriptComponent

  // --- Floating animation settings ---
  @input floatAmplitude: number = 0.5   // how many cm up/down
  @input floatSpeed: number = 1.5       // cycles per second

  private readonly log = new SyncKitLogger(TAG)
  private hovered: number = -1

  // Store each sphere's original Y position
  private originY: Map<number, number> = new Map()
  private time: number = 0

  onAwake() {
    for (let i = 0; i < 5; i++) {
      const sphere = this.getAuraSphere(i)
      if (sphere) {
        sphere.enabled = false
        // Save the original local Y so we float relative to it
        const pos = sphere.getTransform().getLocalPosition()
        this.originY.set(i, pos.y)
      }
    }
    if (this.auraSphere) this.auraSphere.enabled = false

    this.createEvent('OnStartEvent').bind(() => this.wireHovers())

    // Update loop for floating animation
    this.createEvent('UpdateEvent').bind((e) => this.onUpdate(e))
  }

  private onUpdate(e: any) {
    const dt: number = getDeltaTime()
    this.time += dt

    // Only animate the currently hovered sphere
    if (this.hovered === -1) return

    const sphere = this.getAuraSphere(this.hovered)
    if (!sphere || !sphere.enabled) return

    const baseY = this.originY.get(this.hovered) ?? 0
    const offset = Math.sin(this.time * this.floatSpeed * Math.PI * 2) * this.floatAmplitude

    const t = sphere.getTransform()
    const pos = t.getLocalPosition()
    t.setLocalPosition(new vec3(pos.x, baseY + offset, pos.z))
  }

  private getAuraSphere(i: number): SceneObject | null {
    if (this.auraSpheres && this.auraSpheres[i]) return this.auraSpheres[i]
    return this.auraSphere ?? null
  }

  private getAuraMaterial(i: number): RenderMeshVisual | null {
    if (this.auraMaterials && this.auraMaterials[i]) return this.auraMaterials[i]
    return this.auraMaterial ?? null
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
      ia.onHoverExit.add(() => this.onHoverExit(id))
    }
    this.log.i('Hand aura hover wired')
  }

  private onHoverEnter(elementId: number) {
    if (this.hovered === elementId) return
    if (this.hovered !== -1) this.hideAura(this.hovered)

    this.hovered = elementId
    this.time = 0  // reset phase so float starts smoothly from base position

    const audio = this.ashaAudio as unknown as AshaAudio | null
    audio?.playHover()

    const sphere = this.getAuraSphere(elementId)
    if (sphere) sphere.enabled = true

    const rmv = this.getAuraMaterial(elementId)
    if (rmv) {
      try {
        const mat = rmv.getMaterial(0)
        const mp = mat as any
        if (mp?.mainPass) {
          if (mp.mainPass.emissiveStrength !== undefined) mp.mainPass.emissiveStrength = 1.2
        }
      } catch (_e) { /* ignore */ }
    }
  }

  private onHoverExit(elementId: number) {
    if (this.hovered !== elementId) return
    this.hovered = -1
    this.hideAura(elementId)
  }

  private hideAura(elementId: number) {
    // Reset sphere Y back to origin before hiding
    const sphere = this.getAuraSphere(elementId)
    if (sphere) {
      const baseY = this.originY.get(elementId) ?? 0
      const t = sphere.getTransform()
      const pos = t.getLocalPosition()
      t.setLocalPosition(new vec3(pos.x, baseY, pos.z))
      sphere.enabled = false
    }

    const rmv = this.getAuraMaterial(elementId)
    if (rmv) {
      try {
        const mat = rmv.getMaterial(0)
        const mp = mat as any
        if (mp?.mainPass?.emissiveStrength !== undefined) mp.mainPass.emissiveStrength = 0
      } catch (_e) { /* ignore */ }
    }
  }

  public resetAura() {
    if (this.hovered !== -1) this.hideAura(this.hovered)
    this.hovered = -1
  }
}