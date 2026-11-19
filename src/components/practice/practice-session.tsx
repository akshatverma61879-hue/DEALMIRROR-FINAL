"use client";

import * as React from "react";
import {
  Mic,
  MicOff,
  SendHorizontal,
  Square,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Loader2,
  RotateCcw,
  ListRestart,
  Flag,
  ShieldAlert,
  UserRound,
  AlertOctagon,
  Info,
  Phone,
  PhoneOff,
  Keyboard,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeal, type PracticeState } from "@/components/deal-context";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useVoice } from "@/hooks/use-voice";
import { checkSellerMessage, flagsFor } from "@/lib/practice/compliance";
import { scriptedBuyerReply, scriptedScorecard } from "@/lib/practice/scripted";
import { newId, postJson, type ApiError } from "@/lib/practice/client";
import { TONE_META, toneFromStance, type BuyerTone } from "@/lib/practice/tone";
import { detectVoiceCommand } from "@/lib/practice/voice-commands";
import type { BuyerStance, PracticeMessage, Scorecard } from "@/lib/practice/types";
import { PracticeScorecard } from "./practice-scorecard";

const STANCE: Record<BuyerStance, { label: string; variant: "red" | "amber" | "teal" | "green" }> = {
  SCEPTICAL: { label: "Sceptical", variant: "red" },
  PROBING: { label: "Probing", variant: "amber" },
  SOFTENING: { label: "Softening", variant: "teal" },
  READY_FOR_NEXT_STEP: { label: "Open to a next step", variant: "green" },
};

const SUGGESTED_TURNS = 6;
/** In a voice call, silence re-opens the mic this many times before the call pauses. */
const MAX_SILENT_RETRIES = 2;

type CallState = "off" | "on" | "paused";
type Phase = "off" | "paused" | "thinking" | "speaking" | "transcribing" | "listening" | "waiting";

const toneOf = (m: PracticeMessage): BuyerTone => m.tone ?? toneFromStance(m.stance);

/** Spoken summary of the scorecard, so a voice-only practice ends without reading. */
function scorecardSpeech(card: Scorecard) {
  const good = card.strengths[0];
  const fix = card.suggestions[0] ?? card.weaknesses[0];
  return [`Practice finished. Your score is ${card.overall} out of 100.`, good && `What went well: ${good}`, fix && `To improve: ${fix}`]
    .filter(Boolean)
    .join(" ");
}

