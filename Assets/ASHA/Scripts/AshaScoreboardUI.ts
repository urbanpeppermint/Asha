import { AshaGameManager } from './AshaGameManager'
import { ELEMENTS } from './AshaConstants'

@component
export class AshaScoreboardUI extends BaseScriptComponent {
  @input gameManager: AshaGameManager
  @input nameTexts: SceneObject[] = []
  @input scoreTexts: SceneObject[] = []
  @input stateTexts: SceneObject[] = []

  onAwake() {
    this.createEvent('UpdateEvent').bind(() => this.refresh())
  }

  private refresh() {
    if (!this.gameManager) return
    const count = this.gameManager.getSlotCount()
    for (let i = 0; i < this.nameTexts.length; i++) {
      if (i < count) {
        const name = this.gameManager.getSlotName(i) || `Magi ${i + 1}`
        const score = this.gameManager.getSlotScore(i)
        const choice = this.gameManager.getSlotChoice(i)
        this.setText(this.nameTexts[i], name)
        this.setText(this.scoreTexts[i], `${score}`)
        this.setText(this.stateTexts[i], choice >= 0 ? ELEMENTS[choice].emoji : '—')
      } else {
        this.setText(this.nameTexts[i], '—')
        this.setText(this.scoreTexts[i], '—')
        this.setText(this.stateTexts[i], '')
      }
    }
  }

  private setText(target: SceneObject, value: string) {
    if (!target) return
    const t = target.getComponent('Component.Text')
    if (t) (t as any).text = value
  }
}
