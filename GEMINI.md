# GEMINI.md

## Project Overview

MedGemma Chat is an **offline-first** React Native chat app using Expo for on-device medical AI conversations.

**Core Functionality:**
1. User types a health question
2. App runs MedGemma-4B via llama.rn (GGUF format)
3. Streaming responses appear in real-time
4. All inference runs locally - no internet required

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81.5
- **Routing**: expo-router v6 (file-based)
- **LLM**: MedGemma-4B (IQ2_XXS quantized, ~1.3GB)
- **Runtime**: llama.rn for on-device GGUF inference
- **Build**: EAS Build for iOS/Android

## Project Structure

```
app/
  _layout.tsx      # Root layout
  index.tsx        # Chat interface
  download.tsx     # Model download screen
lib/
  llm.ts           # LLM initialization + streaming inference
  download.ts      # Model download from HuggingFace
```

## Key Features

1. **On-Device LLM** - MedGemma runs entirely on device
2. **Streaming Responses** - Real-time token-by-token output
3. **Offline-First** - Works without internet after download
4. **Dark Theme** - Modern chat UI with dark mode

## Development Commands

```bash
npm start        # Start Expo dev server
npm run ios      # Run on iOS simulator
npm run android  # Run on Android emulator
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
| `medgemma-4b-iq2_xxs.gguf` | MedGemma-4B | ~1.3GB |

HuggingFace repo: `ekim1394/medgemma-4b-iq2_xxs-gguf`
