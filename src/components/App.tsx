import { useEffect, useState, useCallback, useRef } from "react";
import { ModelManager, EventBus } from "@runanywhere/web";
import { TextGeneration } from "@runanywhere/web-llamacpp";
import { initSDK } from "../services/runanywhere";

import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-java";

let _setupPromise: Promise<void> | null = null;

const MODEL_ID   = "lfm2-1.2b-tool-q4_k_m";
const MODEL_NAME = "LFM2 1.2B Tool";
// const MODEL_REPO = "LiquidAI/LFM2-1.2B-Tool-GGUF";
// const MODEL_FILE = "LFM2-1.2B-Tool-Q4_K_M.gguf";
const CACHE_KEY  = `runanywhere_downloaded_${MODEL_ID}`;

type ModelStatus = "idle" | "downloading" | "loading" | "ready" | "error";

/* ── tiny helpers ──────────────────────────────────────────────── */
const statusMeta: Record<ModelStatus, { color: string; label: string; pulse: boolean }> = {
  idle:        { color: "#3a6a8a",  label: "Idle",            pulse: false },
  downloading: { color: "#fbbf24",  label: "Downloading",     pulse: true  },
  loading:     { color: "#a78bfa",  label: "Loading",         pulse: true  },
  ready:       { color: "#00ff9d",  label: "Live",            pulse: false },
  error:       { color: "#ff2d78",  label: "Error",           pulse: false },
};

const ACTION_CONFIG = [
  { id: "debug",    label: "Debug",    icon: "⬡", color: "#ff7eb3" },
  { id: "explain",  label: "Explain",  icon: "◈", color: "#a78bfa" },
  { id: "optimize", label: "Optimize", icon: "◉", color: "#00d4ff" },
];

/* ── Animated background ───────────────────────────────────────── */
function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    const resize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; };
    window.addEventListener("resize", resize);

    /* Grid lines */
    const CELL = 60;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number; color: string }[] = [];
    const COLORS = ["#00d4ff", "#7c3aff", "#00ff9d"];

    for (let i = 0; i < 55; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        size: Math.random() * 1.8 + 0.4,
        alpha: Math.random() * 0.5 + 0.1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }

    let animId: number;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t++;

      /* Grid */
      ctx.strokeStyle = "rgba(0,212,255,0.025)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += CELL) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += CELL) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      /* Orbs */
      const cx1 = W * 0.2 + Math.sin(t / 250) * 60;
      const cy1 = H * 0.25 + Math.cos(t / 300) * 40;
      const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, 320);
      g1.addColorStop(0, "rgba(124,58,255,0.07)");
      g1.addColorStop(1, "transparent");
      ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx1, cy1, 320, 0, Math.PI * 2); ctx.fill();

      const cx2 = W * 0.8 + Math.cos(t / 280) * 50;
      const cy2 = H * 0.7 + Math.sin(t / 220) * 35;
      const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 260);
      g2.addColorStop(0, "rgba(0,212,255,0.055)");
      g2.addColorStop(1, "transparent");
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx2, cy2, 260, 0, Math.PI * 2); ctx.fill();

      /* Particles */
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(p.alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();
      });

      /* Connections */
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,212,255,${0.06 * (1 - dist / 110)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", inset: 0, zIndex: 0,
        pointerEvents: "none", opacity: 0.75,
      }}
    />
  );
}

/* ── Spinner ───────────────────────────────────────────────────── */
function Spinner({ color = "#00d4ff" }: { color?: string }) {
  return (
    <span style={{ display: "inline-block", width: 14, height: 14, position: "relative" }}>
      <span style={{
        position: "absolute", inset: 0, border: `2px solid transparent`,
        borderTopColor: color, borderRadius: "50%",
        animation: "orbit 0.7s linear infinite",
      }} />
    </span>
  );
}

