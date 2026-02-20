# KVEC Triage: On-Device MedGemma for EMS Patient Care Report Generation and Clinical Decision Support

**Kaggle MedGemma Impact Challenge — Technical Overview**
**Team:** KVEC Systems | **Category:** Edge AI Deployment

---

## 1. Problem Statement

Emergency Medical Services (EMS) providers face a critical documentation burden. After every patient encounter, paramedics and EMTs must complete a Patient Care Report (PCR) — a structured medical document required by NHTSA/NEMSIS standards covering chief complaint, history of present illness, vitals, physical exam, clinical assessment, interventions, and disposition. In practice, providers spend 20–40 minutes per report, often completing documentation hours after the call from memory. This delay degrades accuracy, introduces recall bias, and pulls providers away from patient care.

The consequences are measurable. Incomplete or delayed PCRs affect hospital handoff quality, billing accuracy, and quality assurance. In high-volume systems, documentation backlogs lead to provider burnout and overtime costs. Rural and austere environments compound the problem: limited connectivity makes cloud-based solutions unreliable, and HIPAA compliance concerns discourage transmitting patient data over public networks.

**KVEC Triage addresses this by bringing MedGemma directly to the provider's phone.** The app records verbal patient notes at the point of care, transcribes them on-device, and uses MedGemma to generate a complete, structured PCR in seconds — entirely offline, with zero patient data leaving the device.

## 2. Solution Architecture

### 2.1 Core Pipeline: Voice → Transcript → PCR → Triage

KVEC Triage implements a four-stage clinical documentation pipeline, all running on-device:

1. **Voice Capture** — The provider taps record and speaks their patient notes naturally, as they would during a radio report. Audio is captured at 16kHz mono PCM via `expo-audio-studio`.

2. **On-Device ASR** — Voxtral Mini 4B (Q4_0, ~2.5GB) transcribes the audio locally through a custom Expo native module (`expo-voxtral`) with a C++/Swift bridge. GPU-accelerated inference via Metal delivers real-time transcription.

3. **PCR Generation with MedGemma** — The transcript is passed to MedGemma 4B (Q4_K_M, ~2.5GB) running via `llama.rn` with 99 GPU layers offloaded to Metal. A carefully engineered system prompt instructs MedGemma to produce a structured PCR with seven standard EMS sections: Chief Complaint, HPI, Vitals, Physical Exam, Assessment, Interventions, and Disposition. The model uses standard EMS abbreviations and explicitly avoids fabricating information not present in the transcript. Tokens stream to the UI in real-time, giving providers immediate feedback.

4. **Triage Assessment** — After PCR generation, providers can request clinical decision support. MedGemma analyzes the completed PCR and produces an ESI acuity level (1–5) with justification, top 3 differential diagnoses with reasoning, recommended additional interventions, and transport priority with facility type recommendation. This second-pass analysis leverages MedGemma's medical training to surface clinical insights the provider may want to consider.

### 2.2 Multimodal Medical Chat

Beyond PCR generation, KVEC Triage provides a conversational medical AI assistant with multimodal vision support via MedGemma's mmproj-F16 projector (~945MB). Four specialized quick-assess modes are available:

- **Wound Assessment** — Photograph wounds for classification (laceration, abrasion, burn, puncture), severity estimation, and field treatment recommendations
- **Medication Identification** — Photograph pills or packaging for identification, common indications, and drug interaction alerts
- **Skin Condition Assessment** — Photograph rashes or skin findings for pattern recognition and differential suggestions
- **ECG/Monitor Analysis** — Photograph 12-lead ECGs or cardiac monitors for rhythm identification and clinical correlation

Each mode uses a domain-specific prompt that guides MedGemma's analysis, and all include appropriate disclaimers about AI-assisted assessment requiring clinical confirmation.

