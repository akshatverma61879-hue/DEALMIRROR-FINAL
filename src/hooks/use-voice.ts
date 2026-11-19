"use client";

import * as React from "react";
import type { Language } from "@/lib/types";
import { VOICE_STYLE, type BuyerTone } from "@/lib/practice/tone";

export type VoiceSource = "server" | "browser";
export interface VoiceState {
  playingId: string | null;
  paused: boolean;
  loadingId: string | null;
  /** Which engine spoke the last message, e.g. "Sarvam voice" or "Browser voice (hi-IN)". */
  lastEngine: string | null;
  serverProvider: string | null; // "sarvam" | "elevenlabs" | "fish" | "none" | null (unknown)
  serverError: string | null;
  browserSupported: boolean;
}

const PROVIDER_LABEL: Record<string, string> = { sarvam: "Sarvam voice", elevenlabs: "ElevenLabs voice", fish: "Fish Audio voice" };

/** BCP-47 tag for the browser voice. Hinglish (Roman script) defaults to en-IN; user can switch to hi-IN. */
export function browserLang(language: Language, hinglishVoice: "en-IN" | "hi-IN") {
  if (language === "Hindi") return "hi-IN";
  if (language === "Hinglish") return hinglishVoice;
  return "en-IN";
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) ??
    null
  );
}

/**
 * Splits a reply into speakable chunks at sentence ends (., !, ?, Hindi danda). The first chunk is
 * kept short so audio starts quickly; later ones are merged up to ~220 characters.
 */
