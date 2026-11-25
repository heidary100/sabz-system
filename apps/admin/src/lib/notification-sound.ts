/**
 * Notification sound (SS-900). A short two-note WebAudio chime — no external
 * asset, no autoplay violation. Browsers keep an AudioContext suspended until
 * a user gesture; the provider resumes it on the first pointer/key event and
 * silently does nothing when playback is still blocked.
 */
let context: AudioContext | null = null
let unlocked = false

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) {
    return null
  }
  context ??= new Ctor()
  return context
}

export function unlockNotificationSound(): void {
  if (unlocked) {
    return
  }
  const ctx = audioContext()
  if (!ctx) {
    return
  }
  void ctx
    .resume()
    .then(() => {
      unlocked = true
    })
    .catch(() => undefined)
}

export function playNotificationSound(): void {
  const ctx = audioContext()
  if (!ctx || ctx.state !== 'running') {
    return
  }
  try {
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    gain.connect(ctx.destination)
    const first = ctx.createOscillator()
    first.type = 'sine'
    first.frequency.setValueAtTime(880, now)
    first.connect(gain)
    first.start(now)
    first.stop(now + 0.22)
    const second = ctx.createOscillator()
    second.type = 'sine'
    second.frequency.setValueAtTime(1174.66, now + 0.18)
    second.connect(gain)
    second.start(now + 0.18)
    second.stop(now + 0.5)
  } catch {
    // Sound is an enhancement; a failed chime must never affect the UI.
  }
}
