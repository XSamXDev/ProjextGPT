import { useEffect, useState, useCallback, useRef } from "react";
import { ModelManager, EventBus } from "@runanywhere/web";
import { TextGeneration } from "@runanywhere/web-llamacpp";
import { initSDK } from "../services/runanywhere";

// Syntax Highlighting Imports
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-java";

let _setupPromise: Promise<void> | null = null;

const MODEL_ID = "lfm2-1.2b-tool-q4_k_m";
const MODEL_NAME = "LFM2 1.2B Tool";
const MODEL_REPO = "LiquidAI/LFM2-1.2B-Tool-GGUF";
const MODEL_FILE = "LFM2-1.2B-Tool-Q4_K_M.gguf";
const CACHE_KEY = `runanywhere_downloaded_${MODEL_ID}`;

type ModelStatus = "idle" | "downloading" | "loading" | "ready" | "error";

function App() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Initializing SDK...");
  const [code, setCode] = useState("");
  const [response, setResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [copyStatus, setCopyStatus] = useState("Copy Code");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [isCached, setIsCached] = useState(false);
  const [showModelPanel, setShowModelPanel] = useState(false);

  const listenerRef = useRef<(() => void) | null>(null);
  const cancelRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showModelPanel) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowModelPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPanel]);

  useEffect(() => {
    setIsCached(localStorage.getItem(CACHE_KEY) === "true");

    if (!listenerRef.current) {
      const unsubscribe = EventBus.shared.on(
        "model.downloadProgress",
        (evt) => {
          const p = Math.round((evt.progress ?? 0) * 100);
          setProgress(p);
          setStatus(`Downloading AI Model: ${p}%`);
          setModelStatus("downloading");
        },
      );
      listenerRef.current = unsubscribe;
    }

    if (!_setupPromise) {
      _setupPromise = (async () => {
        try {
          await initSDK();
          setStatus("Checking local assets...");

          const alreadyCached = localStorage.getItem(CACHE_KEY) === "true";

          if (!alreadyCached) {
            setStatus("Downloading model (first time only)...");
            setModelStatus("downloading");
            await ModelManager.downloadModel(MODEL_ID);
            localStorage.setItem(CACHE_KEY, "true");
            setIsCached(true);
          }

          setProgress(100);
          setStatus("Loading AI Intelligence...");
          setModelStatus("loading");

          try {
            await ModelManager.loadModel(MODEL_ID);
          } catch {
            localStorage.removeItem(CACHE_KEY);
            setIsCached(false);
            setStatus("Re-downloading model...");
            setModelStatus("downloading");
            setProgress(0);
            await ModelManager.downloadModel(MODEL_ID);
            localStorage.setItem(CACHE_KEY, "true");
            setIsCached(true);
            setProgress(100);
            setModelStatus("loading");
            await ModelManager.loadModel(MODEL_ID);
          }

          setStatus("AI Assistant Ready");
          setModelStatus("ready");
        } catch (err) {
          console.error("Initialization failed:", err);
          setStatus("Initialization failed.");
          setModelStatus("error");
          _setupPromise = null;
        }
      })();
    }

    _setupPromise.then(() => setReady(true));

    return () => {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, []);

  // ── Copy ─────────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy Code"), 2000);
    } catch (err) {
      console.log(err);
      setCopyStatus("Failed ❌");
    }
  };

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = () => {
    cancelRef.current = true;
    setIsCancelling(true);
  };

  // ── Processing label ──────────────────────────────────────────────────────
  const getProcessingMessage = () => {
    if (isCancelling) return "⏳ Cancelling generation...";
    switch (activeAction) {
      case "generate": return "Assistant is generating code...";
      case "debug":    return "Assistant is debugging your code...";
      case "explain":  return "Assistant is explaining the logic...";
      case "optimize": return "Assistant is optimizing performance...";
      default:         return "Assistant is thinking...";
    }
  };

  // ── Main action ───────────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (actionType: string) => {
      if (!code.trim() && actionType !== "generate") return;

      setResponse("");
      setIsProcessing(true);
      setIsCancelling(false);
      setActiveAction(actionType);
      cancelRef.current = false;

      let prompt = "";
      if (actionType === "generate") {
        prompt = `Task: Generate functional code for the following request. Provide ONLY the code. Never use comments backticks etc.\n\nRequest: ${code}\n\nAssistant (Code Only):`;
      } else if (actionType === "debug") {
        prompt = `Task: Identify and fix bugs. Explain errors and provide corrected code. Dont use comments backticks asterisks etc. Never give wrong answers if you dont know about it.\n\nCode:\n${code}\n\nAssistant:`;
      } else if (actionType === "explain") {
        prompt = `Task: Explain the logic step-by-step in simple terms. Dont use comments backticks asterisks etc. Never give wrong answers if you dont know about it.\n\nCode:\n${code}\n\nAssistant:`;
      } else if (actionType === "optimize") {
        prompt = `Task: Improve performance and readability. Provide optimized code. Never give wrong answers if you dont know about it. Dont use comments backticks asterisks etc.\n\nCode:\n${code}\n\nAssistant:`;
      }

      try {
        const { stream } = await TextGeneration.generateStream(prompt, {
          maxTokens: 800,
          temperature: actionType === "generate" ? 0.5 : 0.2,
        });

        let fullText = "";
        for await (const token of stream) {
          if (cancelRef.current) {
            setResponse(fullText + "\n\n[Generation cancelled]");
            break;
          }
          fullText += token;
          setResponse(fullText);
        }
      } catch (err) {
        if (!cancelRef.current) {
          setResponse("Generation Error: " + err);
        }
      } finally {
        setIsProcessing(false);
        setIsCancelling(false);
        cancelRef.current = false;
        setTimeout(() => setActiveAction(null), 500);
      }
    },
    [code],
  );

  const modelStatusColor: Record<ModelStatus, string> = {
    idle:        "#94a3b8",
    downloading: "#fbbf24",
    loading:     "#818cf8",
    ready:       "#4ade80",
    error:       "#f87171",
  };

  const modelStatusLabel: Record<ModelStatus, string> = {
    idle:        "Idle",
    downloading: `Downloading ${progress}%`,
    loading:     "Loading",
    ready:       "Loaded & Active",
    error:       "Error",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s ease",
      }}
    >
      {/* ── Navbar ── */}
      <nav
        className="glass"
        style={{
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ animation: "fadeIn 1s ease" }}>
          <h2
            style={{
              margin: 0,
              background: "linear-gradient(to right, #818cf8, #c084fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            ProjextGPT
          </h2>
          <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>
            Offline Code Intelligence
          </span>
        </div>

        {/* ── Center: Model Badge ── */}
        <div ref={panelRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowModelPanel((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: "20px",
              padding: "6px 14px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {/* Animated dot */}
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: modelStatusColor[modelStatus],
                display: "inline-block",
                boxShadow: modelStatus === "ready"
                  ? `0 0 6px ${modelStatusColor[modelStatus]}`
                  : "none",
                animation: modelStatus === "downloading" || modelStatus === "loading"
                  ? "pulse 1.2s infinite"
                  : "none",
              }}
            />
            <span style={{ fontSize: "0.8rem", color: "#cbd5e1", fontWeight: 500 }}>
              {MODEL_NAME}
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: modelStatusColor[modelStatus],
                fontWeight: 600,
              }}
            >
              {modelStatusLabel[modelStatus]}
            </span>
            <span style={{ fontSize: "0.65rem", opacity: 0.5, marginLeft: 2 }}>
              {showModelPanel ? "▲" : "▼"}
            </span>
          </button>

          {/* ── Dropdown Panel ── */}
          {showModelPanel && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                left: "50%",
                transform: "translateX(-50%)",
                width: 300,
                padding: "1rem 1.2rem",
                borderRadius: "12px",
                background: "#0f172a",
                border: "1px solid rgba(99,102,241,0.35)",
                zIndex: 200,
                animation: "fadeIn 0.2s ease",
                boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.75rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "#818cf8",
                    textTransform: "uppercase",
                  }}
                >
                  Downloaded Model
                </span>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    background: modelStatus === "ready"
                      ? "rgba(74,222,128,0.15)"
                      : "rgba(251,191,36,0.12)",
                    color: modelStatusColor[modelStatus],
                    fontWeight: 600,
                    border: `1px solid ${modelStatusColor[modelStatus]}44`,
                  }}
                >
                  {modelStatusLabel[modelStatus]}
                </span>
              </div>

              {/* Model Info Rows */}
              {[
                { label: "Model",      value: MODEL_NAME },
                { label: "ID",         value: MODEL_ID },
                { label: "File",       value: MODEL_FILE },
                { label: "Repo",       value: MODEL_REPO },
                { label: "Framework",  value: "llama.cpp" },
                { label: "Quantize",   value: "Q4_K_M" },
                { label: "Parameters", value: "1.2B" },
                { label: "VRAM est.",  value: "~800 MB" },
                {
                  label: "Cached",
                  value: isCached ? "✓ Yes (local)" : "✗ Not cached",
                  valueColor: isCached ? "#4ade80" : "#f87171",
                },
              ].map(({ label, value, valueColor }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "5px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    fontSize: "0.78rem",
                  }}
                >
                  <span style={{ color: "#64748b", fontWeight: 500 }}>{label}</span>
                  <span
                    style={{
                      color: valueColor ?? "#cbd5e1",
                      fontFamily: label === "ID" || label === "File" ? "monospace" : "inherit",
                      fontSize: label === "ID" || label === "File" ? "0.72rem" : "0.78rem",
                      maxWidth: 170,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "right",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}

              {/* Download progress bar (visible while downloading) */}
              {modelStatus === "downloading" && (
                <div style={{ marginTop: "0.75rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.72rem",
                      color: "#94a3b8",
                      marginBottom: 4,
                    }}
                  >
                    <span>Download progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: "#1e293b",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #6366f1, #c084fc)",
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.68rem",
                  color: "#475569",
                  textAlign: "center",
                }}
              >
                Runs 100% locally · No data sent to servers
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "0.85rem",
              color: ready ? "#4ade80" : "#fbbf24",
              fontWeight: 600,
            }}
          >
            ● {status}
          </div>
          {progress > 0 && progress < 100 && (
            <div
              style={{
                width: "150px",
                height: "5px",
                background: "#334155",
                borderRadius: "3px",
                marginTop: "5px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "#6366f1",
                  borderRadius: "3px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          )}
        </div>
      </nav>

      {/* ── Main ── */}
      <main
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "2rem",
          padding: "2rem",
          maxWidth: "1400px",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* ── Input ── */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            animation: "slideInLeft 0.5s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 500 }}>
              Input
            </h3>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              {["debug", "explain", "optimize"].map((act) => (
                <button
                  key={act}
                  onClick={() => handleAction(act)}
                  disabled={!ready || isProcessing}
                  style={{ textTransform: "capitalize" }}
                >
                  {act}
                </button>
              ))}
              <button
                onClick={() => handleAction("generate")}
                disabled={!ready || isProcessing}
                style={{
                  background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  border: "none",
                }}
              >
                Generate
              </button>
            </div>
          </div>

          <div
            className="glass code-editor-container"
            style={{ transition: "transform 0.2s ease" }}
          >
            <Editor
              value={code}
              onValueChange={setCode}
              highlight={(code) =>
                Prism.highlight(code, Prism.languages.javascript, "javascript")
              }
              padding={20}
              placeholder="// Paste code or write a prompt..."
              style={{
                fontFamily: '"Fira Code", monospace',
                fontSize: 14,
                color: "#cbd5e1",
                outline: "none",
              }}
            />
          </div>
        </section>

        {/* ── Output ── */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            animation: "slideInRight 0.5s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 500 }}>
              Output
            </h3>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              {isProcessing && (
                <button
                  onClick={handleCancel}
                  disabled={isCancelling}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 12px",
                    background: isCancelling
                      ? "rgba(239,68,68,0.07)"
                      : "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.45)",
                    borderRadius: "8px",
                    color: isCancelling ? "rgba(248,113,113,0.45)" : "#f87171",
                    cursor: isCancelling ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    animation: "fadeIn 0.2s ease",
                  }}
                >
                  {isCancelling ? "⏳ Cancelling..." : "✕ Cancel"}
                </button>
              )}

              {response && !isProcessing && (
                <button
                  onClick={handleCopy}
                  style={{
                    fontSize: "0.75rem",
                    padding: "4px 12px",
                    background: "rgba(99, 102, 241, 0.2)",
                    border: "1px solid rgba(99, 102, 241, 0.4)",
                  }}
                >
                  {copyStatus}
                </button>
              )}
            </div>
          </div>

          <div
            className="glass"
            style={{
              flex: 1,
              padding: "1.5rem",
              borderRadius: "12px",
              fontSize: "0.95rem",
              lineHeight: "1.7",
              overflowY: "auto",
              maxHeight: "calc(100vh - 220px)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              color: "#cbd5e1",
              position: "relative",
            }}
          >
            {isProcessing && (
              <div
                style={{
                  color: isCancelling ? "#f87171" : "#818cf8",
                  marginBottom: "1rem",
                  fontStyle: "italic",
                  animation: "pulse 1.5s infinite",
                  transition: "color 0.3s ease",
                }}
              >
                {getProcessingMessage()}
              </div>
            )}
            <div
              style={{
                whiteSpace: "pre-wrap",
                animation: response ? "fadeIn 0.5s ease" : "none",
              }}
            >
              {response ||
                (ready
                  ? "Your results will soon appear here."
                  : "AI is initializing locally...")}
            </div>
          </div>
        </section>
      </main>

      <footer
        style={{
          padding: "1rem",
          textAlign: "center",
          fontSize: "0.8rem",
          opacity: 0.5,
        }}
      >
        Building...............
      </footer>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInLeft { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
        .glass:hover { transform: translateY(-2px); border-color: rgba(99, 102, 241, 0.4) !important; transition: all 0.3s ease; }
        button:active { transform: scale(0.95); }
      `}</style>
    </div>
  );
}

export default App;