/* ── Processing Banner ─────────────────────────────────────────── */
function ProcessingBanner({ action, cancelling }: { action: string | null; cancelling: boolean }) {
  const messages: Record<string, string> = {
    generate: "Generating code…",
    debug:    "Debugging code…",
    explain:  "Analysing logic…",
    optimize: "Optimising performance…",
  };
  const msg = cancelling ? "Cancelling generation…" : (messages[action ?? ""] ?? "Processing…");
  const color = cancelling ? "#ff2d78" : "#00d4ff";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.6rem",
      color, fontSize: "0.8rem", fontStyle: "italic",
      marginBottom: "1rem", animation: "fadeUp 0.3s ease",
    }}>
      <Spinner color={color} />
      <span style={{ animation: "pulse 1.6s infinite" }}>{msg}</span>
    </div>
  );
}

/* ── Main App ──────────────────────────────────────────────────── */
function App() {
  const [ready, setReady]               = useState(false);
  const [status, setStatus]             = useState("Initializing…");
  const [code, setCode]                 = useState("");
  const [response, setResponse]         = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [progress, setProgress]         = useState(0);
  const [copyStatus, setCopyStatus]     = useState("Copy");
  const [modelStatus, setModelStatus]   = useState<ModelStatus>("idle");
  const [isCached, setIsCached]         = useState(false);
  const [showModelPanel, setShowModelPanel] = useState(false);
  const [lineCount, setLineCount]       = useState(0);

  const listenerRef = useRef<(() => void) | null>(null);
  const cancelRef   = useRef(false);
  const panelRef    = useRef<HTMLDivElement>(null);
  const outputRef   = useRef<HTMLDivElement>(null);

  /* ── outside click for dropdown ── */
  useEffect(() => {
    if (!showModelPanel) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setShowModelPanel(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPanel]);

  /* ── line count ── */
  useEffect(() => {
    setLineCount(code ? code.split("\n").length : 0);
  }, [code]);

  /* ── auto-scroll output ── */
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [response]);

  /* ── SDK init ── */
  useEffect(() => {
    setIsCached(localStorage.getItem(CACHE_KEY) === "true");

    if (!listenerRef.current) {
      const unsub = EventBus.shared.on("model.downloadProgress", (evt) => {
        const p = Math.round((evt.progress ?? 0) * 100);
        setProgress(p);
        setStatus(`Downloading model: ${p}%`);
        setModelStatus("downloading");
      });
      listenerRef.current = unsub;
    }

    if (!_setupPromise) {
      _setupPromise = (async () => {
        try {
          await initSDK();
          setStatus("Checking local cache…");
          const cached = localStorage.getItem(CACHE_KEY) === "true";
          if (!cached) {
            setStatus("Downloading model…");
            setModelStatus("downloading");
            await ModelManager.downloadModel(MODEL_ID);
            localStorage.setItem(CACHE_KEY, "true");
            setIsCached(true);
          }
          setProgress(100);
          setStatus("Loading AI core…");
          setModelStatus("loading");
          try {
            await ModelManager.loadModel(MODEL_ID);
          } catch {
            localStorage.removeItem(CACHE_KEY);
            setIsCached(false);
            setStatus("Re-downloading model…");
            setModelStatus("downloading");
            setProgress(0);
            await ModelManager.downloadModel(MODEL_ID);
            localStorage.setItem(CACHE_KEY, "true");
            setIsCached(true);
            setProgress(100);
            setModelStatus("loading");
            await ModelManager.loadModel(MODEL_ID);
          }
          setStatus("AI Ready");
          setModelStatus("ready");
        } catch (err) {
          console.error(err);
          setStatus("Init failed");
          setModelStatus("error");
          _setupPromise = null;
        }
      })();
    }

    _setupPromise.then(() => setReady(true));
    return () => { if (listenerRef.current) { listenerRef.current(); listenerRef.current = null; } };
  }, []);

  /* ── copy ── */
  const handleCopy = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopyStatus("Copied ✓");
      setTimeout(() => setCopyStatus("Copy"), 2000);
    } catch { setCopyStatus("Failed"); }
  };

  /* ── cancel ── */
  const handleCancel = () => { cancelRef.current = true; setIsCancelling(true); };

  /* ── clear ── */
  const handleClear = () => { setCode(""); setResponse(""); };

  /* ── main action ── */
  const handleAction = useCallback(async (actionType: string) => {
    if (!code.trim() && actionType !== "generate") return;

    setResponse("");
    setIsProcessing(true);
    setIsCancelling(false);
    setActiveAction(actionType);
    cancelRef.current = false;

    const prompts: Record<string, string> = {
      generate: `Task: Generate functional code for the following request. Provide ONLY the code. Never use comments backticks etc.\n\nRequest: ${code}\n\nAssistant (Code Only):`,
      debug: `Task: Identify the programming language and fix bugs. Explain errors and provide corrected code. No comments, backticks, or asterisks.\n\nCode:\n${code}\n\nAssistant:`,
      explain: `Task: Explain what this code does step by step. For each line or block, describe: 1) What it does, 2) Why it is there, 3) What would happen if it was removed. Use simple English. No backticks or asterisks.\n\nCode:\n${code}\n\nStep-by-step explanation:`,
      optimize: `Task: Improve this code for better performance and readability. List each change you made and why it is better. Then provide the full optimized code. No backticks or asterisks.\n\nCode:\n${code}\n\nChanges made and optimized code:`,
    };

    try {
      const { stream } = await TextGeneration.generateStream(prompts[actionType], {
        maxTokens: 800,
        temperature: actionType === "generate" ? 0.5 : 0.2,
      });
      let full = "";
      for await (const token of stream) {
        if (cancelRef.current) { setResponse(full + "\n\n[Generation cancelled]"); break; }
        full += token;
        setResponse(full);
      }
    } catch (err) {
      if (!cancelRef.current) setResponse("Error: " + err);
    } finally {
      setIsProcessing(false);
      setIsCancelling(false);
      cancelRef.current = false;
      setTimeout(() => setActiveAction(null), 500);
    }
  }, [code]);

  const meta = statusMeta[modelStatus];

  /* ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
      <BackgroundCanvas />

      {/* ══ Navbar ══════════════════════════════════════════════════ */}
      <nav
        className="glass"
        style={{
          padding: "1.5rem 1.8rem 1.8rem",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(2, 6, 14, 0.72)",
          backdropFilter: "blur(10px) saturate(130%)",
          WebkitBackdropFilter: "blur(10px) saturate(130%)",
          borderBottom: "1px solid rgba(0,212,255,0.14)",
          borderRadius: 0,
          boxShadow: "0 2px 40px rgba(0,0,0,0.7), 0 1px 0 rgba(0,212,255,0.1), inset 0 1px 0 rgba(255,255,255,0.04)",
          animation: "fadeUp 0.6s ease",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.35rem",
            letterSpacing: "0.04em",
            background: "linear-gradient(90deg, #00d4ff 0%, #a78bfa 50%, #00ff9d 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 8px rgba(0,212,255,0.25))",
          }}>
            ProjextGPT
          </div>
          <div style={{ fontSize: "0.68rem", color: "#5a8aaa", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>
            Offline · Local · Private
          </div>
        </div>

        {/* Center: model badge */}
        <div ref={panelRef} className="nav-model-badge" style={{ position: "relative" }}>
          <button
            onClick={() => setShowModelPanel(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "0.55rem",
              background: "rgba(0,212,255,0.04)",
              border: "1px solid rgba(0,212,255,0.18)",
              borderRadius: "20px", padding: "6px 16px",
              cursor: "pointer", transition: "all 0.2s ease",
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: meta.color, display: "inline-block",
              boxShadow: modelStatus === "ready" ? `0 0 8px ${meta.color}, 0 0 16px ${meta.color}` : "none",
              animation: meta.pulse ? "glowPulse 1.2s infinite" : "none",
            }} />
            <span style={{ fontSize: "0.82rem", color: "#b0d4ee", fontWeight: 600, letterSpacing: "0.03em" }}>
              {MODEL_NAME}
            </span>
            <span style={{ fontSize: "0.68rem", color: meta.color, fontWeight: 700, letterSpacing: "0.08em" }}>
              {modelStatus === "downloading" ? `${progress}%` : meta.label}
            </span>
            <span style={{ fontSize: "0.6rem", color: "var(--text-dim)", marginLeft: 2 }}>
              {showModelPanel ? "▲" : "▼"}
            </span>
          </button>

          {/* Dropdown */}
          {showModelPanel && (
            <div style={{
              position: "absolute", top: "calc(100% + 12px)", left: "50%",
              transform: "translateX(-50%)", width: 310,
              padding: "1.1rem 1.3rem", borderRadius: "14px",
              background: "rgba(4, 10, 22, 0.97)",
              border: "1px solid rgba(0,212,255,0.2)", zIndex: 200,
              animation: "fadeUp 0.2s ease",
              boxShadow: "0 16px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,212,255,0.06)",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: "0.8rem", paddingBottom: "0.6rem",
                borderBottom: "1px solid rgba(0,212,255,0.08)",
              }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent-cyan)", textTransform: "uppercase" }}>
                  Active Model
                </span>
                <span style={{
                  fontSize: "0.65rem", padding: "2px 10px", borderRadius: "10px",
                  background: `${meta.color}18`, color: meta.color,
                  fontWeight: 700, border: `1px solid ${meta.color}33`,
                  letterSpacing: "0.06em",
                }}>
                  {meta.label}
                </span>
              </div>

              {[
                { label: "Model",      value: MODEL_NAME },
                { label: "Framework",  value: "llama.cpp" },
                { label: "Parameters", value: "1.2B" },
                { label: "VRAM",       value: "~800 MB" },
                { label: "Cached",     value: isCached ? "✓ Yes" : "✗ No", color: isCached ? "#00ff9d" : "#ff2d78" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  fontSize: "0.75rem",
                }}>
                  <span style={{ color: "#6a9ab8", fontWeight: 500 }}>{label}</span>
                  <span style={{
                    color: color ?? "var(--text-secondary)",
                    fontFamily:  "inherit",
                    fontSize: "0.75rem",
                    maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", textAlign: "right",
                  }}>{value}</span>
                </div>
              ))}

              {modelStatus === "downloading" && (
                <div style={{ marginTop: "0.8rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-secondary)", marginBottom: 5 }}>
                    <span>Download progress</span><span>{progress}%</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(0,212,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      width: `${progress}%`, height: "100%",
                      background: "linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))",
                      borderRadius: 3, transition: "width 0.3s ease",
                      boxShadow: "0 0 10px var(--accent-cyan)",
                    }} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: "0.8rem", fontSize: "0.68rem", color: "#5a8aaa", textAlign: "center", letterSpacing: "0.06em" }}>
                ◈ Runs 100% locally · Zero data transmitted
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            fontSize: "0.82rem", fontWeight: 600, color: ready ? "#00ff9d" : "#fbbf24",
          }}>
            {ready
              ? <span style={{ color: "#00ff9d", filter: "drop-shadow(0 0 6px #00ff9d)" }}>●</span>
              : <Spinner color="#fbbf24" />}
            <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</span>
          </div>
          {progress > 0 && progress < 100 && (
            <div style={{ width: 130, height: 3, background: "rgba(0,212,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${progress}%`, height: "100%",
                background: "linear-gradient(90deg, var(--accent-purple), var(--accent-cyan))",
                borderRadius: 2, transition: "width 0.3s ease",
                boxShadow: "0 0 8px var(--accent-cyan)",
              }} />
            </div>
          )}
        </div>
      </nav>

      {/* ══ Main Grid ═══════════════════════════════════════════════ */}
      <main
        className="main-grid"
        style={{
          flex: 1, display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1.5rem", padding: "0.5rem 1.5rem",
          maxWidth: 1440, margin: "0 auto",
          width: "100%", position: "relative", zIndex: 1,
        }}
      >
        {/* ── Combined Label Bar ── */}
        <div style={{
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
          gap: "0.6rem",
          padding: "0.5rem 0.2rem",
          borderBottom: "1px solid rgba(0,212,255,0.1)",
        }}>
          {/* Row 1: INPUT label (left) + OUTPUT label (right) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{
                fontFamily: "var(--font-display)", fontSize: "0.73rem", fontWeight: 700,
                letterSpacing: "0.15em", textTransform: "uppercase", color: "#6a9ab8",
                display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap",
              }}>
                <span style={{ color: "var(--accent-cyan)", opacity: 0.8 }}>—</span> Input
              </span>
              {lineCount > 0 && (
                <span style={{
                  fontSize: "0.68rem", color: "#6a9ab8", fontFamily: "var(--font-mono)",
                  background: "rgba(0,212,255,0.06)", padding: "1px 7px", borderRadius: 6,
                  border: "1px solid rgba(0,212,255,0.1)", whiteSpace: "nowrap",
                }}>
                  {lineCount}L
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {isProcessing && (
                <button onClick={handleCancel} disabled={isCancelling}
                  style={{ fontSize: "0.68rem", padding: "0.35rem 0.85rem", background: isCancelling ? "rgba(255,45,120,0.04)" : "rgba(255,45,120,0.08)", border: "1px solid rgba(255,45,120,0.3)", color: isCancelling ? "rgba(255,45,120,0.4)" : "#ff2d78", animation: "fadeIn 0.2s ease" }}>
                  {isCancelling ? "Cancelling…" : "✕ Stop"}
                </button>
              )}
              {response && !isProcessing && (
                <button onClick={handleCopy}
                  style={{ fontSize: "0.68rem", padding: "0.35rem 0.85rem", background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", color: copyStatus === "Copied ✓" ? "#00ff9d" : "var(--accent-cyan)" }}>
                  {copyStatus}
                </button>
              )}
              {activeAction && (
                <span style={{ fontSize: "0.62rem", color: "var(--accent-purple)", background: "rgba(124,58,255,0.12)", padding: "1px 8px", borderRadius: 6, border: "1px solid rgba(124,58,255,0.2)", textTransform: "capitalize" }}>
                  {activeAction}
                </span>
              )}
              <span style={{
                fontFamily: "var(--font-display)", fontSize: "0.73rem", fontWeight: 700,
                letterSpacing: "0.15em", textTransform: "uppercase", color: "#6a9ab8",
                display: "flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap",
              }}>
                Output <span style={{ color: "var(--accent-cyan)", opacity: 0.8 }}>—</span>
              </span>
            </div>
          </div>

          {/* Row 2: Action buttons */}
          <div className="action-row" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
            {code.trim() && (
              <button onClick={handleClear} style={{ fontSize: "0.68rem", padding: "0.35rem 0.75rem", background: "rgba(255,45,120,0.06)", borderColor: "rgba(255,45,120,0.2)", color: "rgba(255,45,120,0.7)" }}>
                Clear
              </button>
            )}
            {ACTION_CONFIG.map(({ id, label, color }) => (
              <button key={id} onClick={() => handleAction(id)} disabled={!ready || isProcessing}
                style={{ background: `${color}0d`, borderColor: `${color}28`, color: ready && !isProcessing ? color : undefined }}
                onMouseEnter={e => { if (ready && !isProcessing) (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 18px ${color}30, inset 0 0 18px ${color}08`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = ""; }}
              >
                {label}
              </button>
            ))}
            <button onClick={() => handleAction("generate")} disabled={!ready || isProcessing}
              style={{ background: "linear-gradient(135deg, rgba(0,255,157,0.1), rgba(0,212,255,0.05))", borderColor: "rgba(0,255,157,0.3)", color: ready && !isProcessing ? "#00ff9d" : undefined, boxShadow: ready && !isProcessing ? "0 0 15px rgba(0,255,157,0.12)" : "none" }}>
              ⚡ Generate
            </button>
          </div>
        </div>

        {/* ── Input Panel ── */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1rem", animation: "slideInLeft 0.5s ease 0.1s both" }}>

          {/* Panel header moved to combined label bar */}

          {/* Editor */}
          <div
            className="glass code-editor-container"
            style={{
              flex: 1, borderRadius: 14, minHeight: 380,
              border: "1px solid rgba(0,212,255,0.1)",
              transition: "border-color 0.3s, box-shadow 0.3s",
            }}
            onFocus={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,212,255,0.28)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 30px rgba(0,212,255,0.06)"; }}
            onBlur={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,212,255,0.1)"; (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
          >
            <Editor
              value={code}
              onValueChange={setCode}
              highlight={c => Prism.highlight(c, Prism.languages.javascript, "javascript")}
              padding={20}
              placeholder="// Paste code here, or describe what you want to generate…"
              style={{
                fontFamily: "var(--font-mono)", fontSize: 13,
                color: "var(--text-primary)", outline: "none", minHeight: 380,
              }}
            />
          </div>

          {/* Tip bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: "1rem",
            padding: "0.6rem 1rem", borderRadius: 10,
            background: "rgba(0,212,255,0.03)",
            border: "1px solid rgba(0,212,255,0.07)",
            fontSize: "0.72rem", color: "#6a9ab8",
          }}>
            <span style={{ color: "rgba(255, 255, 255, 0.35)" }}>◈</span>
            <span>Paste existing code to debug, explain, or optimize · or describe what to generate</span>
          </div>
        </section>

        {/* ── Output Panel ── */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1rem", animation: "slideInRight 0.5s ease 0.2s both" }}>

          {/* Panel header moved to combined label bar */}

          {/* Output box */}
          <div
            ref={outputRef}
            className="glass"
            style={{
              flex: 1, padding: "1.4rem 1.6rem",
              borderRadius: 14, fontSize: "0.88rem",
              lineHeight: 1.75, overflowY: "auto",
              maxHeight: "calc(100vh - 230px)",
              border: "1px solid rgba(0,212,255,0.1)",
              color: "var(--text-primary)",
              fontFamily: response ? "var(--font-mono)" : "var(--font-display)",
              position: "relative", minHeight: 380,
            }}
          >
            {/* Scan line effect when processing */}
            {isProcessing && (
              <div style={{
                position: "absolute", left: 0, right: 0, height: 1,
                background: "linear-gradient(90deg, transparent, var(--accent-cyan), transparent)",
                animation: "scanLine 2s linear infinite", opacity: 0.4,
                pointerEvents: "none",
              }} />
            )}

            {isProcessing && <ProcessingBanner action={activeAction} cancelling={isCancelling} />}

            <div style={{
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              animation: response ? "fadeUp 0.4s ease" : "none",
              color: response ? "var(--text-primary)" : "var(--text-dim)",
            }}>
              {response || (ready
                ? "← Run an action on the left to see AI output here."
                : "Initializing AI engine locally…")}
            </div>

            {/* Token count */}
            {response && (
              <div style={{
                position: "absolute", bottom: 10, right: 14,
                fontSize: "0.6rem", color: "var(--text-dim)",
                fontFamily: "var(--font-mono)",
                background: "rgba(0,212,255,0.04)",
                padding: "2px 7px", borderRadius: 5,
                border: "1px solid rgba(0,212,255,0.08)",
              }}>
                {response.split(" ").length} tokens
              </div>
            )}
          </div>

          {/* Info bar */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "0.6rem 1rem", borderRadius: 10,
            background: "rgba(124,58,255,0.03)",
            border: "1px solid rgba(124,58,255,0.08)",
            fontSize: "0.68rem",
          }}>
            <span style={{ color: "#6a9ab8", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ color: "rgba(124,58,255,0.4)" }}>◈</span>
              Runs entirely in your browser · No cloud required
            </span>
            
          </div>
        </section>
      </main>

      {/* ══ Footer ══════════════════════════════════════════════════ */}
      <footer style={{
        padding: "1rem 2rem", textAlign: "center",
        fontSize: "0.68rem", color: "#5a8aaa",
        letterSpacing: "0.1em", borderTop: "1px solid rgba(0,212,255,0.06)",
        position: "relative", zIndex: 1,
        display: "flex", justifyContent: "center", alignItems: "center", gap: "1.5rem",
      }}>
        <span>ProjextGPT</span>
        <span style={{ color: "rgba(0,212,255,0.2)" }}>◈</span>
        <span>Made with <span style={{ color: "rgba(0,212,255,0.4)" }}>.....</span></span>
        <span style={{ color: "rgba(0,212,255,0.2)" }}>◈</span>
        <span>Local · Offline · Private</span>
      </footer>

      <style>{`
        @keyframes orbit { to { transform: rotate(360deg); } }
        @keyframes glowPulse { 0%,100% { opacity:0.6; } 50% { opacity:1; filter:brightness(1.5); } }
        @keyframes scanLine { from { top:-2px; } to { top:100%; } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideInRight { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
        @keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
      `}</style>
    </div>
  );
}

export default App;