"use client";

import * as React from "react";

/* Minimal typings for the Web Speech API (not in TS DOM lib everywhere). */
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getCtor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. You can allow it in the browser's site settings, or type your answer.",
  "service-not-allowed": "Speech recognition is blocked in this browser. Please type your answer.",
  "no-speech": "No speech was detected. Try again closer to the microphone.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs an internet connection in this browser.",
  "language-not-supported": "This browser cannot recognise the selected language. Try English (India) or type.",
};

/** Sarvam's REST speech-to-text is for short clips; stop a little before 30 s. */
const MAX_RECORDING_MS = 28_000;
/** Hands-free: stop this long after the speaker goes quiet. */
const SILENCE_MS = 1_200;
/** Hands-free: give up if nothing is said within this time. */
const NO_SPEECH_MS = 8_000;

/**
 * Calls onSilence once the speaker has talked and then been quiet for SILENCE_MS, or onNoSpeech
 * if nobody spoke at all. Returns a cleanup function.
 */
function watchSilence(stream: MediaStream, onSilence: () => void, onNoSpeech: () => void): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const t0 = performance.now();
  let noise = 0;
  let noiseSamples = 0;
  let spoke = false;
  let lastLoud = t0;
  let fired = false;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();
    if (now - t0 < 300) {
      noise += rms; // short calibration of the room's background level
      noiseSamples++;
      return;
    }
    const threshold = Math.min(0.06, Math.max(0.012, (noise / Math.max(1, noiseSamples)) * 2.5));
    if (rms > threshold) {
      spoke = true;
      lastLoud = now;
    }
    if (fired) return;
    if (spoke && now - lastLoud > SILENCE_MS) {
      fired = true;
      onSilence();
    } else if (!spoke && now - t0 > NO_SPEECH_MS) {
      fired = true;
      onNoSpeech();
    }
  }, 100);
  return () => {
    clearInterval(timer);
    void ctx.close().catch(() => undefined);
  };
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

function canRecord() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Speech-to-text for the salesperson's answer. Permission is requested only when start() is called from a click.
 *  - "server": records a short clip and sends it to /api/stt (Sarvam), when the server has it configured.
 *  - "browser": the browser's Web Speech API (live interim text), used otherwise or after a server failure.
 * `text` holds the words of the current recording. `serverAllowed: false` (Sample Demo) never uploads audio.
 * Hands-free (`start(lang, true)`): recording stops by itself when the speaker goes quiet, and the
 * final text is passed to `onFinal` so the caller can send it without a second click.
 */
