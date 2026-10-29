// SLSound.swift — the app's few sounds, each short and quiet, each for a
// moment already marked on screen: a set saved, food logged, a record, a
// workout done. The Sounds switch in Account (`setline.sounds`) turns them off.
//
// Played through Web Audio so they mix with other audio and start without
// delay; the browser only lets audio start after the first touch, so the
// context is opened on the first pointer-down anywhere in the page.
import { UserDefaults } from "./swiftui";
import { assetURL } from "./support";

export type SLSound = "tick" | "pop" | "chime" | "success";

let context: AudioContext | undefined;
let prepared = false;
const buffers = new Map<SLSound, AudioBuffer>();
const loading = new Map<SLSound, Promise<AudioBuffer | undefined>>();
const playing = new Map<SLSound, AudioBufferSourceNode>();

export const SLSound = {
  /** A set saved: a soft click. */
  tick: "tick" as SLSound,
  /** Food logged, kudos given: a small rising pop. */
  pop: "pop" as SLSound,
  /** A record, a goal met, a badge: two bell notes. */
  chime: "chime" as SLSound,
  /** A workout finished: a short rising arpeggio. */
  success: "success" as SLSound,
  allCases: ["tick", "pop", "chime", "success"] as SLSound[],

  preferenceKey: "setline.sounds",

  /** `UserDefaults.standard.object(forKey:) as? Bool ?? true`. */
  get isOn(): boolean {
    const value = UserDefaults.get<unknown>(SLSound.preferenceKey);
    return typeof value === "boolean" ? value : true;
  },

  /** `sound.play()`: restarts the sound if it is still playing, as AVAudioPlayer does. */
  play(self: SLSound): void {
    if (!SLSound.isOn) return;
    prepare();
    const ctx = context;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const start = (buffer: AudioBuffer) => {
      try {
        playing.get(self)?.stop();
      } catch {
        /* already ended */
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = self === "tick" ? 0.5 : 0.7;
      source.connect(gain).connect(ctx.destination);
      source.onended = () => {
        if (playing.get(self) === source) playing.delete(self);
      };
      playing.set(self, source);
      source.start();
    };
    const buffer = buffers.get(self);
    if (buffer) start(buffer);
    else void loading.get(self)?.then((b) => b && start(b));
  },

  /**
   * The system camera shutter (`AudioServicesPlaySystemSound(1108)`). The web
   * has no system sounds, so it plays the soft click instead.
   */
  shutter(): void {
    if (!SLSound.isOn) return;
    SLSound.play("tick");
  },
};

function prepare(): void {
  if (prepared) return;
  prepared = true;
  const Ctor: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return;
  const ctx = new Ctor();
  context = ctx;
  for (const sound of SLSound.allCases) {
    loading.set(
      sound,
      fetch(assetURL(`sounds/${sound}.wav`))
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          buffers.set(sound, buffer);
          return buffer;
        })
        .catch(() => undefined),
    );
  }
}

// Open the audio context on the first touch, so a sound that plays later from
// a timer (the celebration's chime) is allowed to.
if (typeof document !== "undefined") {
  const unlock = () => {
    if (!SLSound.isOn) return;
    prepare();
    if (context?.state === "suspended") void context.resume().catch(() => {});
    document.removeEventListener("pointerdown", unlock, true);
  };
  document.addEventListener("pointerdown", unlock, true);
}
