# KVEC Triage

Offline-first mobile app for symptom-to-specialty routing using on-device AI inference.

## Features

- **Privacy-First**: All inference runs locally on device - no data leaves your phone
- **Offline Capable**: Works without internet after initial model download
- **Clinical Accuracy**: Powered by MedGemma 4B, a medical-focused LLM
- **Smart Fallback**: Keyword-based routing when LLM is unavailable

## Screenshots

| Home | Results |
|------|---------|
| Symptom input with voice | Specialty + confidence |

## Getting Started

### Prerequisites

- Node.js 18+
- iOS Simulator or Android Emulator
- [EAS CLI](https://docs.expo.dev/eas/) for building

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start
```

### Running on Device

```bash
# iOS (requires Mac)
npm run ios

# Android
npm run android
```

## How It Works

1. **User describes symptoms** in natural language
2. **On-device LLM** (MedGemma 4B) analyzes the description
3. **Returns recommendation**: specialty, confidence, possible conditions, and guidance
4. **Falls back** to keyword matching if LLM unavailable

## Model Download

On first launch, the app prompts to download the MedGemma GGUF model (~2.5 GB). Users can skip this for limited functionality.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Expo SDK 54 |
| Language | TypeScript |
| LLM Runtime | llama.rn |
| Model | MedGemma 4B Q4_K_M |
| Routing | expo-router |

## Supported Specialties

- Behavioral Health
- Cardiology
- Dermatology
- Gastroenterology
- Neurology
- Oncology
- Orthopedic Surgery
- Pain Management
- Primary Care
- Pulmonology
- Rheumatology
- Sports Medicine
- Urology
- Vascular Medicine
- Women's Health

## Building for Production

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

## License

Private - KVEC Systems
