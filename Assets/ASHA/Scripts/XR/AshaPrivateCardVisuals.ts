import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaGameManager } from '../AshaGameManager'

const TAG = 'AshaPrivateCardVisuals'

/**
 * Deprecated: card visuals (face/back, flip, reveal labels, winner pulse)
 * are owned exclusively by ElementHandPanel.
 *
 * This component is kept around so that existing scenes don't break, but it
 * is now an inert no-op. Wired @input arrays are ignored at runtime — the
 * script does NOT enable/disable any scene objects.
 *
 * To clean up your scene, delete this component from the scene and unwire
 * any references; it is no longer required.
 */
@component
export class AshaPrivateCardVisuals extends BaseScriptComponent {
  @input gameManager: AshaGameManager

  /** Deprecated. Ignored at runtime. */
  @input('SceneObject[]') localFaceObjects: SceneObject[] = []
  /** Deprecated. Ignored at runtime. */
  @input('SceneObject[]') opponentBackObjects: SceneObject[] = []
  /** Deprecated. Ignored at runtime. */
  @input('SceneObject[]') backAnchors: SceneObject[] = []
  /** Deprecated. Ignored at runtime. */
  @input hideWhenAllChosen: boolean = true
  /** Deprecated. Ignored at runtime. */
  @input keepLocalFaceAfterChoice: boolean = true

  private readonly log = new SyncKitLogger(TAG)

  onAwake() {
    const f = this.localFaceObjects.filter(Boolean).length
    const b = this.opponentBackObjects.filter(Boolean).length
    const a = this.backAnchors.filter(Boolean).length
    if (f + b + a > 0) {
      this.log.w(
        `Deprecated component still wired (faces=${f}, backs=${b}, anchors=${a}). ` +
        `ElementHandPanel now owns all card visuals — clear these inputs or delete this component.`
      )
    } else {
      this.log.i('Deprecated AshaPrivateCardVisuals attached (no-op).')
    }
  }
}
