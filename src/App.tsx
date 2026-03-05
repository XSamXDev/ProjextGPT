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
    const setup = async () => {
      try {
        await initSDK();

        const modelId = "lfm2-350m-q4_k_m";
        const models = ModelManager.getModels();
        const model = models.find((m) => m.id === modelId);

        if (model) {
          // Check if the model has been downloaded before; if not, download it.
          const modelDownloaded = localStorage.getItem("modelDownloaded");
          if (!modelDownloaded) {
            if (model.status !== "downloaded" && model.status !== "loaded") {
              setStatus("Downloading model for offline use...");
              await ModelManager.downloadModel(modelId);
            } else {
              setStatus("Model found in storage...");
            }
            // Mark that the model has been downloaded so we skip this step next time.
            localStorage.setItem("modelDownloaded", "true");
          }

          // Load the model on every app start (required before generation).
          setStatus("Loading model...");
          await ModelManager.loadModel(modelId);
          // Optionally keep a flag that the model is loaded for this session.
          localStorage.setItem("modelLoaded", "true");

          setStatus("Offline AI Ready!");
          setReady(true);
        }
      } catch (err) {
        setStatus("Error: " + (err as Error).message);
      }
    };
    setup();
  }, []);

  const handleAction = useCallback(
    async (actionType: "debug" | "explain" | "optimize") => {
      if (!code.trim()) return;

      setResponse("");
      setIsProcessing(true);

      // AI ke liye instruction set karein
      const prompt = `Task: ${actionType} the following code. Provide clear and concise feedback.\n\nCode:\n${code}\n\nAssistant:`;

      try {
        // Real-time token streaming [cite: 78, 156, 226]
        const { stream } = await TextGeneration.generateStream(prompt, {
          maxTokens: 500,
          temperature: 0.3,
        });

        let fullText = "";
        for await (const token of stream) {
          fullText += token;
          setResponse(fullText); // UI update [cite: 85, 234]
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
        <p style={{ color: ready ? "green" : "orange" }}>Status: {status}</p>
        {progress > 0 && progress < 100 && (
          <div
            style={{
              width: "100%",
              backgroundColor: "#eee",
              height: "10px",
              borderRadius: "5px",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                backgroundColor: "#007bff",
                height: "10px",
                borderRadius: "5px",
              }}
            ></div>
          </div>
        )}
      </header>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Apna code yaha paste karein..."
        style={{
          width: "100%",
          height: "200px",
          marginBottom: "10px",
          fontFamily: "monospace",
          padding: "10px",
        }}
      />

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={() => handleAction("debug")}
          disabled={!ready || isProcessing}
        >
          {isProcessing ? "Thinking..." : "Debug"}
        </button>
        <button
          onClick={() => handleAction("explain")}
          disabled={!ready || isProcessing}
        >
          {isProcessing ? "Thinking..." : "Explain"}
        </button>
        <button
          onClick={() => handleAction("optimize")}
          disabled={!ready || isProcessing}
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
          minHeight: "100px",
          whiteSpace: "pre-wrap",
        }}
      >
        <strong>AI Analysis:</strong>
        <br />
        {response || (ready ? "Awaiting your code..." : "Preparing model...")}
      </div>
    </div>
  );
}

export default App;
