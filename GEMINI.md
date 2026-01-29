# GEMINI.md

## Project Overview

KVEC Triage is an **offline-first** React Native app using Expo. It supports two modes:

1. **Specialty Routing** - Routes patient symptoms to medical specialties
2. **First Responder Mode** - EMS protocol retrieval and drug interaction checks for field medics

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81.5
- **Routing**: expo-router v6 (file-based)
- **LLM**: expo-llm-mediapipe with Gemma 3n LiteRT model (~2GB)
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
  chat.tsx         # Follow-up chat with Gemma 3n
lib/
  llm.ts           # LLM service (triage + protocol inference)
  cloud.ts         # Cloud inference via ngrok (OpenAI-compatible API)
  download.ts      # Model download from HuggingFace
  setfit.ts        # SetFit ONNX classification (body + head models)
  protocols.ts     # EMS protocol retrieval service
  drugs.ts         # Drug interaction and dosing checks
data/
  protocols.json   # 20 EMS protocols (NAEMSP/NASEMSO based)
  drugs.json       # 16 EMS medications with interactions
evaluation/        # Model evaluation scripts
```

## Key Features

### Specialty Routing Mode
1. **Symptom Input** - Text input with example symptoms
2. **Model Download** - Downloads Gemma 3n LiteRT + SetFit ONNX from HuggingFace Hub
3. **Tiered Inference** - SetFit for fast classification (~100ms), LLM for rich enrichment
4. **Hybrid Inference** - Cloud-first with on-device fallback when cloud unavailable
5. **Fallback Routing** - Keyword-based triage when models unavailable
6. **Diagnostic Flow** - Multi-turn assessment with suggested answers
7. **Chat Screen** - Follow-up questions via Gemma 3n
8. **Visit Summary** - Generate shareable provider handoff documents

### First Responder Mode
1. **Fast-Path Matching** - Instant keyword-based protocol match for 7 emergencies (<100ms)
2. **Protocol Retrieval** - LLM-enriched protocol selection for complex cases
3. **Drug Warnings** - Allergy cross-reactions and contraindication checks
4. **Dosage Calculator** - Weight-based pediatric dose calculations
5. **PCR Generation** - Exportable Prehospital Care Report summary
6. **Debug View** - Toggle raw LLM response for troubleshooting

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
| `gemma-3n-E2B-it-int4.task` | google/gemma-3n-E2B-it-litert-lm | ~2GB |
| `specialty-model.onnx` | ekim1394/setfit-specialty-onnx/body/model.onnx | ~90MB |
| `condition-model.onnx` | ekim1394/setfit-condition-onnx/body/model.onnx | ~90MB |
| `specialty-head.onnx` | ekim1394/setfit-specialty-onnx/model_head.onnx | ~39KB |
| `condition-head.onnx` | ekim1394/setfit-condition-onnx/model_head.onnx | ~39KB |
| Tokenizers + Labels | (per model repo) | <1MB |

## Cloud Inference Setup

To enable faster inference via local GPU:

1. Run Ollama/vLLM with Gemma 3n on a local machine with GPU
2. Expose via ngrok: `ngrok http 11434`
3. Configure endpoint in app via `setCloudEndpoint(url)`

## Known Issues

### Android 16KB ELF Alignment

Warning about 16KB page size alignment for Android 15 - non-blocking for development.

## Supported Protocols (EMS)

Cardiac Arrest/ACLS, STEMI, Chest Pain, Bradycardia, Tachycardia, CHF/Pulmonary Edema, Stroke/CVA, Seizure, Head Injury, Respiratory Distress, Asthma/COPD, Anaphylaxis, Allergic Reaction, Hypoglycemia, Opioid Overdose, Hemorrhage Control, Spinal Immobilization, Pediatric Resuscitation (PALS), Pain Management, Nausea/Vomiting

## Supported Specialties

Behavioral Health, Cardiology, Dermatology, Gastroenterology, Neurology, Oncology, Orthopedic Surgery, Pain Management, Primary Care, Pulmonology, Rheumatology, Sports Medicine, Urology, Vascular Medicine, Women's Health

