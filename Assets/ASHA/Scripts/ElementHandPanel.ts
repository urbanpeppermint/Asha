import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { Interactable } from 'SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable'
import { AshaGameManager } from './AshaGameManager'

const TAG = 'ElementHandPanel'

@component
export class ElementHandPanel extends BaseScriptComponent {

  @input gameManager: AshaGameManager

  @input('SceneObject[]') buttonObjects: SceneObject[] = []
  @input('SceneObject[]') cardFaceObjects: SceneObject[] = []
  @input buttonParent: SceneObject
  @input arenaOrbScript: ScriptComponent
  @input vfxScript: ScriptComponent
  @input tooltipScript: ScriptComponent

  private readonly log = new SyncKitLogger(TAG)
  private panelEnabled = false
  private activeFace = -1
  private lockedFace = -1

  onAwake() {
    this.setEnabled(false)
    this.hideAllFaces()
    if (this.gameManager) this.gameManager.registerHandPanel(this)
    this.createEvent('OnStartEvent').bind(() => this.wireHoverFromButtons())
    this.log.i('ElementHandPanel ready')
  }

  private wireHoverFromButtons() {
    if (!this.tooltipScript) return
    for (let el = 0; el < 5; el++) {
      const btn = this.buttonObjects[el]
      if (!btn) continue
      const ia = this.findInteractableInHierarchy(btn)
      if (!ia) {
        this.log.w(`No Interactable on button index ${el} — hover tooltip disabled for that card`)
        continue
      }
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

  public setEnabled(enabled: boolean) {
    const wasEnabled = this.panelEnabled
    this.panelEnabled = enabled
    if (this.buttonParent) this.buttonParent.enabled = enabled
    // New round start: clear previously locked face.
    if (enabled && !wasEnabled) {
      this.lockedFace = -1
      this.hideAllFaces()
    }
    // Panel hides right after pick; keep locked face visible until round resolves.
    if (!enabled && this.lockedFace >= 0) {
      this.showFace(this.lockedFace, true)
    } else if (!enabled) {
      this.hideAllFaces()
    }
    // Keep child button objects untouched so SIK temporary colliders survive
    // across round transitions.
    this.log.i(`Panel ${enabled ? 'shown' : 'hidden'}`)
  }

  public pickAtar()      { this.pick(0) }
  public pickAban()      { this.pick(1) }
  public pickZam()       { this.pick(2) }
  public pickVayu()      { this.pick(3) }
  public pickKhshathra() { this.pick(4) }

  // Manual fallback hover handlers (if wired from inspector events).
  public hoverAtar()      { this.showTip(0, this.buttonObjects[0]) }
  public hoverAban()      { this.showTip(1, this.buttonObjects[1]) }
  public hoverZam()       { this.showTip(2, this.buttonObjects[2]) }
  public hoverVayu()      { this.showTip(3, this.buttonObjects[3]) }
  public hoverKhshathra() { this.showTip(4, this.buttonObjects[4]) }
  public hoverEnd() {
    if (this.lockedFace >= 0) this.showFace(this.lockedFace, true)
    else this.showFace(-1)
    const tip = this.tooltipScript as any
    tip?.setFollowAnchor?.(null)
    tip?.hide?.()
  }

  private pick(elementId: number) {
    if (!this.panelEnabled) return
    if (!this.gameManager) { this.log.e('gameManager not assigned'); return }

    this.log.i(`Picked element ${elementId}`)
    this.gameManager.submitChoice(elementId)
    this.lockedFace = elementId
    this.showFace(elementId, true)

    if (this.arenaOrbScript) (this.arenaOrbScript as any).onChoiceSelected?.(elementId)
    if (this.vfxScript) (this.vfxScript as any).playSelection?.(elementId)
    this.hoverEnd()

    this.setEnabled(false)
  }

  private showTip(elementId: number, anchor?: SceneObject) {
    if (!this.panelEnabled || !this.tooltipScript) return
    if (this.lockedFace < 0) this.showFace(elementId)
    const tip = this.tooltipScript as any
    tip?.setFollowAnchor?.(anchor ?? null)
    tip?.showForElement?.(elementId, anchor ?? null)
  }

  private hideAllFaces() {
    this.activeFace = -1
    for (const o of this.cardFaceObjects) if (o) o.enabled = false
  }

  private showFace(elementId: number, forceWhenPanelHidden: boolean = false) {
    if (elementId === this.activeFace) return
    this.activeFace = elementId
    for (let i = 0; i < this.cardFaceObjects.length; i++) {
      const o = this.cardFaceObjects[i]
      if (o) o.enabled = (this.panelEnabled || forceWhenPanelHidden) && i === elementId
    }
  }
}
