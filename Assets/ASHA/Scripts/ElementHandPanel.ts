import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaGameManager } from './AshaGameManager'

const TAG = 'ElementHandPanel'

@component
export class ElementHandPanel extends BaseScriptComponent {

  @input gameManager: AshaGameManager

  @input('SceneObject[]') buttonObjects: SceneObject[] = []
  @input buttonParent: SceneObject
  @input arenaOrbScript: ScriptComponent
  @input vfxScript: ScriptComponent
  @input tooltipScript: ScriptComponent

  private readonly log = new SyncKitLogger(TAG)
  private panelEnabled = false

  onAwake() {
    this.setEnabled(false)
    if (this.gameManager) this.gameManager.registerHandPanel(this)
    this.log.i('ElementHandPanel ready')
  }

  public setEnabled(enabled: boolean) {
    this.panelEnabled = enabled
    if (this.buttonParent) this.buttonParent.enabled = enabled
    this.buttonObjects.forEach(b => { if (b) b.enabled = enabled })
    this.log.i(`Panel ${enabled ? 'shown' : 'hidden'}`)
  }

  public pickAtar()      { this.pick(0) }
  public pickAban()      { this.pick(1) }
  public pickZam()       { this.pick(2) }
  public pickVayu()      { this.pick(3) }
  public pickKhshathra() { this.pick(4) }

  // Tooltip hover — wire each button's hoverStart to these
  public hoverAtar()      { this.showTip(0) }
  public hoverAban()      { this.showTip(1) }
  public hoverZam()       { this.showTip(2) }
  public hoverVayu()      { this.showTip(3) }
  public hoverKhshathra() { this.showTip(4) }
  public hoverEnd()       { if (this.tooltipScript) (this.tooltipScript as any).hide?.() }

  private pick(elementId: number) {
    if (!this.panelEnabled) return
    if (!this.gameManager) { this.log.e('gameManager not assigned'); return }

    this.log.i(`Picked element ${elementId}`)
    this.gameManager.submitChoice(elementId)

    if (this.arenaOrbScript) (this.arenaOrbScript as any).onChoiceSelected?.(elementId)
    if (this.vfxScript) (this.vfxScript as any).playSelection?.(elementId)
    if (this.tooltipScript) (this.tooltipScript as any).hide?.()

    this.setEnabled(false)
  }

  private showTip(elementId: number) {
    if (!this.panelEnabled || !this.tooltipScript) return
    ;(this.tooltipScript as any).showForElement?.(elementId)
  }
}
