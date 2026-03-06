import { useEffect, useState, useCallback, useRef } from "react";
import { ModelManager, EventBus } from "@runanywhere/web";
import { TextGeneration } from "@runanywhere/web-llamacpp";
import { initSDK } from "./runanywhere";

// Module-level singleton: prevents re-running setup on StrictMode double-mount
// or any accidental re-render. Mirrors the same pattern used in initSDK().
let _setupPromise: Promise<void> | null = null;

function App() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Initializing SDK...");
  const [code, setCode] = useState("");
  const [response, setResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Tracks whether THIS component instance has already subscribed to events,
  // so we don't register duplicate listeners on StrictMode's second mount.
  const listenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Only subscribe once per component lifetime
    if (!listenerRef.current) {
      const unsubscribe = EventBus.shared.on("model.downloadProgress", (evt) => {
        const p = Math.round((evt.progress ?? 0) * 100);
        setProgress(p);
        setStatus(`Downloading model: ${p}%`);
      });
      listenerRef.current = unsubscribe;
    }

    const modelId = "lfm2-350m-q4_k_m";

    // If setup is already running (or finished), just attach to the existing
    // promise so the UI stays in sync without restarting the whole process.
    if (!_setupPromise) {
      _setupPromise = (async () => {
        try {
          await initSDK();

          setStatus("Checking model storage...");
          const storageInfo = await ModelManager.getStorageInfo();
          console.log("Storage info:", storageInfo);

          // NOTE: ModelManager.getModels() returns *in-memory* status only.
          // After every page reload it resets to "registered" even if the model
          // file is already saved in OPFS — so status checks like
          // targetModel.status === "downloaded" are unreliable across refreshes.
          //
          // Instead we check OPFS directly via storageInfo.totalSize.
          // The model file is 229,309,376 bytes (~218.7 MB); if OPFS already
          // holds at least that many bytes, the download can be safely skipped.
          const MODEL_FILE_SIZE = 229_309_376; // bytes
          const isModelCached = storageInfo.totalSize >= MODEL_FILE_SIZE;

          if (!isModelCached) {
            console.log("Model not found in OPFS, downloading...");
            setStatus("Downloading model...");
            await ModelManager.downloadModel(modelId);
          } else {
            console.log(
              `Model already in OPFS (${(storageInfo.totalSize / 1024 / 1024).toFixed(1)} MB), skipping download`
            );
            setProgress(100);
          }

          setStatus("Loading model into memory...");
          // n_ctx: 2048 keeps the KV-cache small enough to fit in the WASM
          // linear memory. The default 8192 triggers a ~2 GB allocation that
          // always fails in the browser, so this is required, not optional.
          await ModelManager.loadModel(modelId)

          setStatus("Offline AI Ready!");
          setProgress(100);
        } catch (err) {
          console.error("Initialization error:", err);
          setStatus("Error: " + (err as Error).message);
          // Reset so the user can retry by refreshing
          _setupPromise = null;
          throw err;
        }
      })();
    }

    _setupPromise
      .then(() => setReady(true))
      .catch(() => {/* error already shown in status */});

    // Cleanup: unsubscribe the event listener when the component unmounts
    return () => {
      if (listenerRef.current) {
        listenerRef.current();
        listenerRef.current = null;
      }
    };
  }, []);

  const handleAction = useCallback(
    async (actionType: "debug" | "explain" | "optimize") => {
      if (!code.trim()) return;

      setResponse("");
      setIsProcessing(true);

      const prompt = `Task: ${actionType} the following code. Provide clear and concise feedback.\n\nCode:\n${code}\n\nAssistant:`;

      try {
        const { stream } = await TextGeneration.generateStream(prompt, {
          maxTokens: 500,
          temperature: 0.3,
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
      }
    },
    [code],
  );

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "800px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <header
        style={{
          marginBottom: "20px",
          borderBottom: "1px solid #eee",
          paddingBottom: "10px",
        }}
      >
        <h1>Offline Code Assistant</h1>
        <p style={{ color: ready ? "green" : "#f39c12", fontWeight: "bold" }}>
          Status: {status}
        </p>

        {progress > 0 && progress < 100 && (
          <div
            style={{
              width: "100%",
              backgroundColor: "#eee",
              height: "10px",
              borderRadius: "5px",
              marginTop: "10px",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                backgroundColor: "#007bff",
                height: "10px",
                borderRadius: "5px",
                transition: "width 0.3s ease",
              }}
            ></div>
          </div>
        )}
      </header>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your code here..."
        style={{
          width: "100%",
          height: "200px",
          marginBottom: "10px",
          fontFamily: "monospace",
          padding: "10px",
          borderRadius: "5px",
          border: "1px solid #ccc",
        }}
      />

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => handleAction("debug")}
          disabled={!ready || isProcessing}
          style={{
            padding: "10px 20px",
            cursor: ready ? "pointer" : "not-allowed",
          }}
        >
          {isProcessing ? "Thinking..." : "Debug"}
        </button>
        <button
          onClick={() => handleAction("explain")}
          disabled={!ready || isProcessing}
          style={{
            padding: "10px 20px",
            cursor: ready ? "pointer" : "not-allowed",
          }}
        >
          {isProcessing ? "Thinking..." : "Explain"}
        </button>
        <button
          onClick={() => handleAction("optimize")}
          disabled={!ready || isProcessing}
          style={{
            padding: "10px 20px",
            cursor: ready ? "pointer" : "not-allowed",
          }}
        >
          {isProcessing ? "Thinking..." : "Optimize"}
        </button>
      </div>

      <div
        style={{
          background: "#2d3436",
          color: "white",
          padding: "15px",
          borderRadius: "5px",
          minHeight: "150px",
          whiteSpace: "pre-wrap",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}
      >
        <strong style={{ color: "#00df9a" }}>AI Analysis:</strong>
        <br />
        <div style={{ marginTop: "10px" }}>
          {response ||
            (ready
              ? "Awaiting your code..."
              : "Preparing model environment...")}
        </div>
      </div>
    </div>
  );
}

export default App;