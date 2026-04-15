import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { ELEMENTS } from './AshaConstants'

const TAG = 'AshaHandTooltip'

@component
export class AshaHandTooltip extends BaseScriptComponent {
  @input tooltipRoot: SceneObject
  @input titleText: SceneObject
  @input bodyText: SceneObject

  private readonly log = new SyncKitLogger(TAG)

  onAwake() {
    this.hide()
  }

  public showForElement(elementId: number) {
    const e = ELEMENTS[elementId]
    if (!e) return
    const beats = e.beats.map(i => ELEMENTS[i].name).join(', ')
    const loses = e.loses.map(i => ELEMENTS[i].name).join(', ')

    this.setText(this.titleText, `${e.name}`)
    this.setText(this.bodyText, `▲ Beats: ${beats}\n▼ Loses: ${loses}`)
    if (this.tooltipRoot) this.tooltipRoot.enabled = true
  }

  public hide() {
    if (this.tooltipRoot) this.tooltipRoot.enabled = false
  }

  public hoverAtar() { this.showForElement(0) }
  public hoverAban() { this.showForElement(1) }
  public hoverZam() { this.showForElement(2) }
  public hoverVayu() { this.showForElement(3) }
  public hoverKhshathra() { this.showForElement(4) }

  private setText(target: SceneObject, value: string) {
    if (!target) return
    const textComp = target.getComponent('Component.Text')
    if (textComp) (textComp as any).text = value
  }
}
