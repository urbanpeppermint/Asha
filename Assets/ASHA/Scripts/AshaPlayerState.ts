import { SyncEntity } from 'SpectaclesSyncKit.lspkg/Core/SyncEntity'
import { StorageProperty } from 'SpectaclesSyncKit.lspkg/Core/StorageProperty'
import { StoragePropertySet } from 'SpectaclesSyncKit.lspkg/Core/StoragePropertySet'
import { SessionController } from 'SpectaclesSyncKit.lspkg/Core/SessionController'
import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { AshaGameManager } from './AshaGameManager'

const TAG = 'AshaPlayerState'

@component
export class AshaPlayerState extends BaseScriptComponent {

  @input gameManager: AshaGameManager

  // ── Static registry — replaces scene traversal (which does not exist) ──
  private static instances: AshaPlayerState[] = []
  public  static getAll(): AshaPlayerState[]  { return AshaPlayerState.instances }

  // ── Per-player synced state (owned by the player who created it) ────────
  private choiceProp = StorageProperty.manualInt('ashaChoice', -1)    // -1 = not yet chosen
  private scoreProp  = StorageProperty.manualInt('ashaScore', 0)
  private readyProp  = StorageProperty.manualBool('ashaReady', false)
  private nameProp   = StorageProperty.manualString('ashaName', '')

  private syncEntity: SyncEntity
  private readonly log = new SyncKitLogger(TAG)

  onAwake() {
    // Register immediately so getAll() works even before SyncEntity is ready
    AshaPlayerState.instances.push(this)

    this.syncEntity = new SyncEntity(
      this,
      new StoragePropertySet([
        this.choiceProp,
        this.scoreProp,
        this.readyProp,
        this.nameProp,
      ]),
      true,     // owned: only this player can write to their own state
      'Owner'   // entity is destroyed when owner disconnects
    )

    this.syncEntity.notifyOnReady(() => this.onReady())
  }

  onDestroy() {
    const idx = AshaPlayerState.instances.indexOf(this)
    if (idx !== -1) AshaPlayerState.instances.splice(idx, 1)
  }

  private onReady() {
    this.log.i('PlayerState ready')

    if (this.syncEntity.doIOwnStore()) {
      const name = SessionController.getInstance().getLocalUserName() ?? ''
      this.nameProp.setPendingValue(name)
      this.log.i(`Local player: ${name}`)
    }

    // Remote changes drive the scoreboard and trigger all-chosen check
    this.scoreProp.onRemoteChange.add(() => this.updateDisplay())
    this.choiceProp.onRemoteChange.add(() => this.updateDisplay())
    this.readyProp.onRemoteChange.add(() => {
      this.updateDisplay()
      // Every time any player's ready state changes, host checks if all are ready
      if (this.gameManager) this.gameManager.checkAllChosen()
    })

    this.updateDisplay()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  public submitChoice(elementId: number) {
    if (!this.syncEntity || !this.syncEntity.doIOwnStore()) return
    if (this.readyProp.currentValue === true) return    // already chosen this round

    this.log.i(`Choice: ${elementId}`)
    this.choiceProp.setPendingValue(elementId)
    this.readyProp.setPendingValue(true)
    this.updateDisplay()   // ← local update; onRemoteChange won't fire for self

    // Notify game manager directly — readyProp.onRemoteChange won't fire locally
    if (this.gameManager) this.gameManager.checkAllChosen()
  }

  public applyDelta(delta: number) {
    if (!this.syncEntity || !this.syncEntity.doIOwnStore()) return
    // currentValue is a getter — no parentheses
    this.scoreProp.setPendingValue(this.scoreProp.currentValue + delta)
    this.updateDisplay()   // ← local update
  }

  public resetForRound() {
    if (!this.syncEntity || !this.syncEntity.doIOwnStore()) return
    this.choiceProp.setPendingValue(-1)
    this.readyProp.setPendingValue(false)
    this.updateDisplay()   // ← local update
  }

  // ── Getters (safe to read from any device for any player) ───────────────
  get isReady():     boolean { return this.readyProp.currentValue  === true }
  get choice():      number  { return this.choiceProp.currentValue }   // getter, no ()
  get score():       number  { return this.scoreProp.currentValue  }   // getter, no ()
  get displayName(): string  { return this.nameProp.currentValue   }   // getter, no ()

  private updateDisplay() {
    // Replace this stub with your scoreboard Text3D update logic
    this.log.i(`${this.displayName} score:${this.score} ready:${this.isReady} choice:${this.choice}`)
  }
}
