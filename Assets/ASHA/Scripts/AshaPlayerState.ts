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
  private static claimingInProgress = false

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
      false,    // start unowned; each user claims one available seat
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
    this.syncEntity.onOwnerUpdated.add(() => this.onOwnerChanged())
    this.onOwnerChanged()

    // Remote changes drive the scoreboard and trigger all-chosen check
    this.scoreProp.onRemoteChange.add(() => this.updateDisplay())
    this.choiceProp.onRemoteChange.add(() => this.updateDisplay())
    this.readyProp.onRemoteChange.add(() => {
      this.updateDisplay()
      // Every time any player's ready state changes, host checks if all are ready
      if (this.gameManager) this.gameManager.checkAllChosen()
    })

    this.updateDisplay()
    AshaPlayerState.tryClaimLocalSeat()
  }

  private onOwnerChanged() {
    if (this.syncEntity.doIOwnStore()) {
      const name = SessionController.getInstance().getLocalUserName() ?? 'Magi'
      this.nameProp.setPendingValue(name)
      this.log.i(`Local player: ${name}`)
    }
    this.updateDisplay()
    AshaPlayerState.enforceSingleSeatOwnership()
    AshaPlayerState.tryClaimLocalSeat()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  public submitChoice(elementId: number) {
    if (!this.syncEntity || !this.syncEntity.doIOwnStore()) return
    // currentValue lags until the store syncs; use currentOrPendingValue for local reads (Sync Kit docs).
    if (this.readyProp.currentOrPendingValue === true) return

    this.log.i(`Choice: ${elementId}`)
    this.choiceProp.setPendingValue(elementId)
    this.readyProp.setPendingValue(true)
    this.updateDisplay()   // ← local update; onRemoteChange won't fire for self

    // Notify game manager directly — readyProp.onRemoteChange won't fire locally
    if (this.gameManager) this.gameManager.checkAllChosen()
  }

  public applyDelta(delta: number) {
    if (!this.syncEntity || !this.syncEntity.doIOwnStore()) return
    const cur =
      this.scoreProp.currentOrPendingValue ?? this.scoreProp.currentValue ?? 0
    this.scoreProp.setPendingValue(cur + delta)
    this.updateDisplay()   // ← local update
  }

  public resetForRound() {
    if (!this.syncEntity || !this.syncEntity.doIOwnStore()) return
    this.choiceProp.setPendingValue(-1)
    this.readyProp.setPendingValue(false)
    this.updateDisplay()   // ← local update
  }

  public resetForNewMatch() {
    if (!this.syncEntity || !this.syncEntity.doIOwnStore()) return
    this.scoreProp.setPendingValue(0)
    this.choiceProp.setPendingValue(-1)
    this.readyProp.setPendingValue(false)
    this.updateDisplay()
  }

  // ── Getters (safe to read from any device for any player) ───────────────
  // Prefer currentOrPendingValue: setPendingValue updates it immediately; currentValue updates after network/store apply.
  get isReady(): boolean {
    return this.readyProp.currentOrPendingValue === true
  }

  get choice(): number {
    const v = this.choiceProp.currentOrPendingValue ?? this.choiceProp.currentValue
    if (v === null || v === undefined) return -1
    return v as number
  }

  get score(): number {
    const v = this.scoreProp.currentOrPendingValue ?? this.scoreProp.currentValue
    if (v === null || v === undefined) return 0
    return v as number
  }

  get displayName(): string {
    const v = this.nameProp.currentOrPendingValue ?? this.nameProp.currentValue
    return v ?? ''
  }

  get ownerConnectionId(): string {
    return this.syncEntity?.getOwnerConnectionId?.() ?? ''
  }

  get isLocallyOwnedSeat(): boolean {
    return this.syncEntity?.doIOwnStore?.() === true
  }

  public static getLocalOwned(): AshaPlayerState | null {
    for (const p of AshaPlayerState.instances) {
      if (p.isLocallyOwnedSeat) return p
    }
    return null
  }

  private static enforceSingleSeatOwnership() {
    const mine = AshaPlayerState.instances.filter(i => i.syncEntity?.doIOwnStore?.() === true)
    if (mine.length <= 1) return
    for (let i = 1; i < mine.length; i++) {
      mine[i].syncEntity.revokeOwnership()
    }
  }

  private static tryClaimLocalSeat() {
    if (AshaPlayerState.claimingInProgress) return
    if (AshaPlayerState.getLocalOwned()) return

    const freeSeat = AshaPlayerState.instances.find(
      i => i.syncEntity?.isSetupFinished && !i.syncEntity.isStoreOwned()
    )
    if (!freeSeat) return

    AshaPlayerState.claimingInProgress = true
    freeSeat.syncEntity.tryClaimOwnership(
      () => { AshaPlayerState.claimingInProgress = false },
      () => { AshaPlayerState.claimingInProgress = false }
    )
  }

  private updateDisplay() {
    // Replace this stub with your scoreboard Text3D update logic
    this.log.i(`${this.displayName} score:${this.score} ready:${this.isReady} choice:${this.choice}`)
  }
}
