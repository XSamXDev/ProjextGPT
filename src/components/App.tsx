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

function App() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Initializing SDK...");
  const [code, setCode] = useState("");
  const [response, setResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [copyStatus, setCopyStatus] = useState("Copy Code");

  const [, setIsModelCached] = useState<boolean | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!listenerRef.current) {
      const unsubscribe = EventBus.shared.on(
        "model.downloadProgress",
        (evt) => {
          const p = Math.round((evt.progress ?? 0) * 100);
          setProgress(p);
          setStatus(`Downloading AI Model: ${p}%`);
        },
      );
      listenerRef.current = unsubscribe;
    }

    const modelId = "lfm2-350m-q4_k_m";

    if (!_setupPromise) {
      _setupPromise = (async () => {
        try {
          await initSDK();
          setStatus("Checking local assets...");
          const storageInfo = await ModelManager.getStorageInfo();
          const MODEL_FILE_SIZE = 229_309_376;
          const isCached = storageInfo.totalSize >= MODEL_FILE_SIZE;
          setIsModelCached(isCached);

          if (!isCached) {
            setStatus("Preparing initial download...");
            await ModelManager.downloadModel(modelId);
          } else {
            setProgress(100);
          }

          setStatus("Loading AI Intelligence...");
          await ModelManager.loadModel(modelId);
          setStatus("AI Assistant Ready");
        } catch (err) {
          console.error("Initialization failed:", err);
          setStatus("Initialization failed.");
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

  // Copy functionality
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

  // Dynamic Processing Messages
  const getProcessingMessage = () => {
    switch (activeAction) {
      case "generate":
        return "Assistant is generating code...";
      case "debug":
        return "Assistant is debugging your code...";
      case "explain":
        return "Assistant is explaining the logic...";
      case "optimize":
        return "Assistant is optimizing performance...";
      default:
        return "Assistant is thinking...";
    }
  };

  const handleAction = useCallback(
    async (actionType: string) => {
      if (!code.trim() && actionType !== "generate") return;

      setResponse("");
      setIsProcessing(true);
      setActiveAction(actionType);

      let prompt = "";
      if (actionType === "generate") {
        prompt = `Task: Generate functional code for the following request. Provide ONLY the code. Never use comments bactics etc.\n\nRequest: ${code}\n\nAssistant (Code Only):`;
      } else if (actionType === "debug") {
        prompt = `Task: Identify and fix bugs. Explain errors and provide corrected code. dont use comments backticks aestrisks etc.never give wrong answers if you dont know about it.\n\nCode:\n${code}\n\nAssistant:`;
      } else if (actionType === "explain") {
        prompt = `Task: Explain the logic step-by-step in simple terms.dont use comments backticks aestrisks etc.never give wrong answers if you dont know about it.\n\nCode:\n${code}\n\nAssistant:`;
      } else if (actionType === "optimize") {
        prompt = `Task: Improve performance and readability. Provide optimized code.never give wrong answers if you dont know about it.dont use comments backticks aestrisks etc.\n\nCode:\n${code}\n\nAssistant:`;
      }

      try {
        const { stream } = await TextGeneration.generateStream(prompt, {
          maxTokens: 800,
          temperature: actionType === "generate" ? 0.5 : 0.2,
        });

        let fullText = "";
        for await (const token of stream) {
          fullText += token;
          setResponse(fullText);
        }
      } catch (err) {
        setResponse("Generation Error: " + err);
      } finally {
        setIsProcessing(false);
        // Processing khatam hone ke thodi der baad action reset karein animation ke liye
        setTimeout(() => setActiveAction(null), 500);
      }
    },
    [code],
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.3s ease",
      }}
    >
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
                  background:
                    "linear-gradient(135deg, #059669 0%, #10b981 100%)",
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
            {response && (
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
                  color: "#818cf8",
                  marginBottom: "1rem",
                  fontStyle: "italic",
                  animation: "pulse 1.5s infinite",
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
                  ? "Your results will appear here."
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
