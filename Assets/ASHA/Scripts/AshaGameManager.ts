import { SyncEntity } from 'SpectaclesSyncKit.lspkg/Core/SyncEntity'
import { StorageProperty } from 'SpectaclesSyncKit.lspkg/Core/StorageProperty'
import { StoragePropertySet } from 'SpectaclesSyncKit.lspkg/Core/StoragePropertySet'
import { SessionController } from 'SpectaclesSyncKit.lspkg/Core/SessionController'
import { SyncKitLogger } from 'SpectaclesSyncKit.lspkg/Utils/SyncKitLogger'
import { resolveRound, getVerb } from './AshaResolver'
import { ELEMENTS, MATRIX } from './AshaConstants'
import { AI_EMOJIS, AI_NAMES } from './AshaAiBots'

const TAG = 'AshaGameManager'
const MAX_SLOTS = 6
const SOLO_WAIT_SEC = 1.0

function sInt(p: StorageProperty<number>, fb: number): number {
  const v = p.currentOrPendingValue ?? p.currentValue
  return (v !== null && v !== undefined) ? (v as number) : fb
}
function sStr(p: StorageProperty<string>, fb: string): string {
  const v = p.currentOrPendingValue ?? p.currentValue
  return (v !== null && v !== undefined) ? (v as string) : fb
}

type PanelLike = { setEnabled(e: boolean): void }
type SetupLike = { setVisible(v: boolean): void }

@component
export class AshaGameManager extends BaseScriptComponent {

  @input nextRoundButton: SceneObject
  @input battleLogText: SceneObject
  @input titleText: SceneObject
  @input roundText: SceneObject
  @input statusText: SceneObject
  @input revealDelaySec: number = 1.2

  // ── ONE shared SyncEntity — flat registry ─────────────────────────────
  private phaseProp      = StorageProperty.manualString('phase', 'waiting')
  private roundProp      = StorageProperty.manualInt('round', 1)
  private totalRdsProp   = StorageProperty.manualInt('totalRds', 5)
  private aiCountProp    = StorageProperty.manualInt('aiCnt', 0)
  private humanCountProp = StorageProperty.manualInt('hCnt', 0)
  private revealTrig     = StorageProperty.manualInt('rTrig', 0)
  private nextTrig       = StorageProperty.manualInt('nTrig', 0)
  private goTrig         = StorageProperty.manualInt('gTrig', 0)

  private c0 = StorageProperty.manualInt('c0', -1)
  private c1 = StorageProperty.manualInt('c1', -1)
  private c2 = StorageProperty.manualInt('c2', -1)
  private c3 = StorageProperty.manualInt('c3', -1)
  private c4 = StorageProperty.manualInt('c4', -1)
  private c5 = StorageProperty.manualInt('c5', -1)
  private s0 = StorageProperty.manualInt('s0', 0)
  private s1 = StorageProperty.manualInt('s1', 0)
  private s2 = StorageProperty.manualInt('s2', 0)
  private s3 = StorageProperty.manualInt('s3', 0)
  private s4 = StorageProperty.manualInt('s4', 0)
  private s5 = StorageProperty.manualInt('s5', 0)
  private n0 = StorageProperty.manualString('n0', '')
  private n1 = StorageProperty.manualString('n1', '')
  private n2 = StorageProperty.manualString('n2', '')
  private n3 = StorageProperty.manualString('n3', '')
  private n4 = StorageProperty.manualString('n4', '')
  private n5 = StorageProperty.manualString('n5', '')

  private get cProps(): StorageProperty<number>[] { return [this.c0,this.c1,this.c2,this.c3,this.c4,this.c5] }
  private get sProps(): StorageProperty<number>[] { return [this.s0,this.s1,this.s2,this.s3,this.s4,this.s5] }
  private get nProps(): StorageProperty<string>[] { return [this.n0,this.n1,this.n2,this.n3,this.n4,this.n5] }

  private syncEntity: SyncEntity
  private readonly log = new SyncKitLogger(TAG)
  private ready = false
  private mySlot = -1
  private lastHumanChoice = -1
  private soloDecided = false
  private handPanel: PanelLike | null = null
  private setupPanel: SetupLike | null = null

