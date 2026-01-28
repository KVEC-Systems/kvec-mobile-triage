# GEMINI.md

## Project Overview

KVEC Triage is an **offline-first** React Native app using Expo that routes patient symptoms to medical specialties via on-device LLM inference.

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81
- **Routing**: expo-router v6 (file-based)
- **LLM**: llama.rn with MedGemma 4B Q2_K GGUF model (~1.4GB)
- **Fast Classification**: SetFit ONNX models (blocked - see Known Issues)
- **Build**: EAS Build for iOS/Android

## Project Structure

```
app/               # Expo Router pages
  _layout.tsx      # Root layout
  index.tsx        # Home - symptom input
  download.tsx     # Model download screen
  results.tsx      # Triage results display
  chat.tsx         # Follow-up chat with MedGemma
lib/
  llm.ts           # LLM service (init, inference, fallback)
  download.ts      # Model download from HuggingFace
  setfit.ts        # SetFit ONNX classification (disabled)
```

## Key Features

1. **Symptom Input** - Text input with example symptoms
2. **Model Download** - Downloads MedGemma GGUF + SetFit ONNX from HuggingFace Hub
3. **On-Device Inference** - Uses llama.rn for privacy-first triage
4. **Fallback Routing** - Keyword-based triage when LLM unavailable
5. **Chat Screen** - Follow-up questions via MedGemma

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
| `medgemma-4b-q2_k.gguf` | ekim1394/medgemma-4b-q2_k-gguf | ~1.4GB |
| `specialty-model.onnx` | ekim1394/setfit-specialty-onnx/body/model.onnx | ~90MB |
| `condition-model.onnx` | ekim1394/setfit-condition-onnx/body/model.onnx | ~90MB |
| `specialty-head.onnx` | ekim1394/setfit-specialty-onnx/model_head.onnx | ~39KB |
| `condition-head.onnx` | ekim1394/setfit-condition-onnx/model_head.onnx | ~39KB |
| Tokenizers + Labels | (per model repo) | <1MB |

## Known Issues

### SetFit ONNX Blocked

The SetFit head models output `ONNX_TYPE_SEQUENCE` which `onnxruntime-react-native` doesn't support. **SetFit is currently disabled.**

To fix, re-export head models with:

```python
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

options = {type(model.model_head): {'zipmap': False}}
onnx_model = convert_sklearn(
    model.model_head,
    initial_types=[('embedding', FloatTensorType([None, 384]))],
    options=options
)
```

### Android 16KB ELF Alignment

Warning about 16KB page size alignment for Android 15 - non-blocking for development.

## Supported Specialties

Behavioral Health, Cardiology, Dermatology, Gastroenterology, Neurology, Oncology, Orthopedic Surgery, Pain Management, Primary Care, Pulmonology, Rheumatology, Sports Medicine, Urology, Vascular Medicine, Women's Health
