/** Storefront notification chime (SS-900). WebAudio only, no asset. */
let context: AudioContext | null = null;
let unlocked = false;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

export function unlockNotificationSound(): void {
  if (unlocked) return;
  const ctx = audioContext();
  if (!ctx) return;
  void ctx
    .resume()
    .then(() => {
      unlocked = true;
    })
    .catch(() => undefined);
}

export function playNotificationSound(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    gain.connect(ctx.destination);
    const first = ctx.createOscillator();
    first.type = 'sine';
    first.frequency.setValueAtTime(880, now);
    first.connect(gain);
    first.start(now);
    first.stop(now + 0.22);
    const second = ctx.createOscillator();
    second.type = 'sine';
    second.frequency.setValueAtTime(1174.66, now + 0.18);
    second.connect(gain);
    second.start(now + 0.18);
    second.stop(now + 0.5);
  } catch {
    // Enhancement only.
  }
}