  // ── Lifecycle ─────────────────────────────────────────────────────────
  onAwake() {
    const all: StorageProperty<any>[] = [
      this.phaseProp, this.roundProp, this.totalRdsProp,
      this.aiCountProp, this.humanCountProp,
      this.revealTrig, this.nextTrig, this.goTrig,
      this.c0,this.c1,this.c2,this.c3,this.c4,this.c5,
      this.s0,this.s1,this.s2,this.s3,this.s4,this.s5,
      this.n0,this.n1,this.n2,this.n3,this.n4,this.n5,
    ]
    this.syncEntity = new SyncEntity(this, new StoragePropertySet(all), false, 'Session')
    this.syncEntity.notifyOnReady(() => this.onReady())
    if (this.nextRoundButton) this.nextRoundButton.enabled = false
  }

  public registerHandPanel(p: PanelLike) {
    this.handPanel = p
    this.syncUi(sStr(this.phaseProp, ''))
  }
  public registerSoloSetupPanel(p: SetupLike) {
    this.setupPanel = p
    this.syncUi(sStr(this.phaseProp, ''))
  }

  // ── SyncEntity ready — assign slot like Tic Tac Toe pattern ───────────
  private onReady() {
    this.ready = true
    this.log.i('SyncEntity ready')

    this.phaseProp.onRemoteChange.add(v => this.onPhaseChanged(v))
    this.revealTrig.onRemoteChange.add(() => this.onReveal())
    this.nextTrig.onRemoteChange.add(() => this.onNextRound())
    this.goTrig.onRemoteChange.add(() => this.onGameOver())
    for (let i = 0; i < MAX_SLOTS; i++) {
      this.cProps[i].onRemoteChange.add(() => this.checkAllChosen())
    }

    const users = SessionController.getInstance().getUsers()
    const userCount = users ? users.length : 1
    this.mySlot = userCount - 1

    const myName = SessionController.getInstance().getLocalUserName() ?? 'Magi'
    this.nProps[this.mySlot].setPendingValue(myName)
    this.log.i(`Slot ${this.mySlot} → "${myName}" (${userCount} user${userCount > 1 ? 's' : ''} in session)`)

    this.setText(this.titleText, 'ASHA')

    const sc = SessionController.getInstance()

    if (sc.isHost()) {
      this.humanCountProp.setPendingValue(userCount)

      sc.onUserJoinedSession.add(
        (_session: any, _userInfo: any) => this.onUserJoined()
      )
      sc.onUserLeftSession.add(
        (_session: any, _userInfo: any) => this.onUserLeft()
      )

      if (sc.isSingleplayer()) {
        this.hostDecide()
      } else {
        const d = this.createEvent('DelayedCallbackEvent')
        d.bind(() => this.hostDecide())
        d.reset(SOLO_WAIT_SEC)
      }
    } else {
      const currentPhase = sStr(this.phaseProp, '')
      if (currentPhase && currentPhase !== 'waiting') {
        this.log.i(`Late join — phase already "${currentPhase}"`)
        this.onPhaseChanged(currentPhase)
      }
    }
  }

  // ── Host: decide solo vs multi after waiting for all players ──────────
  private hostDecide() {
    if (this.soloDecided) return
    this.soloDecided = true

    const phase = sStr(this.phaseProp, 'waiting')
    if (phase !== 'waiting') return

    const humans = sInt(this.humanCountProp, 1)
    if (humans <= 1) {
      this.log.i('Solo session → solo_setup')
      this.phaseProp.setPendingValue('solo_setup')
      this.onPhaseChanged('solo_setup')
    } else {
      this.log.i(`${humans}-player session → choosing`)
      this.phaseProp.setPendingValue('choosing')
      this.onPhaseChanged('choosing')
    }
  }

