# ProjextGPT

An offline AI-powered code assistant that runs entirely in your browser with no server dependencies. Built with React, TypeScript, and RunAnywhere SDK for local AI inference.

## Overview

ProjextGPT provides intelligent code assistance including code generation, debugging, optimization, and explanation - all running locally in your browser using WebAssembly. Your code never leaves your machine.

## Features

- **Offline AI Code Assistant**: Runs 100% locally with no data sent to external servers
- **Multiple Code Actions**:
  - **Generate**: Create functional code from natural language descriptions
  - **Debug**: Identify and fix bugs with detailed explanations
  - **Explain**: Get step-by-step explanations of code logic
  - **Optimize**: Improve code performance and readability
- **Real-time Streaming**: See AI responses as they're generated
- **Syntax Highlighting**: Built-in code editor with syntax highlighting for multiple languages
- **Model Management**: Visual model status indicator with detailed information panel
- **Cancellable Generation**: Stop AI generation at any time
- **Modern UI**: Glassmorphism design with smooth animations

## Technology Stack

### Frontend
- **React 19.2.0**: UI framework
- **TypeScript 5.9.3**: Type-safe development
- **Vite 7.3.1**: Fast build tool and dev server

### AI/ML
- **@runanywhere/web**: SDK for running AI models in the browser
- **@runanywhere/web-llamacpp**: llama.cpp WebAssembly bindings
- **LFM2 1.2B Tool**: Quantized language model (Q4_K_M, ~800MB VRAM)

### Code Editor
- **react-simple-code-editor**: Lightweight code editor component
- **Prism.js**: Syntax highlighting for JavaScript, TypeScript, Java, and more

### Styling
- Custom CSS with glassmorphism effects
- Dark theme optimized for coding

## Project Structure

```
ProjextGPT-temp/
├── src/
│   ├── components/
│   │   └── App.tsx           # Main application component
│   ├── services/
│   │   └── runanywhere.ts    # RunAnywhere SDK initialization
│   ├── styles/
│   │   ├── index.css         # Global styles and theme
│   │   └── App.css           # Component-specific styles
│   ├── assets/
│   │   └── favicon.png       # App icon
│   └── index.tsx             # Application entry point
├── index.html                # HTML template
├── vite.config.ts            # Vite configuration with WASM plugin
├── tsconfig.json             # TypeScript configuration
├── tsconfig.app.json         # App-specific TS config
├── tsconfig.node.json        # Node-specific TS config
├── eslint.config.js          # ESLint configuration
├── package.json              # Project dependencies
└── README.md                 # This file
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn package manager
- Modern browser with WebAssembly and WebGPU support

### Installation

1. Clone the repository:
```bash
git clone https://github.com/XSamXDev/ProjextGPT.git
```

2.  Change the directory to cloned folder:
```bash
cd ProjextGPT
```


3. Install dependencies:
```bash
npm install
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173` (default Vite port).

### Build for Production

Build the optimized production bundle:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

### Linting

Run ESLint to check code quality:
```bash
npm run lint
```

## How It Works

### Model Loading

1. **First Run**: Downloads the LFM2 1.2B quantized model (~800MB) from Hugging Face
2. **Subsequent Runs**: Uses cached model from browser storage (IndexedDB)
3. **Model Loading**: Initializes the llama.cpp WASM runtime with the model

### AI Inference

1. User inputs code or a prompt in the editor
2. Selects an action (Generate, Debug, Explain, or Optimize)
3. The appropriate prompt template is constructed
4. Inference runs locally using the loaded model
5. Response streams back token-by-token for real-time display

### WASM Integration

The `vite.config.ts` includes a custom plugin that:
- Copies WASM binaries to the build output
- Configures proper headers for SharedArrayBuffer support
- Excludes WASM packages from Vite's pre-bundling

## Model Information

- **Model**: LFM2 1.2B Tool by Liquid AI
- **Repository**: LiquidAI/LFM2-1.2B-Tool-GGUF
- **File**: LFM2-1.2B-Tool-Q4_K_M.gguf
- **Framework**: llama.cpp (via WebAssembly)
- **Quantization**: Q4_K_M (4-bit quantization)
- **Parameters**: 1.2 billion
- **Memory Requirement**: ~800 MB VRAM
- **Max Tokens**: 800 (configurable in code)

## Configuration

### Temperature Settings

Located in `src/components/App.tsx`:
- **Generate**: 0.5 (balanced creativity)
- **Debug/Explain/Optimize**: 0.2 (more deterministic)

### Model Parameters

Located in `src/services/runanywhere.ts`:
```typescript
const MODELS: CompactModelDef[] = [
  {
    id: 'lfm2-1.2b-tool-q4_k_m',
    name: 'LFM2 1.2B Tool',
    repo: 'LiquidAI/LFM2-1.2B-Tool-GGUF',
    files: ['LFM2-1.2B-Tool-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 800_000_000,
  },
]
```

### Vite Server Headers

Required for SharedArrayBuffer (used by WASM):
```typescript
headers: {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}
```

## Browser Compatibility

- Chrome/Edge 95+ (recommended)
- Firefox 102+
- Safari 16.4+

Requires:
- WebAssembly support
- SharedArrayBuffer support
- IndexedDB for model caching

## Performance Tips

1. **First Load**: Initial model download takes time depending on your connection
2. **GPU Acceleration**: Use browsers with WebGPU support for better performance
3. **Memory**: Ensure at least 2GB of available RAM
4. **Cache**: Model is cached after first download for instant subsequent loads

## Privacy & Security

- **100% Offline**: All AI inference happens locally in your browser
- **No Telemetry**: No data collection or analytics
- **No External Calls**: After model download, no internet connection needed
- **Local Storage Only**: Models stored in browser IndexedDB

## Troubleshooting

### Model Won't Load
- Clear browser cache and reload
- Check browser console for errors
- Ensure sufficient memory available

### Slow Performance
- Close other tabs to free up memory
- Try a browser with WebGPU support
- Reduce max tokens in the code

### Build Errors
- Delete `node_modules` and reinstall: `npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Ensure correct Node.js version (v18+)

## Contributing

Contributions are welcome! Please ensure:
- Code follows the existing style
- TypeScript types are properly defined
- ESLint passes without errors
- Test the build before submitting

## License

This project uses the following open-source components:
- React (MIT License)
- RunAnywhere SDK (check vendor license)
- LFM2 Model (check Liquid AI license)
- Prism.js (MIT License)

## Acknowledgments

- **Liquid AI** for the LFM2 model
- **RunAnywhere** for the browser-based inference SDK
- **llama.cpp** community for WASM implementation

## Future Enhancements

- [ ] Support for additional models
- [ ] Multi-language syntax highlighting
- [ ] Code diff viewer
- [ ] Export/import code snippets
- [ ] Customizable themes
- [ ] Keyboard shortcuts
- [ ] Chat-based interface option

## Status

Currently in active development. This is a proof-of-concept demonstrating local AI inference for code assistance.

---

**Built with passion for privacy-first AI tools**
