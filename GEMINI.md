# GEMINI.md

## Project Overview

Protocol Navigator is an **offline-first** React Native app using Expo for semantic search of clinical guidelines.

**Core Functionality:**
1. User types a symptom (e.g., "crushing chest pain")
2. App embeds the query using **MedSigLIP** text encoder
3. App performs vector search (cosine similarity) against bundled protocols
4. App displays matching guideline text instantly

## Tech Stack

- **Framework**: Expo SDK 54 + React Native 0.81.5
- **Routing**: expo-router v6 (file-based)
- **Embeddings**: MedSigLIP (google/medsiglip-448) text encoder via ONNX
- **Runtime**: onnxruntime-react-native for on-device inference
- **Data**: epfl-llm/guidelines dataset (WHO, CDC, NICE sources)
- **Build**: EAS Build for iOS/Android

## Project Structure

```
app/               # Expo Router pages
  _layout.tsx      # Root layout
  index.tsx        # Home - semantic search input
  download.tsx     # Model download screen
  results.tsx      # Protocol search results
lib/
  semantic-search.ts  # ONNX inference + cosine similarity
  download.ts         # Model download from HuggingFace
assets/
  protocols.json      # Pre-embedded protocol database (bundled)
scripts/
  build_vector_db.py  # Generate embeddings from guidelines
  requirements.txt    # Python dependencies
```

## Key Features

1. **Semantic Search** - AI-powered protocol matching
2. **Offline-First** - All inference runs on-device
3. **Multi-Source** - WHO, CDC, NICE guidelines
4. **Expandable Results** - View full protocol text
5. **Source Links** - Access original guideline URLs

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
| `medsiglip-text.onnx` | MedSigLIP text encoder | ~350MB |
| `medsiglip-tokenizer.json` | Tokenizer vocabulary | ~500KB |

Bundled with app:

| File | Description |
|------|-------------|
| `assets/protocols.json` | Pre-embedded protocol database |

## Generating Protocol Embeddings

1. Install Python dependencies:
   ```bash
   cd scripts
   pip install -r requirements.txt
   ```

2. Run the ingestion script:
   ```bash
   python build_vector_db.py
   ```

3. Upload ONNX model to HuggingFace:
   ```bash
   huggingface-cli upload ekim1394/medsiglip-text-onnx models/medsiglip-text.onnx
   huggingface-cli upload ekim1394/medsiglip-text-onnx models/medsiglip-tokenizer.json
   ```

## Protocol Sources

- **WHO** - World Health Organization guidelines
- **CDC** - Centers for Disease Control guidelines
- **NICE** - National Institute for Health and Care Excellence
- **ICRC** - International Committee of the Red Cross