  // ── User join/leave handlers (host only) ──────────────────────────────
  private onUserJoined() {
    if (!SessionController.getInstance().isHost()) return
    const users = SessionController.getInstance().getUsers()
    const humans = users ? users.length : 1
    this.humanCountProp.setPendingValue(humans)
    this.log.i(`User joined → ${humans} humans`)

    const phase = sStr(this.phaseProp, 'waiting')

    if (phase === 'waiting') {
      this.soloDecided = true
      this.phaseProp.setPendingValue('choosing')
      this.onPhaseChanged('choosing')
    } else if (phase === 'solo_setup') {
      for (let i = 1; i < MAX_SLOTS; i++) {
        this.nProps[i].setPendingValue('')
        this.cProps[i].setPendingValue(-1)
      }
      this.aiCountProp.setPendingValue(0)
      this.log.i('Switching solo → multiplayer choosing')
      this.phaseProp.setPendingValue('choosing')
      this.onPhaseChanged('choosing')
    }
  }

  private onUserLeft() {
    if (!SessionController.getInstance().isHost()) return
    const users = SessionController.getInstance().getUsers()
    const humans = users ? users.length : 1
    this.humanCountProp.setPendingValue(humans)
    this.log.i(`User left → ${humans} humans`)
  }

  // ── Solo setup: called from AshaSoloSetupPanel ────────────────────────
  public applySoloSetupAndStart(aiCount: number, totalRounds: number) {
    if (!this.ready || !SessionController.getInstance().isHost()) return
    if (sStr(this.phaseProp, '') !== 'solo_setup') return

    const humans = sInt(this.humanCountProp, 1)
    const ai = Math.min(5, Math.max(1, Math.floor(aiCount)))
    const rds = [3,5,7,10].indexOf(Math.floor(totalRounds)) >= 0 ? Math.floor(totalRounds) : 5

    this.aiCountProp.setPendingValue(ai)
    this.totalRdsProp.setPendingValue(rds)
    this.log.i(`Solo config: ${ai} AI, ${rds} rounds, humans at slots 0..${humans-1}, AI at slots ${humans}..${humans+ai-1}`)

    for (let i = 0; i < ai; i++) {
      const slot = humans + i
      const emoji = AI_EMOJIS[i % AI_EMOJIS.length]
      const name  = AI_NAMES[i % AI_NAMES.length]
      this.nProps[slot].setPendingValue(`${emoji} ${name}`)
    }

    this.phaseProp.setPendingValue('choosing')
    this.onPhaseChanged('choosing')
  }

  // ── Player submits choice (called from ElementHandPanel) ──────────────
  public submitChoice(elementId: number) {
    if (!this.ready || this.mySlot < 0) return
    if (sInt(this.cProps[this.mySlot], -1) !== -1) return

    this.log.i(`Slot ${this.mySlot} chose element ${elementId}`)
    this.cProps[this.mySlot].setPendingValue(elementId)
    this.lastHumanChoice = elementId
    this.checkAllChosen()
  }

  public getMySlot(): number { return this.mySlot }

  // ── Check readiness (host only) ───────────────────────────────────────
  private checkAllChosen() {
    if (!this.ready || !SessionController.getInstance().isHost()) return
    if (sStr(this.phaseProp, '') !== 'choosing') return

    const humans = sInt(this.humanCountProp, 1)
    const ai = sInt(this.aiCountProp, 0)
    const total = humans + ai
    if (total === 0) return

    // AI fills slots humans..humans+ai-1 (NEVER overlaps with human slots)
    for (let i = humans; i < humans + ai && i < MAX_SLOTS; i++) {
      if (sInt(this.cProps[i], -1) === -1) {
        this.cProps[i].setPendingValue(this.pickAi())
      }
    }

    let readyCount = 0
    for (let i = 0; i < total; i++) {
      if (sInt(this.cProps[i], -1) !== -1) readyCount++
    }

    if (readyCount < total) {
      this.log.i(`Waiting: ${readyCount}/${total} ready`)
      this.setText(this.statusText, `... Awaiting ${readyCount}/${total}`)
      return
    }

    this.resolveAndReveal(total)
  }

  private pickAi(): number {
    if (this.lastHumanChoice >= 0 && this.lastHumanChoice <= 4 && Math.random() < 0.3) {
      const counters = ELEMENTS[this.lastHumanChoice].loses
      return counters[Math.floor(Math.random() * counters.length)]
    }
    return Math.floor(Math.random() * 5)
  }

