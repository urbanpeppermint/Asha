import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { ELEMENTS } from './AshaConstants'

const TAG = 'AshaHandTooltip'

@component
export class AshaHandTooltip extends BaseScriptComponent {
  @input tooltipRoot: SceneObject
  @input titleText: SceneObject
  @input bodyText: SceneObject
  @input followOffsetY: number = 0.12

  private readonly log = new SyncKitLogger(TAG)
  private followAnchor: SceneObject | null = null

  onAwake() {
    this.hide()
    this.createEvent('UpdateEvent').bind(() => this.tickFollow())
  }

  public setFollowAnchor(anchor: SceneObject | null) {
    this.followAnchor = anchor
  }

  public showForElement(elementId: number, anchor?: SceneObject) {
    const e = ELEMENTS[elementId]
    if (!e) return
    const beats = e.beats.map(i => ELEMENTS[i].name).join(', ')
    const loses = e.loses.map(i => ELEMENTS[i].name).join(', ')

    this.setText(this.titleText, `${e.name}`)
    this.setText(this.bodyText, `${e.type}
▲ Beats: ${beats}
▼ Loses: ${loses}`)
    this.followAnchor = anchor ?? null
    if (this.tooltipRoot) this.tooltipRoot.enabled = true
  }

  public hide() {
    this.followAnchor = null
    if (this.tooltipRoot) this.tooltipRoot.enabled = false
  }

  public hoverAtar() { this.showForElement(0) }
  public hoverAban() { this.showForElement(1) }
  public hoverZam() { this.showForElement(2) }
  public hoverVayu() { this.showForElement(3) }
  public hoverKhshathra() { this.showForElement(4) }

  private tickFollow() {
    if (!this.tooltipRoot || !this.tooltipRoot.enabled || !this.followAnchor) return
    const p = this.followAnchor.getTransform().getWorldPosition()
    const t = this.tooltipRoot.getTransform()
    t.setWorldPosition(new vec3(p.x, p.y + this.followOffsetY, p.z))
  }

  private setText(target: SceneObject, value: string) {
    if (!target) return
    const textComp = target.getComponent('Component.Text')
    if (textComp) (textComp as any).text = value
  }
}
