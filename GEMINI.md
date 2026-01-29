# GEMINI.md

## Project Overview

KVEC Triage is an **offline-first** React Native app using Expo that routes patient symptoms to medical specialties via hybrid on-device and cloud LLM inference.

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81.5
- **Routing**: expo-router v6 (file-based)
- **LLM**: llama.rn with MedGemma 4B IQ2_XXS GGUF model (~1.1GB)
- **Cloud Inference**: Optional ngrok tunnel to local GPU server (OpenAI-compatible API)
- **Fast Classification**: SetFit ONNX models for sub-100ms specialty/condition routing
- **Build**: EAS Build for iOS/Android

## Project Structure

```
app/               # Expo Router pages
  _layout.tsx      # Root layout
  index.tsx        # Home - symptom input
  download.tsx     # Model download screen
  results.tsx      # Triage results display
  diagnostic.tsx   # Multi-turn diagnostic assessment
  chat.tsx         # Follow-up chat with MedGemma
lib/
  llm.ts           # LLM service (init, inference, enrichment, fallback)
  cloud.ts         # Cloud inference via ngrok (OpenAI-compatible API)
  download.ts      # Model download from HuggingFace
  setfit.ts        # SetFit ONNX classification (body + head models)
evaluation/        # Model evaluation scripts
```

## Key Features

1. **Symptom Input** - Text input with example symptoms
2. **Model Download** - Downloads MedGemma GGUF + SetFit ONNX from HuggingFace Hub
3. **Tiered Inference** - SetFit for fast classification (~100ms), LLM for rich enrichment
4. **Hybrid Inference** - Cloud-first with on-device fallback when cloud unavailable
5. **Fallback Routing** - Keyword-based triage when models unavailable
6. **Diagnostic Flow** - Multi-turn assessment with suggested answers
7. **Chat Screen** - Follow-up questions via MedGemma
8. **Visit Summary** - Generate shareable provider handoff documents

## Development Commands

```bash
npm start        # Start Expo dev server
npm run ios      # Run on iOS simulator
npm run android  # Run on Android emulator
npx expo prebuild --platform android  # Regenerate android folder
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
| `medgemma-4b-iq2_xxs.gguf` | ekim1394/medgemma-4b-iq2_xxs-gguf | ~1.1GB |
| `specialty-model.onnx` | ekim1394/setfit-specialty-onnx/body/model.onnx | ~90MB |
| `condition-model.onnx` | ekim1394/setfit-condition-onnx/body/model.onnx | ~90MB |
| `specialty-head.onnx` | ekim1394/setfit-specialty-onnx/model_head.onnx | ~39KB |
| `condition-head.onnx` | ekim1394/setfit-condition-onnx/model_head.onnx | ~39KB |
| Tokenizers + Labels | (per model repo) | <1MB |

## Cloud Inference Setup

To enable faster inference via local GPU:

1. Run Ollama/vLLM with MedGemma on a local machine with GPU
2. Expose via ngrok: `ngrok http 11434`
3. Configure endpoint in app via `setCloudEndpoint(url)`

## Known Issues

### Android 16KB ELF Alignment

Warning about 16KB page size alignment for Android 15 - non-blocking for development.

## Supported Specialties

Behavioral Health, Cardiology, Dermatology, Gastroenterology, Neurology, Oncology, Orthopedic Surgery, Pain Management, Primary Care, Pulmonology, Rheumatology, Sports Medicine, Urology, Vascular Medicine, Women's Health