function PersonaCard({ p }: { p: PracticeState }) {
  const { persona, context } = p;
  return (
    <Card>
      <CardHeader className="gap-2">
        <Badge variant="mock" className="self-start">Fictional practice buyer · not the real buyer</Badge>
        {p.mode === "scripted" && <Badge variant="amber" className="self-start">Sample Demo — scripted buyer, no AI</Badge>}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-slate-900 text-white">
            <UserRound className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{persona.name}</CardTitle>
            <CardDescription>{persona.role}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Objection</p>
          <p dir="auto" className="mt-0.5 text-slate-800">{persona.objectionSummary}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Negotiation style</p>
          <p dir="auto" className="mt-0.5 text-slate-700">{persona.negotiationStyle}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Business concerns</p>
          <ul className="mt-1 space-y-1.5">
            {persona.businessConcerns.map((c) => (
              <li key={c.text} className="flex items-start justify-between gap-2">
                <span dir="auto" className="text-slate-700">{c.text}</span>
                <Badge variant={c.source === "TRANSCRIPT" ? "teal" : "neutral"} className="shrink-0 font-normal">
                  {c.source === "TRANSCRIPT" ? "From the call" : "Simulated"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>Language</span>
          <Badge variant="neutral">{context.language}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function VoicePanel({
  voice,
  enabled,
  setEnabled,
  autoplay,
  setAutoplay,
  hinglishVoice,
  setHinglishVoice,
  language,
}: {
  voice: ReturnType<typeof useVoice>;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  autoplay: boolean;
  setAutoplay: (v: boolean) => void;
  hinglishVoice: "en-IN" | "hi-IN";
  setHinglishVoice: (v: "en-IN" | "hi-IN") => void;
  language: string;
}) {
  const provider =
    voice.serverProvider && voice.serverProvider !== "none" && !voice.serverError
      ? `${voice.serverProvider === "sarvam" ? "Sarvam" : voice.serverProvider === "elevenlabs" ? "ElevenLabs" : "Fish Audio"} voice, browser voice as backup`
      : voice.browserSupported
        ? "Browser voice (free, built in)"
        : "No voice available in this browser";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">{enabled ? <Volume2 className="size-4 text-teal-700" /> : <VolumeX className="size-4 text-slate-400" />} Buyer voice</CardTitle>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={cn("relative h-5 w-9 rounded-full transition-colors", enabled ? "bg-teal-700" : "bg-slate-300")}
            aria-label="Buyer voice"
          >
            <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", enabled ? "left-[18px]" : "left-0.5")} />
          </button>
        </div>
        <CardDescription>{provider}. The tone changes with the conversation: frustrated, sceptical, curious, warm.</CardDescription>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-2.5 text-xs text-slate-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} className="accent-teal-700" />
            When typing: play each new buyer message automatically
          </label>
          {language === "Hinglish" && (
            <div>
              <p className="mb-1">Browser voice for Hinglish (Roman script):</p>
              <div className="flex gap-1">
                {(["en-IN", "hi-IN"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setHinglishVoice(v)}
                    className={cn("rounded-md border px-2 py-1", hinglishVoice === v ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200")}
                  >
                    {v === "en-IN" ? "English (India)" : "Hindi (India)"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-slate-400">Hinglish voice quality varies by browser and provider. Listen and pick what sounds natural.</p>
            </div>
          )}
          {voice.lastEngine && <p className="text-slate-400">Last played with: {voice.lastEngine}</p>}
          {voice.serverError && (
            <p className="flex items-start gap-1.5 text-amber-800"><Info className="mt-px size-3.5 shrink-0" /> {voice.serverError}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function AudioControls({ m, voice }: { m: PracticeMessage; voice: ReturnType<typeof useVoice> }) {
  const playing = voice.playingId === m.id;
  const loading = voice.loadingId === m.id;
  return (
    <div className="mt-1.5 flex items-center gap-1">
      {loading ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Loader2 className="size-3 animate-spin" /> Loading voice…</span>
      ) : playing ? (
        <>
          <button onClick={voice.paused ? voice.resume : voice.pause} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={voice.paused ? "Resume" : "Pause"}>
            {voice.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
          <button onClick={voice.stop} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Stop">
            <Square className="size-3.5" />
          </button>
          <span className="text-[11px] text-slate-400">{voice.paused ? "Paused" : "Playing"}</span>
        </>
      ) : (
        <button onClick={() => voice.play(m.id, m.text, toneOf(m))} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100" aria-label="Play buyer message">
          <Play className="size-3" /> Play
        </button>
      )}
    </div>
  );
}

const PHASE_STYLE: Record<Phase, { ring: string; dot: string }> = {
  off: { ring: "ring-slate-200", dot: "bg-slate-300" },
  paused: { ring: "ring-slate-200", dot: "bg-slate-400" },
  waiting: { ring: "ring-slate-200", dot: "bg-slate-400" },
  thinking: { ring: "ring-amber-200", dot: "bg-amber-500" },
  speaking: { ring: "ring-teal-200", dot: "bg-teal-600" },
  transcribing: { ring: "ring-teal-200", dot: "bg-teal-600" },
  listening: { ring: "ring-red-200", dot: "bg-red-600" },
};

export function PracticeSession() {
  const { practice, setPractice, input } = useDeal();
  const p = practice!;
  const scripted = p.mode === "scripted";
  const [draft, setDraft] = React.useState("");
  const [viaMic, setViaMic] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [evaluating, setEvaluating] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [voiceOn, setVoiceOn] = React.useState(true);
  const [autoplay, setAutoplay] = React.useState(true);
  const [hinglishVoice, setHinglishVoice] = React.useState<"en-IN" | "hi-IN">("en-IN");
  const [micLang, setMicLang] = React.useState(p.context.language === "Hindi" ? "hi-IN" : "en-IN");
  const [keyboard, setKeyboard] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  // Voice call: buyer speaks → mic opens → you talk → it sends when you pause → buyer replies → …
  const [call, setCallState] = React.useState<CallState>("off");
  const callRef = React.useRef<CallState>("off");
  const setCall = (c: CallState) => {
    callRef.current = c;
    setCallState(c);
  };
  const silentRetries = React.useRef(0);

  const voice = useVoice({ language: p.context.language, hinglishVoice, serverAllowed: !scripted });
  const onSpokenRef = React.useRef<(text: string) => void>(() => {});
  const onSilenceRef = React.useRef<() => void>(() => {});
  const sr = useSpeechRecognition({
    serverAllowed: !scripted,
    onFinal: (t) => onSpokenRef.current(t),
    onNoSpeech: () => onSilenceRef.current(),
  });
  // Latest hook values for callbacks that run after awaits or timers.
  const voiceRef = React.useRef(voice);
  const srRef = React.useRef(sr);
  const listeningRef = React.useRef(false);
  React.useEffect(() => {
    voiceRef.current = voice;
    srRef.current = sr;
    listeningRef.current = sr.listening || sr.transcribing;
  });
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const baseDraft = React.useRef("");

  const rulesCtx = React.useMemo(
    () => ({ privateRules: input.privateRules, productFacts: input.productFacts, transcript: input.transcript }),
    [input.privateRules, input.productFacts, input.transcript],
  );
  const liveFlags = draft.trim() ? flagsFor(checkSellerMessage(draft, rulesCtx)) : [];
  const sellerTurns = p.messages.filter((m) => m.role === "seller").length;
  const done = !!p.scorecard;
  const lastBuyer = [...p.messages].reverse().find((m) => m.role === "buyer");

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [p.messages.length, sending]);

  // Typing mode: dictated words stream into the editable draft. (In a call they are sent directly.)
  React.useEffect(() => {
    if (callRef.current === "off" && (sr.listening || sr.text)) setDraft((baseDraft.current ? baseDraft.current + " " : "") + sr.text);
  }, [sr.text, sr.listening]);

  /* ---------- call control ---------- */

  const listenHandsFree = () => {
    if (callRef.current !== "on" || listeningRef.current) return;
    baseDraft.current = "";
    setViaMic(true);
    srRef.current.start(micLang, true);
  };

  /** Speaks a buyer line in its tone, then opens the mic if the call is still on. Never records the buyer. */
  const speakThenListen = async (m: PracticeMessage) => {
    await voiceRef.current.play(m.id, m.text, toneOf(m));
    if (callRef.current === "on") listenHandsFree();
  };

  const pauseCall = (message: string | null) => {
    setCall("paused");
    srRef.current.cancel();
    voiceRef.current.stop();
    setNotice(message);
  };

  const startCall = () => {
    setError(null);
    sr.clearError();
    setNotice(null);
    silentRetries.current = 0;
    setVoiceOn(true);
    setKeyboard(false);
    setCall("on");
    const last = p.messages[p.messages.length - 1];
    if (last?.role === "buyer") void speakThenListen(last);
    else listenHandsFree();
  };

  const resumeCall = () => {
    sr.clearError();
    setNotice(null);
    silentRetries.current = 0;
    setCall("on");
    // Let the paused state settle before the mic opens again.
    setTimeout(listenHandsFree, 50);
  };

  const endCall = () => {
    setCall("off");
    sr.cancel();
    voice.stop();
    setNotice(null);
  };

  /** Interrupt the buyer: stopping playback lets the waiting speakThenListen open the mic. */
  const interrupt = () => voice.stop();

  // A microphone error (permission, no device…) pauses the call instead of retrying forever.
  React.useEffect(() => {
    if (sr.error && callRef.current === "on") {
      callRef.current = "paused";
      setCallState("paused");
    }
  }, [sr.error]);

  const update = (fn: (s: PracticeState) => PracticeState) => setPractice((s) => (s ? fn(s) : s));

  const send = async (spoken?: string) => {
    const text = (spoken !== undefined ? (baseDraft.current ? baseDraft.current + " " : "") + spoken : draft).trim();
    if (!text || sending || done || (spoken === undefined && sr.transcribing)) return;
    sr.cancel();
    const seller: PracticeMessage = { id: newId(), role: "seller", text, flags: flagsFor(checkSellerMessage(text, rulesCtx)), viaMic };
    const history = [...p.messages, seller];
    update((s) => ({ ...s, messages: history }));
    setDraft("");
    setViaMic(false);
    baseDraft.current = "";
    setSending(true);
    setError(null);
    const res = scripted
      ? await new Promise<{ data?: { reply: string; stance: BuyerStance; tone?: BuyerTone }; error?: ApiError }>((resolve) =>
          setTimeout(() => resolve({ data: scriptedBuyerReply(history, p.context.language, rulesCtx) }), 700),
        )
      : await postJson<{ reply: string; stance: BuyerStance; tone?: BuyerTone }>("api/practice/turn", {
          context: p.context,
          persona: p.persona,
          history: history.map(({ id, role, text, stance, tone }) => ({ id, role, text, ...(stance ? { stance } : {}), ...(tone ? { tone } : {}) })),
        });
    setSending(false);
    if (!res.data) {
      if (callRef.current === "on") pauseCall(null);
      setError(res.error ?? { code: "UNEXPECTED", message: "The buyer could not reply." });
      return;
    }
    const buyer: PracticeMessage = {
      id: newId(),
      role: "buyer",
      text: res.data.reply,
      stance: res.data.stance,
      tone: res.data.tone ?? toneFromStance(res.data.stance),
    };
    update((s) => ({ ...s, messages: [...s.messages, buyer] }));
    if (callRef.current === "on") await speakThenListen(buyer);
    else if (voiceOn && autoplay) await voiceRef.current.play(buyer.id, buyer.text, toneOf(buyer));
  };

  const end = async () => {
    const inCall = callRef.current !== "off";
    endCall();
    setEvaluating(true);
    setError(null);
    let card: Scorecard | null = null;
    if (scripted) {
      card = scriptedScorecard(p.messages, p.context.language, rulesCtx);
    } else {
      const res = await postJson<{ scorecard: Scorecard }>("api/practice/evaluate", {
        context: p.context,
        persona: p.persona,
        history: p.messages.map(({ id, role, text, stance, tone }) => ({ id, role, text, ...(stance ? { stance } : {}), ...(tone ? { tone } : {}) })),
        privateRules: input.privateRules,
        transcript: input.transcript,
      });
      if (!res.data) {
        setEvaluating(false);
        return setError(res.error ?? { code: "UNEXPECTED", message: "Could not create the scorecard." });
      }
      card = res.data.scorecard;
    }
    setEvaluating(false);
    update((s) => ({ ...s, scorecard: card }));
    // A voice-only session hears its result instead of having to read it.
    if (inCall && card) void voiceRef.current.play("scorecard", scorecardSpeech(card), "NEUTRAL");
  };

  // What the salesperson said, handled in a call: a short spoken command, or an answer for the buyer.
  const onSpoken = (t: string) => {
    if (callRef.current !== "on") return;
    silentRetries.current = 0;
    setNotice(null);
    const cmd = detectVoiceCommand(t);
    if (cmd === "END") {
      if (sellerTurns > 0) void end();
      else {
        setNotice("Answer the buyer at least once before ending the practice.");
        setTimeout(listenHandsFree, 50);
      }
      return;
    }
    if (cmd === "PAUSE") return pauseCall("Paused. Tap Resume when you are ready.");
    if (cmd === "REPEAT") {
      if (lastBuyer) void speakThenListen(lastBuyer);
      else setTimeout(listenHandsFree, 50);
      return;
    }
    void send(t);
  };
  const onSilence = () => {
    if (callRef.current !== "on") return;
    silentRetries.current++;
    if (silentRetries.current <= MAX_SILENT_RETRIES) {
      setNotice("I didn't hear anything. Still listening…");
      // Wait for the recogniser to finish stopping before it starts again.
      setTimeout(listenHandsFree, 250);
    } else {
      pauseCall("Paused because nothing was heard. Tap Resume when you are ready.");
    }
  };
  // The speech hook calls these through refs, so they always see the latest state.
  React.useEffect(() => {
    onSpokenRef.current = onSpoken;
    onSilenceRef.current = onSilence;
  });

  const toggleDictation = () => {
    if (sr.listening) return sr.stop();
    voice.stop(); // talking over the buyer interrupts them
    baseDraft.current = draft.trim();
    setViaMic(true);
    sr.start(micLang, false);
  };

  const retryLast = async () => {
    // Re-request the buyer reply for the last seller message (no duplicate seller message).
    const last = p.messages[p.messages.length - 1];
    if (last?.role !== "seller") return;
    setDraft(last.text);
    setKeyboard(true);
    update((s) => ({ ...s, messages: s.messages.slice(0, -1) }));
    setError(null);
  };

  const restart = () => {
    endCall();
    setDraft("");
    setError(null);
    update((s) => ({ ...s, messages: [s.opening], scorecard: null }));
  };

  const changeScenario = () => {
    endCall();
    setPractice(null);
  };

  const phase: Phase =
    call === "off"
      ? "off"
      : call === "paused"
        ? "paused"
        : sending
          ? "thinking"
          : voice.loadingId || voice.playingId
            ? "speaking"
            : sr.transcribing
              ? "transcribing"
              : sr.listening
                ? "listening"
                : "waiting";
  const speakingMsg = p.messages.find((m) => m.id === (voice.playingId ?? voice.loadingId));
  const status: Record<Phase, string> = {
    off: "",
    paused: "Paused",
    waiting: "One moment…",
    thinking: `${p.persona.name} is thinking…`,
    speaking: `${p.persona.name} is speaking${speakingMsg?.role === "buyer" ? ` · ${TONE_META[toneOf(speakingMsg)].label.toLowerCase()}` : ""}`,
    transcribing: "Got it. Transcribing…",
    listening: "Your turn. Speak now",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Turn {sellerTurns} · {done ? "Practice ended" : sending ? `${p.persona.name} is replying…` : "Your turn"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={changeScenario}><ListRestart /> Choose another objection</Button>
          <Button variant="outline" size="sm" onClick={restart} disabled={sending || evaluating}><RotateCcw /> Restart scenario</Button>
          {!done && (
            <Button size="sm" onClick={end} disabled={sellerTurns === 0 || sending || evaluating}>
              {evaluating ? <Loader2 className="animate-spin" /> : <Flag />} End practice
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card className="flex min-h-[560px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
            {p.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "seller" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%]", m.role === "seller" && "flex flex-col items-end")}>
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    {m.role === "buyer" ? (
                      <>
                        <span className="font-medium text-slate-600">{p.persona.name}</span>
                        {m.stance && <Badge variant={STANCE[m.stance].variant} className="px-1.5 py-0 text-[10px]">{STANCE[m.stance].label}</Badge>}
                        <span title="How this line is voiced">· sounds {TONE_META[toneOf(m)].label.toLowerCase()}</span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600">You {m.viaMic && <Mic className="size-3" />}</span>
                    )}
                  </div>
                  <div
                    dir="auto"
                    className={cn(
                      "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      m.role === "seller" ? "rounded-br-sm bg-teal-700 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-800 shadow-sm",
                      voice.playingId === m.id && "ring-2 ring-teal-300",
                    )}
                  >
                    {m.text}
                  </div>
                  {m.role === "buyer" && voiceOn && call === "off" && <AudioControls m={m} voice={voice} />}
                  {m.role === "seller" && m.flags && m.flags.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {m.flags.map((f) => (
                        <p key={f} className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                          <ShieldAlert className="mt-px size-3 shrink-0" /> Coach (private): {f}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" /> {p.persona.name} is thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div role="alert" className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="flex items-start gap-2"><AlertOctagon className="mt-0.5 size-4 shrink-0" /> {error.message}</p>
              <p className="mt-1 text-xs text-red-700/80">Your conversation is kept.</p>
              {p.messages[p.messages.length - 1]?.role === "seller" && (
                <Button size="sm" variant="outline" className="mt-2" onClick={retryLast}>Edit and resend my last reply</Button>
              )}
            </div>
          )}

          {!done && (
            <div className="border-t border-slate-100 p-4">
              {sellerTurns >= SUGGESTED_TURNS && (
                <p className="mb-2 text-xs text-slate-500">Good point to end the practice and hear your scorecard{call !== "off" ? " (say “end practice”)" : ""}.</p>
              )}

              {/* ---------- Voice call (primary) ---------- */}
              {call === "off" ? (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-50 px-4 py-5 text-center">
                  <Button size="lg" onClick={startCall} disabled={!sr.supported || sending}>
                    <Phone /> {sellerTurns ? "Continue by voice" : "Start voice practice"}
                  </Button>
                  <p className="max-w-md text-xs text-slate-500">
                    {sr.supported
                      ? `${p.persona.name} speaks to you; answer out loud. Your answer sends when you pause, no typing needed.`
                      : "Voice input is not supported in this browser. Chrome or Edge work best. You can type instead."}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
                  <div className="flex items-center gap-3">
                    <div className={cn("relative flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white ring-4", PHASE_STYLE[phase].ring)}>
                      <UserRound className="size-5" />
                      <span className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white", PHASE_STYLE[phase].dot, (phase === "listening" || phase === "speaking") && "animate-pulse")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{status[phase]}</p>
                      <p dir="auto" className="truncate text-xs text-slate-500">
                        {phase === "listening"
                          ? sr.text || "It sends automatically when you pause."
                          : phase === "speaking"
                            ? "Tap Interrupt to talk over them."
                            : phase === "paused"
                              ? notice ?? sr.error ?? "Tap Resume to continue the conversation."
                              : notice ?? ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {phase === "speaking" && (
                      <Button size="sm" onClick={interrupt}><Mic /> Interrupt</Button>
                    )}
                    {phase === "listening" && (
                      <Button size="sm" onClick={() => sr.stop()}><SendHorizontal /> Done talking</Button>
                    )}
                    {phase === "paused" ? (
                      <Button size="sm" onClick={resumeCall}><Play /> Resume</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => pauseCall("Paused. Tap Resume when you are ready.")} disabled={phase === "thinking"}>
                        <Pause /> Pause
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={endCall}><PhoneOff /> Hang up</Button>
                    <Button size="sm" variant="ghost" onClick={end} disabled={sellerTurns === 0 || sending || evaluating}><Flag /> End &amp; score</Button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Say “repeat that” / “dobara boliye”, “pause”, or “end practice”. {sr.engine === "server" ? "Sarvam speech-to-text." : "Browser speech recognition."}
                  </p>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {sr.supported && (
                  <>
                    <span>I&apos;ll speak in:</span>
                    {(["en-IN", "hi-IN"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setMicLang(l)}
                        disabled={sr.listening}
                        className={cn("rounded border px-1.5 py-0.5", micLang === l ? "border-teal-700 text-teal-800" : "border-slate-200")}
                      >
                        {l === "en-IN" ? "English (India)" : "Hindi / Hinglish"}
                      </button>
                    ))}
                  </>
                )}
                <button onClick={() => setKeyboard((k) => !k)} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">
                  <Keyboard className="size-3.5" /> {keyboard ? "Hide keyboard" : "Type instead"}
                </button>
              </div>
              {sr.error && call !== "paused" && <p className="mt-1.5 text-xs text-amber-800">{sr.error}</p>}

              {/* ---------- Typing (optional) ---------- */}
              {keyboard && (
                <div className="mt-3">
                  <div className="flex items-end gap-2">
                    <Button
                      variant={sr.listening && call === "off" ? "default" : "outline"}
                      size="icon"
                      onClick={toggleDictation}
                      disabled={!sr.supported || sending || sr.transcribing || call === "on"}
                      className={cn(sr.listening && call === "off" && "animate-pulse bg-red-600 hover:bg-red-700")}
                      aria-label={sr.listening ? "Stop dictation" : "Dictate"}
                      title={sr.supported ? "Dictate into the text box" : "Speech recognition is not supported in this browser."}
                    >
                      {sr.supported ? (sr.listening && call === "off" ? <Square /> : <Mic />) : <MicOff />}
                    </Button>
                    <textarea
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (!sr.listening) baseDraft.current = e.target.value;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      rows={2}
                      dir="auto"
                      placeholder={sr.transcribing ? "Transcribing your answer…" : "Type your answer to the buyer… (Enter to send)"}
                      className="min-h-[52px] flex-1 resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                      aria-label="Your answer"
                      disabled={sending}
                    />
                    <Button size="icon" onClick={() => void send()} disabled={!draft.trim() || sending || sr.transcribing} aria-label="Send">
                      <SendHorizontal />
                    </Button>
                  </div>
                  {liveFlags.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {liveFlags.map((f) => (
                        <p key={f} className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                          <ShieldAlert className="mt-px size-3.5 shrink-0" /> Before you send (private): {f}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <PersonaCard p={p} />
          <VoicePanel
            voice={voice}
            enabled={voiceOn}
            setEnabled={(v) => {
              setVoiceOn(v);
              if (!v) {
                voice.stop();
                if (callRef.current !== "off") endCall();
              }
            }}
            autoplay={autoplay}
            setAutoplay={setAutoplay}
            hinglishVoice={hinglishVoice}
            setHinglishVoice={setHinglishVoice}
            language={p.context.language}
          />
        </div>
      </div>

      {evaluating && (
        <Card className="flex items-center gap-2 p-4 text-sm text-teal-900"><Loader2 className="size-4 animate-spin" /> Scoring your practice against the rubric…</Card>
      )}
      {p.scorecard && <PracticeScorecard card={p.scorecard} />}
    </div>
  );
}
