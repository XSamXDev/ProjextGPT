

import {
  RunAnywhere,
  SDKEnvironment,
  ModelManager,
  ModelCategory,
  LLMFramework,
  type CompactModelDef,
} from '@runanywhere/web'

import { LlamaCPP } from '@runanywhere/web-llamacpp'

// Define your model catalog
const MODELS: CompactModelDef[] = [
  {
    id: 'lfm2-350m-q4_k_m',
    name: 'LFM2 350M Q4_K_M',
    repo: 'LiquidAI/LFM2-350M-GGUF',
    files: ['LFM2-350M-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 250_000_000,
  },
]

let _initPromise: Promise<void> | null = null

export async function initSDK(): Promise<void> {
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    // 1. Initialize core SDK
    await RunAnywhere.initialize({
      environment: SDKEnvironment.Development,
      debug: true,
    })

    // 2. Register the LlamaCpp backend (loads WASM automatically)
    await LlamaCPP.register()

    // 3. Register model catalog
    RunAnywhere.registerModels(MODELS)
  })()

  return _initPromise
}

export { RunAnywhere, ModelManager, ModelCategory }