import { AshaAudio } from './AshaAudio'
import { AshaElementTrail } from './AshaElementTrail'

/**
 * Local-only feedback on element pick (additive).
 * Wire PinchButton `triggerUp` **in addition** to ElementHandPanel so you do not
 * need to modify ElementHandPanel.ts — duplicate callbacks in the Inspector.
 */
@component
export class AshaXrPickFeedback extends BaseScriptComponent {

  @input('Component.ScriptComponent') @allowUndefined ashaAudio: ScriptComponent
  @input('Component.ScriptComponent') @allowUndefined elementTrail: ScriptComponent

  public feedbackAtar() { this.fire(0) }
  public feedbackAban() { this.fire(1) }
  public feedbackZam() { this.fire(2) }
  public feedbackVayu() { this.fire(3) }
  public feedbackKhshathra() { this.fire(4) }

  private fire(elementId: number) {
    const audio = this.ashaAudio as unknown as AshaAudio | null
    const trail = this.elementTrail as unknown as AshaElementTrail | null
    audio?.playElementPick(elementId)
    trail?.playTrail(elementId)
  }
}
