# GEMINI.md

## Project Overview

MedStar Triage is an **offline-first** React Native app using Expo that routes patient symptoms to medical specialties via on-device LLM inference.

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81
- **Routing**: expo-router v6 (file-based)
- **LLM**: llama.rn with MedGemma 4B Q4_K_M GGUF model
- **Build**: EAS Build for iOS/Android

## Project Structure

```
app/               # Expo Router pages
  _layout.tsx      # Root layout
  index.tsx        # Home - symptom input
  download.tsx     # Model download screen
  results.tsx      # Triage results display
lib/
  llm.ts           # LLM service (init, inference, fallback)
  download.ts      # Model download from HuggingFace
```

## Key Features

1. **Symptom Input** - Text input with example symptoms
2. **Model Download** - Downloads MedGemma GGUF from HuggingFace Hub with progress UI
3. **On-Device Inference** - Uses llama.rn for privacy-first triage
4. **Fallback Routing** - Keyword-based triage when LLM unavailable

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

## Model Location

GGUF model must be at: `[DocumentDirectory]/models/medgemma-4b-q4_k_m.gguf`

## Supported Specialties

Behavioral Health, Cardiology, Dermatology, Gastroenterology, Neurology, Oncology, Orthopedic Surgery, Pain Management, Primary Care, Pulmonology, Rheumatology, Sports Medicine, Urology, Vascular Medicine, Women's Health
