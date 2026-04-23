import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { SessionController } from 'SpectaclesSyncKit.lspkg/Core/SessionController'
import { AshaGameManager } from './AshaGameManager'

const TAG = 'AshaSoloSetupPanel'

/**
 * Unified pre-game setup panel.
 *
 * Solo: local player picks AI + rounds, then **Confirm** (`confirmAndStart`).
 * Multiplayer: **only the host** picks rounds; choice syncs to others for display.
 * **Confirm** starts the match (host only in MP). **Next** on the last reveal
 * is separate — it returns to this setup (see `AshaGameManager`).
 *
 * Scene wiring:
 *   panelRoot    → parent holding the entire setup UI (title, pills, Confirm).
 *   aiRow        → optional parent of the AI count pills — hidden in MP mode.
 *   beginButton  → optional; disabled for non-host in MP (round pills are host-only too).
 */
@component
export class AshaSoloSetupPanel extends BaseScriptComponent {

  @input gameManager: AshaGameManager

  @input panelRoot: SceneObject

  @input('SceneObject') @allowUndefined aiRow: SceneObject

  @input('SceneObject') @allowUndefined beginButton: SceneObject

  private readonly log = new SyncKitLogger(TAG)
  private selectedAi = -1
  private selectedRounds = -1
  private mode: 'solo' | 'mp' = 'solo'

  onAwake() {
    if (this.panelRoot) this.panelRoot.enabled = false
    const gm = this.gameManager
    if (gm) gm.registerSetupPanel(this)
  }

  /**
   * Called by AshaGameManager whenever phase transitions in/out of
   * solo_setup or mp_setup.
   */
  public setVisible(visible: boolean, mode: 'solo' | 'mp' = 'solo') {
    this.mode = mode

    if (this.panelRoot) this.panelRoot.enabled = visible

    if (this.aiRow) this.aiRow.enabled = visible && mode === 'solo'

    if (visible) {
      this.selectedAi = -1
      this.selectedRounds = -1

      if (this.beginButton) {
        const isHost = SessionController.getInstance().isHost()
        this.beginButton.enabled = mode === 'solo' ? true : isHost
      }
    }

    this.log.i(`Setup (${mode}) ${visible ? 'shown' : 'hidden'}`)
  }

  public pickAi1() { this.selectAi(1) }
  public pickAi2() { this.selectAi(2) }
  public pickAi3() { this.selectAi(3) }
  public pickAi4() { this.selectAi(4) }
  public pickAi5() { this.selectAi(5) }

  private selectAi(n: number) {
    if (this.mode !== 'solo') return
    this.selectedAi = n
    this.log.i(`Selected ${n} AI opponent(s)`)
  }

  public pickRounds3()  { this.selectRounds(3) }
  public pickRounds5()  { this.selectRounds(5) }
  public pickRounds7()  { this.selectRounds(7) }
  public pickRounds10() { this.selectRounds(10) }

  private selectRounds(n: number) {
    if (this.mode === 'mp') {
      if (!SessionController.getInstance().isHost()) return
      this.selectedRounds = n
      if (this.gameManager) this.gameManager.hostProposeMpRounds(n)
      this.log.i(`Host selected ${n} rounds`)
      return
    }
    this.selectedRounds = n
    this.log.i(`Selected ${n} rounds`)
  }

  /** MP: mirrored host round choice so clients see the same count (display only). */
  public applyMirroredHostRounds(n: number) {
    if (this.mode !== 'mp') return
    if (n === 3 || n === 5 || n === 7 || n === 10) {
      this.selectedRounds = n
      this.log.i(`Host rounds (synced): ${n}`)
    }
  }

  /** Wire the main Confirm / Begin button here. */
  public confirmAndStart() {
    if (!this.gameManager) {
      this.log.e('gameManager not assigned')
      return
    }

    if (this.mode === 'mp') {
      if (!SessionController.getInstance().isHost()) {
        this.log.i('Only the host can confirm MP setup')
        return
      }
      if (![3, 5, 7, 10].includes(this.selectedRounds)) {
        this.log.e('Pick number of rounds (3 / 5 / 7 / 10) first')
        this.gameManager.showSetupHint?.('Pick rounds (3 / 5 / 7 / 10) first')
        return
      }
      this.gameManager.applyMpSetupAndStart(this.selectedRounds)
      return
    }

    if (this.selectedAi < 1 || this.selectedAi > 5) {
      this.log.e('Pick number of AI opponents (1–5) first')
      this.gameManager.showSetupHint?.('Pick number of AI opponents (1–5) first')
      return
    }
    if (![3, 5, 7, 10].includes(this.selectedRounds)) {
      this.log.e('Pick number of rounds (3 / 5 / 7 / 10) first')
      this.gameManager.showSetupHint?.('Pick rounds (3 / 5 / 7 / 10) first')
      return
    }
    this.gameManager.applySoloSetupAndStart(this.selectedAi, this.selectedRounds)
  }

  public backToMenu() {
    if (!this.gameManager) return
    this.gameManager.backToMainMenu()
  }
}