  // ── Resolution ────────────────────────────────────────────────────────
  private resolveAndReveal(total: number) {
    this.log.i('All chosen — resolving')
    this.phaseProp.setPendingValue('resolving')
    this.setText(this.statusText, 'Shuffling the astrolabe...')
    this.syncUi('resolving')

    const delay = this.createEvent('DelayedCallbackEvent')
    delay.bind(() => {
      const choices: number[] = []
      const names: string[] = []
      for (let i = 0; i < total; i++) {
        choices.push(sInt(this.cProps[i], 0))
        names.push(sStr(this.nProps[i], `Magi ${i+1}`))
      }

      const deltas = resolveRound(choices)

      for (let i = 0; i < total; i++) {
        const cur = sInt(this.sProps[i], 0)
        this.sProps[i].setPendingValue(cur + deltas[i])
      }

      this.buildBattleLog(names, choices, deltas, total)

      const trig = sInt(this.revealTrig, 0)
      this.revealTrig.setPendingValue(trig + 1)
      this.phaseProp.setPendingValue('reveal')
      this.setText(this.statusText, '')
      this.onReveal()
      this.onPhaseChanged('reveal')
    })
    delay.reset(Math.max(0, this.revealDelaySec))
  }

  private buildBattleLog(names: string[], choices: number[], deltas: number[], total: number) {
    const round = sInt(this.roundProp, 1)
    const lines: string[] = [`— Round ${round} Tauroctony —`]

    for (let i = 0; i < total; i++) {
      for (let j = i + 1; j < total; j++) {
        const ci = choices[i], cj = choices[j]
        const r = MATRIX[ci][cj]
        if (r === 0) {
          lines.push(`${ELEMENTS[ci].emoji} ${names[i]} & ${names[j]}: draw`)
        } else if (r === 1) {
          lines.push(`${ELEMENTS[ci].emoji} ${names[i]} ${getVerb(ci, cj)} ${names[j]}`)
        } else {
          lines.push(`${ELEMENTS[cj].emoji} ${names[j]} ${getVerb(cj, ci)} ${names[i]}`)
        }
      }
    }

    for (let i = 0; i < total; i++) {
      const d = deltas[i]
      const sign = d > 0 ? '+' : ''
      lines.push(`${names[i]}: ${sign}${d} (total ${sInt(this.sProps[i], 0)})`)
    }

    this.setText(this.battleLogText, lines.join('\n'))
  }

  // ── advanceToNextRound — wired to NextButton ──────────────────────────
  public advanceToNextRound() {
    if (!this.ready || !SessionController.getInstance().isHost()) return

    const phase = sStr(this.phaseProp, '')
    if (phase === 'gameover') { this.restartMatch(); return }

    if (this.nextRoundButton) this.nextRoundButton.enabled = false

    const round = sInt(this.roundProp, 1)
    const total = sInt(this.totalRdsProp, 5)

    if (round >= total) {
      this.log.i('Final round → game over')
      const t = sInt(this.goTrig, 0)
      this.goTrig.setPendingValue(t + 1)
      this.phaseProp.setPendingValue('gameover')
      this.onGameOver()
      this.onPhaseChanged('gameover')
    } else {
      const next = round + 1
      this.log.i(`→ Round ${next}`)
      this.roundProp.setPendingValue(next)
      const t = sInt(this.nextTrig, 0)
      this.nextTrig.setPendingValue(t + 1)
      this.phaseProp.setPendingValue('choosing')
      this.onNextRound()
      this.onPhaseChanged('choosing')
    }
  }

  private restartMatch() {
    this.log.i('Replay → restart')
    const humans = sInt(this.humanCountProp, 1)
    const ai = sInt(this.aiCountProp, 0)
    const total = humans + ai
    for (let i = 0; i < total; i++) {
      this.cProps[i].setPendingValue(-1)
      this.sProps[i].setPendingValue(0)
    }
    this.roundProp.setPendingValue(1)

    const nextPhase = humans <= 1 ? 'solo_setup' : 'choosing'
    this.phaseProp.setPendingValue(nextPhase)
    if (this.nextRoundButton) this.nextRoundButton.enabled = false
    this.setBtnLabel('NEXT ROUND')
    this.onPhaseChanged(nextPhase)
  }

