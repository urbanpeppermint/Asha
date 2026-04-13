import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaGameManager } from './AshaGameManager'

const TAG = 'AshaSoloSetupPanel'

/**
 * Shown only in phase `solo_setup` (single human in session).
 * Player picks AI opponent count (1–5) and total rounds (3/5/7/10), then confirms.
 */
@component
export class AshaSoloSetupPanel extends BaseScriptComponent {

  @input gameManager: AshaGameManager

  /** Parent object for all setup UI (title, pills, confirm). */
  @input panelRoot: SceneObject

  private readonly log = new SyncKitLogger(TAG)
  private selectedAi = -1
  private selectedRounds = 5

  onAwake() {
    if (this.panelRoot) this.panelRoot.enabled = false
    const gm = this.gameManager
    if (gm) gm.registerSoloSetupPanel(this)
  }

  public setVisible(visible: boolean) {
    if (this.panelRoot) this.panelRoot.enabled = visible
    this.log.i(`Solo setup ${visible ? 'shown' : 'hidden'}`)
  }

  // ── AI opponent count (1–5) — wire each pill’s trigger to these ─────────
  public pickAi1() { this.selectAi(1) }
  public pickAi2() { this.selectAi(2) }
  public pickAi3() { this.selectAi(3) }
  public pickAi4() { this.selectAi(4) }
  public pickAi5() { this.selectAi(5) }

  private selectAi(n: number) {
    this.selectedAi = n
    this.log.i(`Selected ${n} AI opponent(s)`)
  }

  // ── Total rounds — wire pill buttons ─────────────────────────────────────
  public pickRounds3()  { this.selectedRounds = 3 }
  public pickRounds5()  { this.selectedRounds = 5 }
  public pickRounds7()  { this.selectedRounds = 7 }
  public pickRounds10() { this.selectedRounds = 10 }

  /** Wire the main “Begin” / “Enter the Astrolabe” button here. */
  public confirmAndStart() {
    if (!this.gameManager) {
      this.log.e('gameManager not assigned')
      return
    }
    if (this.selectedAi < 1 || this.selectedAi > 5) {
      this.log.e('Pick number of AI opponents (1–5) first')
      return
    }
    this.gameManager.applySoloSetupAndStart(this.selectedAi, this.selectedRounds)
  }
}
