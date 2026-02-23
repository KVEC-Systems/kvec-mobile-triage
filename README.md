# KVEC Triage

Offline-first mobile app for EMS Patient Care Report generation and clinical decision support, powered by on-device MedGemma AI. All inference runs locally — no patient data ever leaves the device.

## Features

- **PCR Generation** — Type brief clinical notes and MedGemma generates a structured Patient Care Report (7 NHTSA/NEMSIS sections) with styled section cards
- **Triage Assessment** — AI-assisted clinical decision support: ESI acuity scoring (1–5), differential diagnoses, recommended interventions, and transport priority
- **Medical Chat** — Conversational medical AI with multimodal vision: wound assessment, medication identification, skin conditions, and ECG/monitor analysis
- **Chat History** — Auto-saved conversations, restorable and deletable
- **Report History** — Saved PCRs with triage assessments, searchable and exportable
- **100% Offline** — All AI runs on-device after one-time model download. No cloud calls, no analytics, no telemetry. HIPAA compliance by architecture.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Expo SDK 54 + React Native 0.81 (New Architecture) |
| Language | TypeScript |
| LLM Runtime | llama.rn (GGUF format) |
| LLM Model | MedGemma 4B Q4_K_M (~2.49 GB) |
| Vision Projector | mmproj-F16.gguf (~945 MB) |
| ASR | Voxtral Mini 4B (custom native module, iOS only) |
| Routing | expo-router (file-based) |
| Storage | AsyncStorage (PCRs capped at 100, chats at 50) |

## Device Requirements

| Requirement | Minimum |
|-------------|---------|
| iOS | 16.0+ |
| RAM | 8 GB (iPhone 15 Pro or later recommended) |
| Free storage | ~4 GB for models + app |
| First-launch download | ~3.4 GB (MedGemma + mmproj) over WiFi |
| Android | Builds available, but Voxtral ASR is iOS-only (stubs on Android) |

## Performance (iPhone 15 Pro, A17 Pro)

| Metric | Value |
|--------|-------|
| MedGemma cold start | ~8–12 s |
| PCR generation | ~15–30 s |
| Triage assessment | ~10–20 s |
| Token throughput | ~15–25 tokens/s |
| Runtime memory | ~2.5 GB |
| GPU layers | 99 (Metal) on device, 0 on simulator |

## Quick Start

### Prerequisites

- **Bun** (package manager): `curl -fsSL https://bun.sh/install | bash`
- **Node.js** 18+
- **Xcode** 16+ with iOS Simulator (for iOS development)
- **EAS CLI**: `npm install -g eas-cli` (for device builds)

### Install & Run

```bash
# Install dependencies
bun install

# Start Expo dev server
npm start

# Run on iOS simulator (requires dev client build)
npm run ios

# Run on Android emulator
npm run android
```

### Build Dev Client (required for on-device testing)

The app uses native modules (llama.rn, Voxtral) that require a custom dev client — Expo Go will not work.

```bash
# Build iOS dev client (internal distribution)
eas build --platform ios --profile development

# Build Android dev client
eas build --platform android --profile development
```

### Production Build

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Architecture

```
app/
  _layout.tsx          Root Stack layout (SafeAreaProvider + KeyboardProvider)
  index.tsx            PCR Generator: notes → MedGemma → structured report → triage
  chat.tsx             Medical Chat with multimodal vision quick-assess modes
  chat-history.tsx     Saved chat conversations
  history.tsx          Saved PCR report history
  download.tsx         Model download manager with progress tracking
  settings.tsx         Model status and device info

lib/
  llm.ts               MedGemma LLM service (singleton, streaming, vision reinit)
  asr.ts               Voxtral ASR wrapper
  download.ts          HuggingFace model downloader with resume support
  storage.ts           PCR persistence (AsyncStorage)
  chat-storage.ts      Chat persistence (AsyncStorage)

components/
  HamburgerMenu.tsx    Navigation drawer

modules/
  expo-voxtral/        Custom Expo native module for Voxtral ASR (Swift/C++)
```

## License

Private — KVEC Systems