  // ── Phase handler ─────────────────────────────────────────────────────
  private onPhaseChanged(phase: string) {
    this.log.i(`Phase → ${phase}`)

    if (phase === 'solo_setup') {
      this.setText(this.statusText, 'Solo Setup')
      this.setText(this.battleLogText,
        'Pick number of AI opponents (1-5) and rounds, then tap Begin')
    }

    if (phase === 'choosing') {
      const humans = sInt(this.humanCountProp, 1)
      const ai = sInt(this.aiCountProp, 0)
      const total = humans + ai
      for (let i = 0; i < total; i++) this.cProps[i].setPendingValue(-1)

      const r = sInt(this.roundProp, 1)
      const t = sInt(this.totalRdsProp, 5)
      this.setText(this.roundText, `Round ${r} of ${t}`)
      this.setText(this.statusText, 'Choose your element')
      this.setText(this.battleLogText,
        'Fire>Earth/Metal  Water>Fire/Metal  Earth>Water/Wind  Wind>Fire/Water  Metal>Earth/Wind')
    }

    this.syncUi(phase)
  }

  private onReveal() { this.log.i('Reveal') }

  private onNextRound() {
    this.log.i(`Round ${sInt(this.roundProp, 1)} starting`)
  }

  private onGameOver() {
    this.log.i('Game over')
    const humans = sInt(this.humanCountProp, 1)
    const ai = sInt(this.aiCountProp, 0)
    const total = humans + ai
    const rows: { name: string; score: number }[] = []
    for (let i = 0; i < total; i++) {
      rows.push({
        name: sStr(this.nProps[i], `Magi ${i+1}`),
        score: sInt(this.sProps[i], 0),
      })
    }
    rows.sort((a, b) => b.score - a.score)

    const medals = ['WINNER', '2nd', '3rd', '4th', '5th', '6th']
    const lines = rows.map((r, i) => `${medals[i] ?? ''} ${r.name}: ${r.score} pts`)
    this.setText(this.battleLogText, lines.join('\n'))
    this.setText(this.statusText, 'Game over')
    this.setBtnLabel('PLAY AGAIN')

    if (SessionController.getInstance().isHost()) {
      if (this.nextRoundButton) this.nextRoundButton.enabled = true
    }
  }

  // ── UI sync ───────────────────────────────────────────────────────────
  private syncUi(phase: string) {
    if (!this.ready) return
    const isSolo   = phase === 'solo_setup'
    const isChoose = phase === 'choosing'

    if (this.setupPanel) this.setupPanel.setVisible(isSolo)
    if (this.handPanel) this.handPanel.setEnabled(isChoose)

    if (phase === 'reveal' && SessionController.getInstance().isHost()) {
      const isFinal = sInt(this.roundProp, 1) >= sInt(this.totalRdsProp, 5)
      this.setBtnLabel(isFinal ? 'PLAY AGAIN' : 'NEXT ROUND')
      const d = this.createEvent('DelayedCallbackEvent')
      d.bind(() => { if (this.nextRoundButton) this.nextRoundButton.enabled = true })
      d.reset(3.0)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private setText(obj: SceneObject, val: string) {
    if (!obj) return
    const t = obj.getComponent('Component.Text')
    if (t) (t as any).text = val
  }

  private setBtnLabel(label: string) {
    if (!this.nextRoundButton) return
    const self = this.nextRoundButton.getComponent('Component.Text')
    if (self) { (self as any).text = label; return }
    const cc = this.nextRoundButton.getChildrenCount()
    for (let i = 0; i < cc; i++) {
      const t = this.nextRoundButton.getChild(i).getComponent('Component.Text')
      if (t) { (t as any).text = label; return }
    }
  }

  // ── Public getters for scoreboard UI ──────────────────────────────────
  public getSlotCount(): number {
    return sInt(this.humanCountProp, 0) + sInt(this.aiCountProp, 0)
  }
  public getSlotName(i: number): string { return i < MAX_SLOTS ? sStr(this.nProps[i], '') : '' }
  public getSlotScore(i: number): number { return i < MAX_SLOTS ? sInt(this.sProps[i], 0) : 0 }
  public getSlotChoice(i: number): number { return i < MAX_SLOTS ? sInt(this.cProps[i], -1) : -1 }
}
