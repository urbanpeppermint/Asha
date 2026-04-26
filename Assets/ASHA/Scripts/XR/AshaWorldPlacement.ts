import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { SyncEntity } from 'SpectaclesSyncKit.lspkg/Core/SyncEntity'
import { StorageProperty } from 'SpectaclesSyncKit.lspkg/Core/StorageProperty'
import { StoragePropertySet } from 'SpectaclesSyncKit.lspkg/Core/StoragePropertySet'

const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK
const InteractorTriggerType = require('SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor').InteractorTriggerType
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WorldQueryModule = require('LensStudio:WorldQueryModule') as any

const TAG = 'AshaWorldPlacement'
const EPSILON = 0.01

function sn(p: StorageProperty<number>, fb: number): number {
  const v = p.currentOrPendingValue ?? p.currentValue
  return (v !== null && v !== undefined) ? (v as number) : fb
}

@component
export class AshaWorldPlacement extends BaseScriptComponent {

  @input arenaRoot: SceneObject
  @input hideArenaUntilPlaced: boolean = false
  @input filterEnabled: boolean = true
  @input useSemanticClassification: boolean = false
  @input allowFallbackWithoutHit: boolean = false
  @input fallbackDistance: number = 80
  @input fallbackDelaySec: number = 3.0
  @input defaultScale: number = 1.0
  @input scaleStep: number = 0.1
  @input startPlacementOnAwake: boolean = false
  @input requireButtonToEnterPlacement: boolean = true
  @input syncPlacementAcrossUsers: boolean = false
  @input('SceneObject') @allowUndefined placementIndicatorRoot: SceneObject
  @input('SceneObject') @allowUndefined placementHintText: SceneObject
  @input pendingHint: string = 'Tap Place Arena, then release pinch to confirm'

  private readonly log = new SyncKitLogger(TAG)
  private placed = false
  private inPlacementMode = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hitSession: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private primaryInteractor: any = null
  private warnedMissingIndicator = false
  private worldQueryWarned = false
  private lastHitPos: vec3 | null = null
  private lastHitRot: quat | null = null
  private syncedVersionSeen = -1
  private placementButtonArmed = false

  // Shared transform (same arena pose/scale across devices)
  private px = StorageProperty.manualFloat('arenaPx', 0)
  private py = StorageProperty.manualFloat('arenaPy', 0)
  private pz = StorageProperty.manualFloat('arenaPz', 0)
  private qx = StorageProperty.manualFloat('arenaQx', 0)
  private qy = StorageProperty.manualFloat('arenaQy', 0)
  private qz = StorageProperty.manualFloat('arenaQz', 0)
  private qw = StorageProperty.manualFloat('arenaQw', 1)
  private sc = StorageProperty.manualFloat('arenaSc', 1)
  private ver = StorageProperty.manualInt('arenaVer', 0)
  private syncEntity: SyncEntity

  onAwake() {
    const props: StorageProperty<any>[] = [
      this.px, this.py, this.pz, this.qx, this.qy, this.qz, this.qw, this.sc, this.ver,
    ]
    this.syncEntity = new SyncEntity(this, new StoragePropertySet(props), false, 'Session')
    this.syncEntity.notifyOnReady(() => this.onSyncReady())

    this.createEvent('OnStartEvent').bind(() => this.onStart())
    this.createEvent('UpdateEvent').bind(() => this.tickWorldQuery())

    if (this.hideArenaUntilPlaced && this.arenaRoot) this.arenaRoot.enabled = false
    this.updateIndicator(false)
  }

  public isPlaced(): boolean {
    return this.placed
  }

  public enablePlacementMode() {
    if (this.requireButtonToEnterPlacement && !this.placementButtonArmed) return
    this.inPlacementMode = true
    this.lastHitPos = null
    this.lastHitRot = null
    this.placementButtonArmed = false
    this.updateIndicator(true)
    this.beginWorldQuery()
  }

  public disablePlacementMode() {
    this.inPlacementMode = false
    this.updateIndicator(false)
    this.hitSession?.stop?.()
  }

  public confirmCurrentHitPlacement() {
    if (!this.lastHitPos || !this.lastHitRot) return
    this.commitSharedPlacement(this.lastHitPos, this.lastHitRot, this.readCurrentScale())
  }
  /** Wire this directly to the "Place Arena" button triggerUp callback. */
  public startPlacementByButton() {
    this.placementButtonArmed = true
    this.enablePlacementMode()
  }

  public scaleUp() { this.adjustScale(+this.scaleStep) }
  public scaleDown() { this.adjustScale(-this.scaleStep) }

