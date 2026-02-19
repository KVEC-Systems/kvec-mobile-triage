# KVEC Triage

Offline-first mobile app for EMS Patient Care Report generation and clinical decision support, powered by on-device MedGemma AI.

## Features

- **PCR Generation**: Record verbal patient notes or type them in, and MedGemma generates a structured Patient Care Report with standard EMS sections
- **Triage Assessment**: Inline clinical decision support — acuity scoring (ESI 1-5), differential diagnoses, and transport recommendations
- **Medical Chat**: Conversational AI assistant with multimodal vision support for wound assessment, medication identification, skin conditions, and ECG/monitor analysis
- **Report History**: Saved PCRs with triage assessments, searchable and exportable
- **Privacy-First**: All AI inference runs locally on device — no patient data leaves the phone
- **Offline Capable**: Works without internet after initial model download

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Expo SDK 54 + React Native 0.81 |
| Language | TypeScript |
| LLM Runtime | llama.rn (GGUF) |
| LLM Model | MedGemma 4B Q4_K_M (HAI-DEF) |
| Vision | MedGemma mmproj-F16 |
| ASR | Voxtral Mini 4B |
| Routing | expo-router |
| Storage | AsyncStorage |

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- iOS Simulator or Android Emulator
- [EAS CLI](https://docs.expo.dev/eas/) for production builds

### Installation

```bash
bun install
npm start
```

### Running on Device

```bash
npm run ios       # iOS (requires Mac)
npm run android   # Android
```

On first launch, the app downloads ~5.9 GB of AI models (MedGemma + Voxtral) for on-device inference.

## Architecture

- `app/index.tsx` — PCR Generator: record → transcribe → generate → triage assess
- `app/chat.tsx` — Medical Chat with multimodal vision quick-assess modes
- `app/history.tsx` — Saved PCR report history
- `app/download.tsx` — Model download manager
- `app/settings.tsx` — Model status and information
- `lib/llm.ts` — MedGemma LLM service (singleton, streaming)
- `lib/asr.ts` — Voxtral ASR wrapper
- `lib/download.ts` — HuggingFace model downloader
- `lib/storage.ts` — PCR persistence via AsyncStorage
- `modules/expo-voxtral/` — Custom Expo native module for Voxtral (iOS)

## Building for Production

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

## License

Private - KVEC Systems
