import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaPlayerState } from './AshaPlayerState'

const TAG = 'ElementHandPanel'

// Element index mapping must match AshaConstants.ts order:
// 0=ATAR(Fire) 1=ABAN(Water) 2=ZAM(Earth) 3=VAYU(Wind) 4=KHSHATHRA(Metal)

@component
export class ElementHandPanel extends BaseScriptComponent {

  @input playerState: AshaPlayerState

  // Assign 5 button root SceneObjects in Inspector, index 0–4
  // Order: AtarBtn, AbanBtn, ZamBtn, VayuBtn, KshathraBtn
  @input('SceneObject[]') buttonObjects: SceneObject[] = []

  // Optional: parent that groups all buttons (toggling this shows/hides all)
  @input buttonParent: SceneObject
  @input arenaOrbScript: ScriptComponent
  @input vfxScript: ScriptComponent
  @input tooltipScript: ScriptComponent

  private readonly log = new SyncKitLogger(TAG)
  private panelEnabled = false

  onAwake() {
    this.setEnabled(false)   // hidden until 'choosing' phase
    const gm = this.playerState?.gameManager
    if (gm) gm.registerElementHandPanel(this)
    this.createEvent('OnStartEvent').bind(() => this.onStart())
  }

  private onStart() {
    this.log.i('ElementHandPanel ready')
  }

  // ── Called by AshaGameManager when phase = 'choosing' ───────────────────
  public setEnabled(enabled: boolean) {
    this.panelEnabled = enabled
    if (this.buttonParent) this.buttonParent.enabled = enabled
    this.buttonObjects.forEach(b => { if (b) b.enabled = enabled })
    this.log.i(`Panel ${enabled ? 'shown' : 'hidden'}`)
  }

  // ── Pick methods — wired to each button's triggerUpCallbacks ────────────
  // Wire in Inspector: Target = ElementHandPanel object, Function = "pickAtar" etc.
  public pickAtar()       { this.pick(0) }
  public pickAban()       { this.pick(1) }
  public pickZam()        { this.pick(2) }
  public pickVayu()       { this.pick(3) }
  public pickKhshathra()  { this.pick(4) }

  private pick(elementId: number) {
    if (!this.panelEnabled) return
    const seat = (this.playerState && this.playerState.isLocallyOwnedSeat)
      ? this.playerState
      : AshaPlayerState.getLocalOwned()

    if (!seat) {
      this.log.e('playerState not assigned in Inspector')
      return
    }

    this.log.i(`Player picked element ${elementId}`)
    seat.submitChoice(elementId)
    if (this.arenaOrbScript) {
      const orb = this.arenaOrbScript as any
      if (orb.onChoiceSelected) orb.onChoiceSelected(elementId)
    }
    if (this.vfxScript) {
      const vfx = this.vfxScript as any
      if (vfx.playSelection) vfx.playSelection(elementId)
    }
    if (this.tooltipScript) {
      const tip = this.tooltipScript as any
      if (tip.hide) tip.hide()
    }

    // Disable panel after choice — re-enabled on next round by game manager
    this.setEnabled(false)
  }
}