  private onStart() {
    if (!this.startPlacementOnAwake) return
    const d = this.createEvent('DelayedCallbackEvent')
    d.bind(() => { if (!this.placed) this.enablePlacementMode() })
    d.reset(0.2)
  }

  private onSyncReady() {
    if (!this.syncPlacementAcrossUsers) return
    ;(this.ver as any).onRemoteChange?.add?.(() => this.onSharedPlacementChanged())
    this.onSharedPlacementChanged()
  }

  private onSharedPlacementChanged() {
    const v = sn(this.ver, 0)
    if (v <= this.syncedVersionSeen) return
    this.syncedVersionSeen = v
    if (v <= 0) return
    this.applyFromSharedProps()
    this.log.i(`Applied shared arena placement v${v}`)
  }

  private beginWorldQuery() {
    if (!this.inPlacementMode || !this.arenaRoot) return
    this.hitSession = this.createHitSession(this.useSemanticClassification)
    if (!this.hitSession && this.useSemanticClassification) {
      this.hitSession = this.createHitSession(false)
      if (this.hitSession) this.log.w('Semantic classification unavailable; using standard hit test')
    }

    if (this.hitSession && typeof this.hitSession.hitTest === 'function') {
      this.hitSession.start?.()
      this.log.i('WorldQuery hit session ready')
      if (this.allowFallbackWithoutHit) {
        const fb = this.createEvent('DelayedCallbackEvent')
        fb.bind(() => {
          if (this.placed || !this.inPlacementMode) return
          this.applyFallback()
          this.commitSharedPlacement(
            this.arenaRoot.getTransform().getWorldPosition(),
            this.arenaRoot.getTransform().getWorldRotation(),
            this.readCurrentScale(),
          )
          this.log.w('No surface hit in time — fallback placement used')
        })
        fb.reset(Math.max(0.1, this.fallbackDelaySec))
      }
      return
    }

    if (this.allowFallbackWithoutHit) {
      this.applyFallback()
      this.commitSharedPlacement(
        this.arenaRoot.getTransform().getWorldPosition(),
        this.arenaRoot.getTransform().getWorldRotation(),
        this.readCurrentScale(),
      )
      this.log.w('WorldQuery unavailable — fallback placement used')
    } else if (!this.worldQueryWarned) {
      this.worldQueryWarned = true
      this.log.w('WorldQuery unavailable and fallback disabled; placement required before cards')
    }
  }