export function useSpeechRecognition(
  opts: { serverAllowed?: boolean; onFinal?: (text: string) => void; onNoSpeech?: () => void } = {},
) {
  const serverAllowed = opts.serverAllowed ?? true;
  const onFinalRef = React.useRef(opts.onFinal);
  const onNoSpeechRef = React.useRef(opts.onNoSpeech);
  React.useEffect(() => {
    onFinalRef.current = opts.onFinal;
    onNoSpeechRef.current = opts.onNoSpeech;
  });
  const [engine, setEngine] = React.useState<"server" | "browser" | null>(null);
  const [listening, setListening] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  /** Hands-free silence is not an error when the caller handles it (e.g. by listening again). */
  const noSpeech = React.useCallback(() => {
    if (onNoSpeechRef.current) onNoSpeechRef.current();
    else setError(ERRORS["no-speech"]);
  }, []);
  const mediaRef = React.useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    timer: ReturnType<typeof setTimeout>;
    discard: boolean;
    unwatch: () => void;
  } | null>(null);

  React.useEffect(() => {
    // Feature detection must run after mount (window is not available during prerender).
    let cancelled = false;
    const browser = !!getCtor();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEngine(browser ? "browser" : null);
    if (serverAllowed && canRecord()) {
      fetch("api/stt")
        .then((r) => (r.ok ? r.json() : { provider: "none" }))
        .catch(() => ({ provider: "none" }))
        .then((d: { provider?: string }) => {
          if (!cancelled && d?.provider && d.provider !== "none") setEngine("server");
        });
    }
    return () => {
      cancelled = true;
      recRef.current?.abort();
      const m = mediaRef.current;
      if (m) {
        m.discard = true;
        clearTimeout(m.timer);
        m.unwatch();
        if (m.recorder.state !== "inactive") m.recorder.stop();
        m.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [serverAllowed]);

  const startBrowser = React.useCallback((lang: string, handsFree: boolean) => {
    const Ctor = getCtor();
    if (!Ctor) return;
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    let finals = "";
    let latest = "";
    let aborted = false;
    // Hands-free: stop after a pause in results, or if nothing is heard at all.
    let quiet: ReturnType<typeof setTimeout> | null = handsFree ? setTimeout(() => rec.stop(), NO_SPEECH_MS) : null;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      latest = (finals + interim).replace(/\s+/g, " ").trim();
      setText(latest);
      if (handsFree) {
        if (quiet) clearTimeout(quiet);
        quiet = setTimeout(() => rec.stop(), SILENCE_MS + 300);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") aborted = true;
      else if (e.error === "no-speech" && handsFree) return; // handled in onend
      else setError(ERRORS[e.error] ?? `Speech recognition stopped (${e.error}).`);
    };
    rec.onend = () => {
      if (quiet) clearTimeout(quiet);
      setListening(false);
      if (recRef.current === rec) recRef.current = null;
      if (!handsFree || aborted) return;
      if (latest) onFinalRef.current?.(latest);
      else noSpeech();
    };
    setText("");
    setError(null);
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setError("Could not start the microphone. Please type your answer.");
    }
  }, [noSpeech]);

  const startServer = React.useCallback(async (lang: string, handsFree: boolean) => {
    setText("");
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as Error).name;
      setError(name === "NotAllowedError" ? ERRORS["not-allowed"] : name === "NotFoundError" ? ERRORS["audio-capture"] : "Could not start the microphone. Please type your answer.");
      return;
    }
    const mimeType = pickMime();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopRecorder = () => recorder.state !== "inactive" && recorder.stop();
    let silent = false;
    const entry = {
      recorder,
      stream,
      discard: false,
      timer: setTimeout(stopRecorder, MAX_RECORDING_MS),
      unwatch: handsFree
        ? watchSilence(stream, stopRecorder, () => {
            silent = true;
            stopRecorder();
          })
        : () => {},
    };
    recorder.onstop = async () => {
      clearTimeout(entry.timer);
      entry.unwatch();
      stream.getTracks().forEach((t) => t.stop());
      if (mediaRef.current === entry) mediaRef.current = null;
      setListening(false);
      if (silent) return noSpeech(); // don't upload silence
      if (entry.discard || chunks.length === 0) return;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
      const form = new FormData();
      form.append("file", new Blob(chunks, { type: type.split(";")[0] }), `answer.${ext}`);
      form.append("language", lang);
      setTranscribing(true);
      try {
        const res = await fetch("api/stt", { method: "POST", body: form });
        const d = await res.json().catch(() => null);
        if (!res.ok) throw new Error(d?.error?.message ?? `Speech-to-text error (HTTP ${res.status}).`);
        const t = String(d?.text ?? "").trim();
        if (!t) {
          if (handsFree) noSpeech();
          else setError(ERRORS["no-speech"]);
        } else {
          setText(t);
          if (handsFree) onFinalRef.current?.(t);
        }
      } catch (e) {
        // Don't keep failing on every answer: switch to the browser engine if there is one.
        const fallback = !!getCtor();
        setEngine(fallback ? "browser" : null);
        setError(`${(e as Error).message} ${fallback ? "Switched to the browser's speech recognition — please record again." : "Please type your answer."}`);
      } finally {
        setTranscribing(false);
      }
    };
    try {
      recorder.start();
      mediaRef.current = entry;
      setListening(true);
    } catch {
      clearTimeout(entry.timer);
      entry.unwatch();
      stream.getTracks().forEach((t) => t.stop());
      setError("Could not start the microphone. Please type your answer.");
    }
  }, [noSpeech]);

  /** Starts recording. With `handsFree`, it stops on silence and calls `onFinal` with the text. */
  const start = React.useCallback(
    (lang: string, handsFree = false) => {
      if (transcribing) return;
      if (engine === "server") void startServer(lang, handsFree);
      else if (engine === "browser") startBrowser(lang, handsFree);
    },
    [engine, startBrowser, startServer, transcribing],
  );

  /** Stops recording. In server mode, the clip is then transcribed and `text` updates when ready. */
  const stop = React.useCallback(() => {
    const m = mediaRef.current;
    if (m && m.recorder.state !== "inactive") m.recorder.stop();
    recRef.current?.stop();
    setListening(false);
  }, []);

  /** Stops recording and throws the recording away (e.g. the answer was sent by typing). */
  const cancel = React.useCallback(() => {
    const m = mediaRef.current;
    if (m) {
      m.discard = true;
      if (m.recorder.state !== "inactive") m.recorder.stop();
    }
    recRef.current?.abort();
    setListening(false);
    setText("");
  }, []);

  return {
    supported: engine !== null,
    engine,
    listening,
    transcribing,
    text,
    error,
    start,
    stop,
    cancel,
    clearError: () => setError(null),
  };
}
