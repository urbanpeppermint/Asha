import { AshaPlayerState } from './AshaPlayerState'

@component
export class AshaScoreboardUI extends BaseScriptComponent {
  @input nameTexts: SceneObject[] = []
  @input scoreTexts: SceneObject[] = []
  @input stateTexts: SceneObject[] = []

  onAwake() {
    this.createEvent('UpdateEvent').bind(() => this.refresh())
  }

  private refresh() {
    const players = AshaPlayerState.getAll()
    for (let i = 0; i < this.nameTexts.length; i++) {
      const p = players[i]
      this.setText(this.nameTexts[i], p ? `Magi ${i + 1}` : '—')
      this.setText(this.scoreTexts[i], p ? `${p.score}` : '—')
      this.setText(this.stateTexts[i], p ? (p.isReady ? '✅' : '—') : '')
    }
  }

  private setText(target: SceneObject, value: string) {
    if (!target) return
    const textComp = target.getComponent('Component.Text')
    if (textComp) (textComp as any).text = value
  }
}