  private createHitSession(withClassification: boolean): any {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts = (globalThis as any).HitTestSessionOptions?.create?.() ?? {}
      opts.filter = this.filterEnabled
      if (withClassification) opts.classification = true
      return WorldQueryModule?.createHitTestSessionWithOptions?.(opts) ?? null
    } catch (e) {
      if (!this.worldQueryWarned) {
        this.worldQueryWarned = true
        this.log.w(`WorldQuery setup failed: ${e}`)
      }
      return null
    }
  }

  private tickWorldQuery() {
    if (!this.inPlacementMode || !this.hitSession || !this.arenaRoot) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sceneAny = (globalThis as any).scene
    let rayStart: vec3 | null = null
    let rayEnd: vec3 | null = null

    try {
      this.primaryInteractor = SIK?.InteractionManager?.getTargetingInteractors?.().shift?.()
    } catch (_e) {
      this.primaryInteractor = null
    }

    if (
      this.primaryInteractor &&
      this.primaryInteractor.isActive?.() &&
      this.primaryInteractor.isTargeting?.()
    ) {
      rayStart = new vec3(
        this.primaryInteractor.startPoint.x,
        this.primaryInteractor.startPoint.y,
        this.primaryInteractor.startPoint.z + 30,
      )
      rayEnd = this.primaryInteractor.endPoint
    } else {
      const cam = sceneAny?.getCamera?.() ?? sceneAny?.getMainCamera?.()
      if (!cam || !cam.getTransform) return
      const ct = cam.getTransform()
      const p = ct.getWorldPosition()
      const f = ct.forward
      rayStart = new vec3(p.x, p.y, p.z)
      rayEnd = new vec3(
        p.x + f.x * Math.max(120, this.fallbackDistance * 2),
        p.y + f.y * Math.max(120, this.fallbackDistance * 2),
        p.z + f.z * Math.max(120, this.fallbackDistance * 2),
      )
    }
    if (!rayStart || !rayEnd) return

    this.hitSession.hitTest(rayStart, rayEnd, (result: { position?: vec3; normal?: vec3 } | null) => {
      if (result?.position) {
        const rot = this.computeHitRotation(result.normal)
        this.lastHitPos = result.position
        this.lastHitRot = rot
        this.placeIndicatorAt(result.position, rot)
      } else {
        this.setIndicatorVisible(false)
      }
      // Match sample behavior: commit when trigger is released on valid hit.
      const ended =
        this.primaryInteractor &&
        this.primaryInteractor.previousTrigger !== InteractorTriggerType.None &&
        this.primaryInteractor.currentTrigger === InteractorTriggerType.None
      if (ended && this.lastHitPos && this.lastHitRot) {
        this.commitSharedPlacement(this.lastHitPos, this.lastHitRot, this.readCurrentScale())
      }
    })
  }

  private computeHitRotation(normal?: vec3): quat {
    if (!normal) return this.arenaRoot.getTransform().getWorldRotation()
    let lookDirection: vec3
    if (1 - Math.abs(normal.normalize().dot(vec3.up())) < EPSILON) {
      lookDirection = vec3.forward()
    } else {
      lookDirection = normal.cross(vec3.up())
    }
    return quat.lookAt(lookDirection, normal)
  }

  private commitSharedPlacement(pos: vec3, rot: quat, scale: number) {
    if (!this.syncPlacementAcrossUsers) {
      this.applyLocalPlacement(pos, rot, scale)
      this.log.i('Arena placement committed (local only)')
      return
    }
    this.px.setPendingValue(pos.x)
    this.py.setPendingValue(pos.y)
    this.pz.setPendingValue(pos.z)
    this.qx.setPendingValue(rot.x)
    this.qy.setPendingValue(rot.y)
    this.qz.setPendingValue(rot.z)
    this.qw.setPendingValue(rot.w)
    this.sc.setPendingValue(Math.max(0.05, scale))
    this.ver.setPendingValue(sn(this.ver, 0) + 1)
    this.applyLocalPlacement(pos, rot, scale)
    this.log.i('Arena placement committed (shared)')
  }

  private applyFromSharedProps() {
    const pos = new vec3(sn(this.px, 0), sn(this.py, 0), sn(this.pz, 0))
    const rot = new quat(sn(this.qx, 0), sn(this.qy, 0), sn(this.qz, 0), sn(this.qw, 1))
    const scale = Math.max(0.05, sn(this.sc, this.defaultScale))
    this.applyLocalPlacement(pos, rot, scale)
  }

  private applyLocalPlacement(pos: vec3, rot: quat, scale: number) {
    if (!this.arenaRoot) return
    const tr = this.arenaRoot.getTransform()
    tr.setWorldPosition(pos)
    tr.setWorldRotation(rot)
    tr.setLocalScale(new vec3(scale, scale, scale))
    this.placed = true
    this.arenaRoot.enabled = true
    this.disablePlacementMode()
  }

  private readCurrentScale(): number {
    if (!this.arenaRoot) return this.defaultScale
    return Math.max(0.05, this.arenaRoot.getTransform().getLocalScale().x)
  }

  private adjustScale(delta: number) {
    if (!this.placed || !this.arenaRoot) return
    const tr = this.arenaRoot.getTransform()
    const pos = tr.getWorldPosition()
    const rot = tr.getWorldRotation()
    const next = Math.max(0.05, this.readCurrentScale() + delta)
    this.commitSharedPlacement(pos, rot, next)
  }

  private applyFallback() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sceneAny = (globalThis as any).scene
    const cam = sceneAny?.getCamera?.() ?? sceneAny?.getMainCamera?.()
    if (!cam || !cam.getTransform || !this.arenaRoot) return
    const ct = cam.getTransform()
    const p = ct.getWorldPosition()
    const f = ct.forward
    const pos = new vec3(
      p.x + f.x * this.fallbackDistance,
      p.y + f.y * this.fallbackDistance,
      p.z + f.z * this.fallbackDistance,
    )
    this.arenaRoot.getTransform().setWorldPosition(pos)
  }

  private updateIndicator(show: boolean) {
    if (!this.placementIndicatorRoot && !this.placementHintText && !this.warnedMissingIndicator) {
      this.warnedMissingIndicator = true
      this.log.w('Placement indicator not assigned; wire placementIndicatorRoot or placementHintText')
    }
    if (!show) this.setIndicatorVisible(false)
    if (this.placementHintText) {
      const t = this.placementHintText.getComponent('Component.Text')
      if (t) (t as any).text = show ? this.pendingHint : ''
      this.placementHintText.enabled = show
    }
  }

  private placeIndicatorAt(worldPos: vec3, worldRot?: quat) {
    if (!this.placementIndicatorRoot) return
    this.setIndicatorVisible(true)
    const tr = this.placementIndicatorRoot.getTransform()
    tr.setWorldPosition(worldPos)
    if (worldRot) tr.setWorldRotation(worldRot)
  }

  private setIndicatorVisible(v: boolean) {
    if (this.placementIndicatorRoot) this.placementIndicatorRoot.enabled = v
  }
}
