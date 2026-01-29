# GEMINI.md

## Project Overview

EMS PCR Generator is an **offline-first** React Native app using Expo for on-device speech-to-text transcription and AI-generated Patient Care Reports (PCR).

**Core Workflow:**
1. First responder records verbal patient notes
2. MedASR transcribes speech to text (on-device)
3. User reviews/edits the transcript
4. MedGemma generates structured PCR summary
5. User copies PCR to paste into ePCR system

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81.5
- **Routing**: expo-router v6 (file-based)
- **Speech-to-Text**: MedASR (ONNX, ~154MB) via onnxruntime-react-native
- **LLM**: MedGemma-4B (IQ2_XXS GGUF, ~1.3GB) via llama.rn
- **Audio**: expo-av for recording
- **Build**: EAS Build for iOS/Android

## Project Structure

```
app/
  _layout.tsx      # Root layout
  index.tsx        # PCR Recorder (main screen)
  chat.tsx         # Chat demo
  download.tsx     # Model downloads
lib/
  asr.ts           # MedASR speech recognition
  llm.ts           # MedGemma LLM + PCR generation
  download.ts      # Download both models from HuggingFace
```

## Key Features

1. **On-Device ASR** - MedASR for medical speech recognition
2. **On-Device LLM** - MedGemma for PCR generation
3. **Streaming Output** - Real-time token-by-token display
4. **Offline-First** - Works without internet after download
5. **Copy to ePCR** - Easy clipboard copy for external systems

## Development Commands

```bash
bun start        # Start Expo dev server
bun run ios      # Run on iOS simulator
bun run android  # Run on Android emulator
```

## Build Commands

```bash
eas build --platform ios --profile development
eas build --platform android --profile development
```

## Model Files

Downloaded to `[DocumentDirectory]/models/`:

| File | Source | Size |
|------|--------|------|
| `model.int8.onnx` | MedASR (sherpa-onnx) | ~154MB |
| `tokens.txt` | MedASR vocabulary | ~5KB |
| `medgemma-4b-iq2_xxs.gguf` | MedGemma-4B | ~1.3GB |

**Total download: ~1.46GB**

## HuggingFace Repos

- MedASR: `csukuangfj/sherpa-onnx-medasr-ctc-en-int8-2025-12-25`
- MedGemma: `ekim1394/medgemma-4b-iq2_xxs-gguf`
