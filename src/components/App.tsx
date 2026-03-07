import { useEffect, useState, useCallback, useRef } from "react";
import { ModelManager, EventBus } from "@runanywhere/web";
import { TextGeneration } from "@runanywhere/web-llamacpp";
import { initSDK } from "../services/runanywhere";

// Syntax Highlighting Imports (from previous steps)
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
  const [progress, setProgress] = useState(0);

  // 1. New state to check if the model is cached
  const [, setIsModelCached] = useState<boolean | null>(null);

  const listenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Progress listener remains active only while a download is happening
    if (!listenerRef.current) {
      const unsubscribe = EventBus.shared.on("model.downloadProgress", (evt) => {
        const p = Math.round((evt.progress ?? 0) * 100);
        setProgress(p);
        setStatus(`Downloading AI Model: ${p}%`);
      });
      listenerRef.current = unsubscribe;
    }

    const modelId = "lfm2-350m-q4_k_m";

    if (!_setupPromise) {
      _setupPromise = (async () => {
        try {
          // A. Initialize the SDK
          await initSDK();

          // B. Check if the model is already in local storage
          setStatus("Checking local assets...");
          const storageInfo = await ModelManager.getStorageInfo();
          
          // The file size of this specific model (LFM2-350M-Q4) is approximately 229MB
          const MODEL_FILE_SIZE = 229_309_376; 
          const isCached = storageInfo.totalSize >= MODEL_FILE_SIZE;
          
          setIsModelCached(isCached); // Update state for the UI

          if (!isCached) {
            // if not cached, download it (progress bar will run here)
            setStatus("Preparing initial download...");
            await ModelManager.downloadModel(modelId);
          } else {
            // If cached, set progress directly to 100%
            setProgress(100); 
          }

          // C. Load the model
          setStatus("Loading AI Intelligence...");
          await ModelManager.loadModel(modelId);
          setStatus("AI Assistant Ready");
          
        } catch (err) {
          console.error("Initialization failed:", err);
          setStatus("Initialization failed.");
          _setupPromise = null; // to allow retry
        }
      })();
    }

    _setupPromise.then(() => setReady(true));

    return () => {
      if (listenerRef.current) {
        listenerRef.current(); // Unsubscribe the previous listener
        listenerRef.current = null;
      }
    };
  }, []);

  const handleAction = useCallback(async (actionType: string) => {
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
  }, [code]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Enhanced Modern Header */}
      <nav className="glass" style={{
        padding: "1rem 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 100
      }}>
        <div>
          <h2 style={{ margin: 0, background: "linear-gradient(to right, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ProjextGPT
          </h2>
          <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>Offline Code Intelligence</span>
        </div>
        
        <div style={{ textAlign: "right" }}>
          {/* Status color coded */}
          <div style={{ fontSize: "0.85rem", color: ready ? "#4ade80" : "#fbbf24", fontWeight: 600 }}>
            ● {status}
          </div>
          
          {/* 2. Progress Bar refined logic: Sirf tab dikhaye jab download ho raha ho */}
          {progress > 0 && progress < 100 && (
            <div style={{ width: "150px", height: "5px", background: "#334155", borderRadius: "3px", marginTop: "5px", overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "#6366f1", borderRadius: "3px", transition: "width 0.3s ease" }} />
            </div>
          )}
        </div>
      </nav>

      {/* Main Content Layout (Grid based for responsiveness) */}
      <main style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
        gap: "2rem",
        padding: "2rem",
        maxWidth: "1400px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box"
      }}>
        
        {/* Left Side: Input Editor */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 500 }}>Source Code</h3>
            <div style={{ display: "flex", gap: "0.6rem" }}>
                <button onClick={() => handleAction("debug")} disabled={!ready || isProcessing} className="primary">Debug</button>
                <button onClick={() => handleAction("explain")} disabled={!ready || isProcessing}>Explain</button>
                <button onClick={() => handleAction("optimize")} disabled={!ready || isProcessing}>Optimize</button>
            </div>
          </div>
          <div className="glass code-editor-container">
            <Editor
              value={code}
              onValueChange={code => setCode(code)}
              highlight={code => Prism.highlight(code, Prism.languages.javascript, 'javascript')}
              padding={20}
              placeholder="// Paste your code here..."
              style={{
                fontFamily: '"Fira Code", monospace',
                fontSize: 14,
                outline: 0,
                color: "#cbd5e1",
              }}
            />
          </div>
        </section>

        {/* Right Side: Output Panel */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 500 }}>AI Analysis</h3>
          <div className="glass" style={{
            flex: 1,
            padding: "1.5rem",
            borderRadius: "12px",
            fontSize: "0.95rem",
            lineHeight: "1.7",
            overflowY: "auto",
            maxHeight: "calc(100vh - 220px)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            color: "#cbd5e1"
          }}>
            {isProcessing && <div style={{ color: "#818cf8", marginBottom: "1rem", fontStyle: "italic" }}>Assistant is thinking...</div>}
            <div style={{ whiteSpace: "pre-wrap" }}>
              {response || (ready ? "Your analysis will appear here." : "AI is initializing locally...")}
            </div>
          </div>
        </section>
      </main>

      {/* Footer Branding */}
      <footer style={{ padding: "1rem", textAlign: "center", fontSize: "0.8rem", opacity: 0.5 }}>
        Building..................
      </footer>
    </div>
  );
}

export default App;