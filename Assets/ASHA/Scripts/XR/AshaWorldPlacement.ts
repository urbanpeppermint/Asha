import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
const SIK = require('SpectaclesInteractionKit.lspkg/SIK').SIK

const TAG = 'AshaWorldPlacement'
// See docs: https://developers.snap.com/spectacles/about-spectacles-features/apis/world-query#semantic-hit-testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WorldQueryModule = require('LensStudio:WorldQueryModule') as any
const EPSILON = 0.01

/**
 * Enhancement 1 — world-anchored arena (additive).
 * Tries Lens hit-test / world query if available; otherwise places relative to camera.
 * See: https://developers.snap.com/spectacles/about-spectacles-features/apis/world-query
 */
@component
export class AshaWorldPlacement extends BaseScriptComponent {

  @input arenaRoot: SceneObject
  /** Sample-style behavior: hide arena until we get a valid hit result. */
  @input hideArenaUntilPlaced: boolean = true
  @input fallbackDistance: number = 80
  @input filterEnabled: boolean = true
  /** Set true only if Experimental APIs are enabled in Project Settings. */
  @input useSemanticClassification: boolean = false
  @input allowFallbackWithoutHit: boolean = false
  @input fallbackDelaySec: number = 3.0
  @input('SceneObject') @allowUndefined placementIndicatorRoot: SceneObject
  @input('SceneObject') @allowUndefined placementHintText: SceneObject
  @input pendingHint: string = 'Look at a table/floor to place arena'

  private readonly log = new SyncKitLogger(TAG)
  private placed = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hitSession: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private primaryInteractor: any = null
  private worldQueryWarned = false
  private warnedMissingIndicator = false

  onAwake() {
    this.createEvent('OnStartEvent').bind(() => this.onStart())
    this.createEvent('UpdateEvent').bind(() => this.tickWorldQuery())
    if (this.hideArenaUntilPlaced && this.arenaRoot) this.arenaRoot.enabled = false
    this.updateIndicator(true)
  }

  /** Used by XR coordinator to gate card menu until placement completes. */
  public isPlaced(): boolean {
    return this.placed
  }

  private onStart() {
    const d = this.createEvent('DelayedCallbackEvent')
    d.bind(() => this.beginWorldQuery())
    d.reset(1.0)
  }

  private beginWorldQuery() {
    if (this.placed || !this.arenaRoot) return
    this.hitSession = this.createHitSession(this.useSemanticClassification)
    if (!this.hitSession && this.useSemanticClassification) {
      // Retry with classification disabled to match non-experimental setup.
      this.hitSession = this.createHitSession(false)
      if (this.hitSession) {
        this.log.w('Semantic classification unavailable; continuing with standard WorldQuery hit test')
      }
    }

    if (this.hitSession && typeof this.hitSession.hitTest === 'function') {
      this.log.i('WorldQuery hit session ready')
      this.updateIndicator(true)
      if (this.allowFallbackWithoutHit) {
        const fb = this.createEvent('DelayedCallbackEvent')
        fb.bind(() => {
          if (!this.placed) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.applyFallback((globalThis as any).scene)
            this.placed = true
            if (this.arenaRoot) this.arenaRoot.enabled = true
            this.updateIndicator(false)
            this.log.w('No surface hit in time — fallback placement used')
          }
        })
        fb.reset(Math.max(0.1, this.fallbackDelaySec))
      }
      return
    }

    if (this.allowFallbackWithoutHit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.applyFallback((globalThis as any).scene)
      this.placed = true
      if (this.arenaRoot) this.arenaRoot.enabled = true
      this.updateIndicator(false)
      this.log.w('WorldQuery unavailable — fallback placement used')
    } else {
      if (!this.worldQueryWarned) {
        this.worldQueryWarned = true
        this.log.w('WorldQuery unavailable and fallback disabled; placement required before cards')
      }
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
    if (this.placed || !this.hitSession || !this.arenaRoot) return
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

    this.hitSession.hitTest(rayStart, rayEnd, (result: { position?: vec3; classification?: number } | null) => {
      if (!this.placed) this.placeIndicatorAt(result?.position ?? rayEnd)
      if (this.placed || !result || !result.position) return
      this.arenaRoot.getTransform().setWorldPosition(result.position)
      if ((result as any).normal) {
        const hitNormal = (result as any).normal as vec3
        let lookDirection: vec3
        if (1 - Math.abs(hitNormal.normalize().dot(vec3.up())) < EPSILON) {
          lookDirection = vec3.forward()
        } else {
          lookDirection = hitNormal.cross(vec3.up())
        }
        const toRotation = quat.lookAt(lookDirection, hitNormal)
        this.arenaRoot.getTransform().setWorldRotation(toRotation)
      }
      this.log.i('Arena placed from WorldQuery hit')
      this.placed = true
      if (this.arenaRoot) this.arenaRoot.enabled = true
      this.updateIndicator(false)
    })
  }

  private applyFallback(sceneAny: any) {
    if (!this.arenaRoot) return
    this.log.w('Surface hit test unavailable — using camera fallback')
    const cam = sceneAny?.getCamera?.() ?? sceneAny?.getMainCamera?.()
    const tr = this.arenaRoot.getTransform()
    if (cam && cam.getTransform) {
      const ct = cam.getTransform()
      const p = ct.getWorldPosition()
      const f = ct.forward
      const t = new vec3(
        p.x + f.x * this.fallbackDistance,
        p.y + f.y * this.fallbackDistance,
        p.z + f.z * this.fallbackDistance,
      )
      tr.setWorldPosition(t)
      this.placeIndicatorAt(t)
    }
  }

  private updateIndicator(show: boolean) {
    if (!this.placementIndicatorRoot && !this.placementHintText && !this.warnedMissingIndicator) {
      this.warnedMissingIndicator = true
      this.log.w('Placement indicator not assigned; wire placementIndicatorRoot or placementHintText')
    }
    if (this.placementIndicatorRoot) this.placementIndicatorRoot.enabled = show
    if (this.placementHintText) {
      const t = this.placementHintText.getComponent('Component.Text')
      if (t) (t as any).text = show ? this.pendingHint : ''
      this.placementHintText.enabled = show
    }
  }

  private placeIndicatorAt(worldPos: vec3) {
    if (!this.placementIndicatorRoot || !worldPos) return
    this.placementIndicatorRoot.getTransform().setWorldPosition(worldPos)
  }
}
