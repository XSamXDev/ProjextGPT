import { useEffect, useState, useCallback } from "react";
import { ModelManager, EventBus } from "@runanywhere/web";
import { TextGeneration } from "@runanywhere/web-llamacpp";
import { initSDK } from "./runanywhere";

function App() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Initializing SDK...");
  const [code, setCode] = useState("");
  const [response, setResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 1. Listener to track download progress
    const unsubscribe = EventBus.shared.on("model.downloadProgress", (evt) => {
      const p = Math.round((evt.progress ?? 0) * 100);
      setProgress(p);
      setStatus(`Downloading model: ${p}%`);
    });

    const setup = async () => {
      try {
        await initSDK();

        const modelId = "lfm2-350m-q4_k_m";

        // 2. Check storage info and model status
        setStatus("Checking model storage...");
        const storageInfo = await ModelManager.getStorageInfo();
        console.log("Storage info:", storageInfo);

        // Check if model is already downloaded
        const models = ModelManager.getModels();
        const targetModel = models.find((m) => m.id === modelId);
        console.log("Model status:", targetModel?.status);

        // Only download if not already cached
        if (targetModel?.status !== "downloaded" && targetModel?.status !== "loaded") {
          console.log("Model not cached, downloading...");
          await ModelManager.downloadModel(modelId);
        } else {
          console.log("Model already cached, skipping download");
          setProgress(100);
        }

        // 3. Load model (with memory optimizations)
        // Keeping n_ctx at 2048 prevents browser crashes
        setStatus("Loading model into memory...");
        await ModelManager.loadModel(modelId);
        // ,{
        //   n_ctx: 2048, // Context size limited to prevent buffer overrun
        //   n_gpu_layers: -1, // Full WebGPU acceleration
        // } );

        setStatus("Offline AI Ready!");
        setReady(true);
        setProgress(100);
      } catch (err) {
        console.error("Initialization error:", err);
        setStatus("Error: " + (err as Error).message);
      }
    };

    setup();

    // Cleanup listener on unmount
    return () => {
      if (unsubscribe) unsubscribe();
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

        {/* Progress Bar UI */}
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
