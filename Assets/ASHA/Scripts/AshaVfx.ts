@component
export class AshaVfx extends BaseScriptComponent {
  @input selectionFx: SceneObject
  @input revealFx: SceneObject

  onAwake() {
    if (this.selectionFx) this.selectionFx.enabled = false
    if (this.revealFx) this.revealFx.enabled = false
  }

  public playSelection(_elementId: number) {
    this.burst(this.selectionFx, 0.25)
  }

  public playReveal() {
    this.burst(this.revealFx, 0.4)
  }

  private burst(obj: SceneObject, secs: number) {
    if (!obj) return
    obj.enabled = true
    const d = this.createEvent('DelayedCallbackEvent')
    d.bind(() => { obj.enabled = false })
    d.reset(secs)
  }
}
