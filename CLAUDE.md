# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KVEC Triage is an offline-first medical triage app built with Expo SDK 54 + React Native 0.81 + TypeScript. All AI inference (LLM, ASR, vision) runs on-device using GGUF models via native bridges. New Architecture is enabled.

## Development Commands

```bash
bun install                # Install dependencies (bun is the package manager)
npm start                  # Start Expo dev server
npm run ios                # Build and run on iOS simulator
npm run android            # Build and run on Android emulator
```

**EAS builds:**
```bash
eas build --platform ios --profile development    # Dev client
eas build --platform ios --profile production      # Production
```

There is no test suite configured.

## Architecture

### Routing (expo-router, file-based)

- `app/_layout.tsx` — Root Stack layout with SafeAreaProvider + KeyboardProvider
- `app/index.tsx` — PCR Recorder: voice recording → ASR transcription → LLM-generated patient care report. Uses a state machine (`record` → `transcript` → `pcr`)
- `app/chat.tsx` — Multimodal medical chat (text + image input, streaming responses)
- `app/download.tsx` — Model download manager with progress tracking and resume support
- `app/settings.tsx` — Shows downloaded model status and info

### Core Libraries

- `lib/llm.ts` — Singleton LLM context using `llama.rn`. Loads MedGemma 4B Q4_K_M with mmproj vision model. Exposes streaming completion. Context: 2048 tokens, 99 GPU layers.
- `lib/asr.ts` — Wrapper around the custom Voxtral Expo module for speech-to-text
- `lib/download.ts` — Downloads GGUF models from HuggingFace to `DocumentDirectory/models/`. Validates by file size. Persists download state in AsyncStorage.
- `lib/audio.ts` — WAV parsing and audio preprocessing utilities

### Native Module: `modules/expo-voxtral/`

Custom Expo module wrapping Voxtral ASR (C++ library via Swift bridge). iOS only — Android has stubs. Key exports: `loadModel()`, `transcribe()`, `releaseModel()`, `isModelLoaded()`.

### On-Device Models

| Model | Size | Purpose |
|-------|------|---------|
| MedGemma 4B Q4_K_M | ~2.5GB | LLM for PCR generation and chat |
| mmproj-F16.gguf | ~945MB | Vision projector for image understanding |
| Voxtral-Mini-4B Q4_0 | ~2.5GB | Speech-to-text transcription |

### State Management

Local React hooks only (useState/useEffect/useRef). No Redux or Context. LLM and ASR are singletons in their respective lib files.

### UI Conventions

- Dark theme: background `#0f172a` (slate-900), primary `#6366f1` (indigo)
- Streaming tokens rendered in real-time with thinking/reasoning extraction
- `components/HamburgerMenu.tsx` provides navigation across all screens

## Key Constraints

- Android Voxtral ASR is not implemented (stubs only)
- All models must be downloaded before use — download screen gates app access
- LLM context limited to 2048 tokens
- Audio recording: 16kHz mono PCM for ASR compatibility