export function splitForSpeech(text: string): string[] {
  // Break only where punctuation is followed by whitespace, so "3.5 lakh" or "v2.1" stay whole.
  const sentences = text.split(/(?<=[.!?।॥])\s+|\n+/).filter((s) => s.trim());
  const out: string[] = [];
  let cur = "";
  for (const sentence of sentences) {
    if (cur && (cur + " " + sentence).length > 220) {
      out.push(cur.trim());
      cur = "";
    }
    cur += (cur ? " " : "") + sentence;
    if (out.length === 0 && cur.trim().length >= 30) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  const chunks = out.filter(Boolean);
  return chunks.length ? chunks : [text];
}

/**
 * Optional playback of the fictional buyer's lines.
 * Order: server voice (if configured and working) → browser speech synthesis.
 * Only the buyer's visible text is sent to /api/tts.
 */
export function useVoice(opts: { language: Language; hinglishVoice: "en-IN" | "hi-IN"; serverAllowed?: boolean }) {
  const serverAllowed = opts.serverAllowed ?? true;
  const [state, setState] = React.useState<VoiceState>({
    playingId: null,
    paused: false,
    loadingId: null,
    lastEngine: null,
    serverProvider: null,
    serverError: null,
    browserSupported: false,
  });
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  /** Per message: one pending audio URL per chunk, fetched in parallel. */
  const cache = React.useRef(new Map<string, Promise<string>[]>());
  const serverDisabled = React.useRef(false);
  const mode = React.useRef<VoiceSource | null>(null);
  // Each play() reads a token; stop() bumps it so an older play loop exits quietly.
  const playToken = React.useRef(0);
  const finishRef = React.useRef<(() => void) | null>(null);
  const pausedRef = React.useRef(false);

  React.useEffect(() => {
    const browserSupported = typeof window !== "undefined" && "speechSynthesis" in window;
    if (browserSupported) window.speechSynthesis.getVoices(); // warm up voice list
    let cancelled = false;
    if (!serverAllowed) {
      // Sample Demo: browser voice only, no request to any AI or voice service.
      serverDisabled.current = true;
      setState((s) => ({ ...s, browserSupported, serverProvider: "none" }));
      return;
    }
    fetch("api/tts")
      .then((r) => (r.ok ? r.json() : { provider: "none" }))
      .catch(() => ({ provider: "none" }))
      .then((d: { provider?: string }) => {
        if (cancelled) return;
        const provider = d?.provider ?? "none";
        serverDisabled.current = provider === "none";
        setState((s) => ({ ...s, browserSupported, serverProvider: provider }));
      });
    const urls = cache.current;
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      if (browserSupported) window.speechSynthesis.cancel();
      urls.forEach((list) => list.forEach((p) => p.then((u) => URL.revokeObjectURL(u), () => undefined)));
    };
  }, [serverAllowed]);

  const stop = React.useCallback(() => {
    playToken.current++;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const finish = finishRef.current;
    finishRef.current = null;
    finish?.();
    pausedRef.current = false;
    mode.current = null;
    setState((s) => ({ ...s, playingId: null, paused: false, loadingId: null }));
  }, []);

  /** Speaks with the browser voice; resolves when speech ends or is cancelled. */
  const speakBrowser = React.useCallback(
    (id: string, text: string, tone: BuyerTone = "NEUTRAL") =>
      new Promise<void>((resolve) => {
        if (!("speechSynthesis" in window)) {
          setState((s) => ({ ...s, playingId: null, loadingId: null, lastEngine: "No voice available in this browser" }));
          return resolve();
        }
        const lang = browserLang(opts.language, opts.hinglishVoice);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        const v = pickVoice(lang);
        if (v) u.voice = v;
        // Tone: frustrated is quicker and lower, warm is slower and brighter (see practice/tone.ts).
        const style = VOICE_STYLE[tone];
        u.rate = 0.98 * style.rate;
        u.pitch = style.pitch;
        u.volume = style.volume;
        const done = () => {
          if (finishRef.current === done) finishRef.current = null;
          setState((s) => (s.playingId === id ? { ...s, playingId: null, paused: false } : s));
          resolve();
        };
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        finishRef.current = done;
        mode.current = "browser";
        setState((s) => ({
          ...s,
          playingId: id,
          paused: false,
          loadingId: null,
          lastEngine: `Browser voice (${v ? `${v.name}, ` : ""}${lang})${v ? "" : " — no matching voice installed"}`,
        }));
      }),
    [opts.language, opts.hinglishVoice],
  );

  const fetchChunk = React.useCallback(
    async (text: string, tone: BuyerTone) => {
      const res = await fetch("api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language: opts.language, tone }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error?.message ?? `Voice service error (HTTP ${res.status}).`);
      }
      return URL.createObjectURL(await res.blob());
    },
    [opts.language],
  );

  /** Plays one audio URL; resolves when it ends (or stop() is called), rejects if it cannot play. */
  const playUrl = React.useCallback(
    (url: string) =>
      new Promise<void>((resolve, reject) => {
        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.src = url;
        const done = () => {
          if (finishRef.current === done) finishRef.current = null;
          resolve();
        };
        finishRef.current = done;
        audio.onended = done;
        audio.onerror = () => reject(new Error("Audio could not be decoded."));
        if (pausedRef.current) return; // paused between chunks: resume() starts it
        audio.play().catch(reject);
      }),
    [],
  );

  /**
   * Speaks a buyer message in its tone and resolves when it has finished (or was stopped).
   * The text is split into sentences that are synthesised in parallel; playback starts as soon as
   * the first one is ready instead of waiting for the whole reply to be converted.
   */
  const play = React.useCallback(
    async (id: string, text: string, tone: BuyerTone = "NEUTRAL"): Promise<void> => {
      stop();
      const token = playToken.current;
      if (serverDisabled.current) return speakBrowser(id, text, tone);

      const parts = splitForSpeech(text);
      setState((s) => ({ ...s, loadingId: id }));
      let chunks = cache.current.get(id);
      if (!chunks) {
        chunks = parts.map((t) => {
          const p = fetchChunk(t, tone);
          p.catch(() => undefined); // awaited below; avoids unhandled-rejection noise
          return p;
        });
        cache.current.set(id, chunks);
      }

      for (let i = 0; i < chunks.length; i++) {
        let url: string;
        try {
          url = await chunks[i];
        } catch (e) {
          if (token !== playToken.current) return;
          cache.current.delete(id);
          serverDisabled.current = true; // don't retry a failing provider on every message
          setState((s) => ({ ...s, serverError: `${(e as Error).message} Switched to the browser voice.` }));
          return speakBrowser(id, parts.slice(i).join(" "), tone);
        }
        if (token !== playToken.current) return;
        try {
          const playing = playUrl(url);
          mode.current = "server";
          setState((s) => ({
            ...s,
            playingId: id,
            loadingId: null,
            lastEngine: PROVIDER_LABEL[s.serverProvider ?? ""] ?? "Server voice",
          }));
          await playing;
        } catch {
          // Autoplay blocked or decode failed → browser voice for the rest.
          if (token !== playToken.current) return;
          return speakBrowser(id, parts.slice(i).join(" "), tone);
        }
        if (token !== playToken.current) return;
      }
      setState((s) => (s.playingId === id ? { ...s, playingId: null, paused: false, loadingId: null } : s));
    },
    [fetchChunk, playUrl, speakBrowser, stop],
  );

  const pause = React.useCallback(() => {
    pausedRef.current = true;
    if (mode.current === "server") audioRef.current?.pause();
    else window.speechSynthesis?.pause();
    setState((s) => ({ ...s, paused: true }));
  }, []);

  const resume = React.useCallback(() => {
    pausedRef.current = false;
    if (mode.current === "server") void audioRef.current?.play();
    else window.speechSynthesis?.resume();
    setState((s) => ({ ...s, paused: false }));
  }, []);

  /** Lets the team re-enable the server voice after fixing a key. */
  const retryServer = React.useCallback(() => {
    serverDisabled.current = state.serverProvider === "none";
    setState((s) => ({ ...s, serverError: null }));
  }, [state.serverProvider]);

  return { ...state, play, pause, resume, stop, retryServer };
}
