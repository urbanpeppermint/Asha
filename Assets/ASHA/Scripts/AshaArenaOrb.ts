import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { ELEMENTS } from './AshaConstants'

const TAG = 'AshaArenaOrb'

@component
export class AshaArenaOrb extends BaseScriptComponent {
  @input orbText: SceneObject
  @input orbRoot: SceneObject
  @input keepOrbChildrenEnabledOnStart: boolean = true

  private readonly log = new SyncKitLogger(TAG)

  onAwake() {
    this.resetOrb()
  }

  public onChoiceSelected(elementId: number) {
    const e = ELEMENTS[elementId]
    if (!e) return
    this.setText(this.orbText, e.emoji)
    this.pulse()
  }

  public onReveal() {
    this.pulse()
  }

  public onRoundReset() {
    this.resetOrb()
  }

  private resetOrb() {
    if (this.orbRoot && this.keepOrbChildrenEnabledOnStart) {
      this.orbRoot.enabled = true
      const cc = this.orbRoot.getChildrenCount()
      for (let i = 0; i < cc; i++) {
        const child = this.orbRoot.getChild(i)
        if (child) child.enabled = true
      }
    }
    this.setText(this.orbText, '🌐')
  }

  private pulse() {
    if (!this.orbRoot) return
    const tr = this.orbRoot.getTransform()
    const s = tr.getLocalScale()
    tr.setLocalScale(new vec3(s.x * 1.1, s.y * 1.1, s.z * 1.1))
    const d = this.createEvent('DelayedCallbackEvent')
    d.bind(() => tr.setLocalScale(s))
    d.reset(0.12)
  }

  private setText(target: SceneObject, value: string) {
    if (!target) return
    const textComp = target.getComponent('Component.Text')
    if (textComp) (textComp as any).text = value
  }
}