### 2.3 Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Expo SDK 54 + React Native 0.81 | Cross-platform mobile app |
| Language | TypeScript | Type-safe development |
| LLM Runtime | llama.rn (GGUF) | On-device MedGemma inference |
| LLM Model | MedGemma 4B Q4_K_M (unsloth) | PCR generation, triage, chat |
| Vision | mmproj-F16.gguf | Multimodal image understanding |
| ASR | Voxtral Mini 4B Q4_0 | On-device speech-to-text |
| ASR Bridge | Custom Expo Module (C++/Swift) | Native Voxtral integration |
| Storage | AsyncStorage | Local PCR history persistence |
| Navigation | expo-router (file-based) | Screen routing |

### 2.4 HAI-DEF Model Usage

KVEC Triage uses MedGemma 4B, a Health AI Developer Foundations (HAI-DEF) model from Google, as the core intelligence for all clinical AI features. MedGemma is used in three distinct roles:

1. **Structured documentation generation** — Transforming unstructured verbal notes into formatted, standards-compliant PCRs
2. **Clinical reasoning** — Analyzing completed PCRs to produce triage assessments with acuity scoring and differential diagnoses
3. **Multimodal medical analysis** — Processing clinical photographs through the mmproj vision projector for wound, medication, skin, and cardiac assessment

The Q4_K_M quantization was selected to balance inference quality with mobile memory constraints (~3.5GB during inference on iPhone 15 Pro with 8GB RAM). All 99 model layers are offloaded to GPU via Metal for optimal throughput (~15–25 tokens/sec).

## 3. Evaluation and Impact

### 3.1 Performance Benchmarks

Measured on iPhone 15 Pro (A17 Pro chip, 8GB RAM):

| Metric | Value |
|--------|-------|
| MedGemma load time | ~8–12 seconds |
| PCR generation | ~15–30 seconds |
| Triage assessment | ~10–20 seconds |
| Token throughput | ~15–25 tokens/sec |
| Runtime memory | ~3.5 GB |
| Total model storage | ~5.9 GB |

### 3.2 PCR Quality Assessment

We evaluated PCR generation across representative EMS scenarios (STEMI, MVC trauma, pediatric respiratory distress) against four criteria:

- **Structural completeness** — All seven required sections consistently present in generated output
- **Medical terminology** — Correct use of standard EMS abbreviations (pt, y/o, hx, dx, BP, HR, SpO2, GCS, etc.)
- **Fidelity** — No hallucinated clinical findings beyond what appears in the source transcript
- **Conciseness** — Appropriate level of detail matching ePCR documentation standards

MedGemma reliably organizes disjointed verbal notes into properly sectioned PCRs, correctly inferring section boundaries (e.g., placing "12-lead shows ST elevation in V1–V4" in Physical Exam, and "STEMI" in Assessment). The model's medical domain training is evident in its appropriate use of clinical terminology and its ability to distinguish assessment from objective findings.

### 3.3 Edge AI Advantages

Running MedGemma on-device provides four critical advantages for EMS:

- **Zero-latency access** — No network round-trip. PCR generation works immediately in the field, including during transport.
- **HIPAA compliance by design** — Patient data never leaves the device. No cloud API calls, no data transmission, no third-party data processing agreements required. This is the strongest possible privacy posture.
- **Austere environment reliability** — Functions in rural areas without cell coverage, underground parking structures, disaster zones with damaged infrastructure, and during mass casualty incidents when networks are congested.
- **Operational independence** — No subscription costs, no API rate limits, no service outages. Once models are downloaded, the app functions indefinitely without internet.

### 3.4 Real-World Impact Potential

KVEC Triage targets a specific, high-value problem in healthcare delivery:

- **~40 million EMS transports per year** in the United States alone, each requiring PCR documentation
- **Documentation time reduction** from 20–40 minutes to under 2 minutes (voice recording + generation)
- **Improved accuracy** through immediate documentation at point of care rather than hours-delayed recall
- **Reduced provider burnout** by eliminating the most time-consuming administrative task in EMS
- **Better hospital handoffs** with structured, complete documentation available before arrival

The combination of MedGemma's medical domain expertise with fully on-device deployment makes KVEC Triage viable for the most demanding EMS environments — exactly where documentation tools are needed most and connectivity is least reliable.

---

*KVEC Triage is open-source and built entirely with publicly available HAI-DEF models. All AI inference runs on-device. No patient data is collected, transmitted, or stored externally.*
