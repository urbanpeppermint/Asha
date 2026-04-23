/**
 * Enhancement 3 + 6 — spatial-ish game audio (additive).
 * Import WAVs into Lens Studio, then assign tracks in the Inspector.
 */
@component
export class AshaAudio extends BaseScriptComponent {

  @input('Asset.AudioTrackAsset[]') elementSounds: AudioTrackAsset[] = []
  @input revealSound: AudioTrackAsset
  @input winSound: AudioTrackAsset
  @input loseSound: AudioTrackAsset
  @input hoverSound: AudioTrackAsset
  @input orbAudioComponent: AudioComponent
  @input opponentAudioSources: AudioComponent[] = []

  public playElementPick(elementId: number) {
    const t = this.elementSounds[elementId]
    if (!t || !this.orbAudioComponent) return
    this.orbAudioComponent.audioTrack = t
    this.orbAudioComponent.play(1)
  }

  public playReveal() {
    if (!this.revealSound || !this.orbAudioComponent) return
    this.orbAudioComponent.audioTrack = this.revealSound
    this.orbAudioComponent.play(1)
  }

  public playRoundResult(localPlayerWon: boolean) {
    if (!this.orbAudioComponent) return
    const t = localPlayerWon ? this.winSound : this.loseSound
    if (!t) return
    this.orbAudioComponent.audioTrack = t
    this.orbAudioComponent.play(1)
  }

  public playHover() {
    if (!this.hoverSound || !this.orbAudioComponent) return
    this.orbAudioComponent.audioTrack = this.hoverSound
    this.orbAudioComponent.play(1)
  }

  public playOpponentReveal(opponentIndex: number, elementId: number) {
    const src = this.opponentAudioSources[opponentIndex]
    const t = this.elementSounds[elementId]
    if (!src || !t) return
    src.audioTrack = t
    src.play(1)
  }

  public updateOpponentPositions(positions: vec3[]) {
    positions.forEach((pos, i) => {
      const src = this.opponentAudioSources[i]
      if (src) src.getSceneObject().getTransform().setWorldPosition(pos)
    })
  }
}
