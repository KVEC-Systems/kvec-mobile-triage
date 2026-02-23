# KVEC Triage — Technical Overview

## Project name

**KVEC Triage** — On-Device MedGemma for EMS Patient Care Report Generation and Clinical Decision Support

## Your team

| Name | Specialty | Role |
|------|-----------|------|
| Eugene Kim | Software Engineering, Mobile Development | Sole developer — architecture, native module development, prompt engineering, UI/UX design, evaluation |

## Problem statement

**Domain: Emergency Medical Services (EMS) Documentation**

Emergency Medical Services providers — paramedics and EMTs — face a critical documentation burden that directly impacts patient outcomes. After every patient encounter, providers must complete a Patient Care Report (PCR), a structured medical document required by NHTSA/NEMSIS standards. A PCR covers seven sections: chief complaint, history of present illness, vitals, physical exam, clinical assessment, interventions, and disposition. In practice, providers spend 20–40 minutes writing each report, often completing documentation hours after the call from memory alone.

This documentation crisis has cascading consequences across the healthcare system:

- **Patient safety:** Delayed documentation introduces recall bias and omissions. Critical clinical details — medication dosages, time-sensitive interventions, subtle exam findings — are lost between the scene and the keyboard. Hospital receiving teams make handoff decisions based on incomplete information.

- **Provider burnout:** Documentation is consistently cited as the top administrative burden in EMS. High-volume systems (10+ calls per shift) create backlogs that force providers to document on personal time. The National EMS Management Association reports documentation burden as a leading contributor to workforce attrition in an industry already facing staffing shortages.

- **System-wide costs:** Incomplete PCRs lead to rejected insurance claims, failed quality audits, and legal exposure. The American Ambulance Association estimates that documentation deficiencies cost the U.S. EMS industry hundreds of millions annually in denied reimbursements alone.

- **Connectivity gap:** Rural and austere environments — where EMS providers operate most independently — have the least reliable network access. Cloud-based documentation tools fail precisely where they are needed most: disaster zones, rural highways, underground structures, and mass casualty incidents where cellular networks are congested or destroyed. HIPAA compliance further discourages transmitting identifiable patient data over public networks.

**Impact potential:** There are approximately 40 million EMS transports per year in the United States, each requiring a PCR. KVEC Triage reduces documentation time from 20–40 minutes to under 2 minutes by enabling providers to enter brief clinical notes at the point of care and receive a complete, structured PCR within seconds. This has direct, measurable impact on documentation accuracy (immediate capture vs. hours-delayed recall), provider availability (eliminating the largest administrative time sink), hospital handoff quality (structured reports available before arrival), and billing accuracy (complete documentation at the source). Because the app runs entirely on-device with zero data transmission, it is deployable in the most connectivity-constrained and privacy-sensitive environments in healthcare — exactly where the need is greatest.

## Overall solution

**MedGemma as the core clinical intelligence across three integrated capabilities:**

KVEC Triage uses MedGemma 4B (Q4_K_M quantization), a Health AI Developer Foundations (HAI-DEF) model from Google, as the sole AI backbone for all clinical features. MedGemma's medical domain pre-training makes it uniquely suited for this application — it understands clinical terminology, EMS abbreviations, anatomical descriptions, and diagnostic reasoning in ways that general-purpose models do not. We leverage MedGemma in three distinct roles within a single mobile application:

**1. Structured PCR Generation (Text)**

The provider enters clinical notes directly into the app — written as they would speak during a hospital radio report or jotted down at the point of care. These notes are passed to MedGemma with a carefully engineered system prompt that instructs it to produce a structured PCR following NHTSA/NEMSIS standards. The prompt specifies seven required sections (Chief Complaint, HPI, Vitals, Physical Exam, Assessment, Interventions, Disposition), enforces standard EMS abbreviations (pt, y/o, hx, dx, BP, HR, RR, SpO2, GCS), and explicitly prohibits fabricating clinical findings not present in the source notes. MedGemma's medical training allows it to correctly infer section boundaries from unstructured input — for example, placing "12-lead shows ST elevation in V1–V4" under Physical Exam while deriving "STEMI" as the Assessment, or distinguishing interventions performed ("administered 324mg ASA") from objective findings ("diaphoretic, anxious appearance"). Tokens stream to the UI in real-time, giving providers immediate visual feedback as the report generates.

**2. Clinical Decision Support — Triage Assessment (Reasoning)**

After PCR generation, providers can request an AI-assisted triage assessment. MedGemma performs a second-pass analysis of the completed PCR and produces four structured outputs: an ESI (Emergency Severity Index) acuity level from 1–5 with clinical justification, the top 3 differential diagnoses with reasoning for each, recommended additional interventions or assessments to consider, and a transport priority recommendation (emergent/urgent/non-urgent) with suggested facility type (trauma center, stroke center, cardiac cath lab, nearest ED). This leverages MedGemma's medical reasoning capabilities to surface clinical insights that support — but never replace — the provider's judgment. The assessment includes appropriate disclaimers and is designed as a cognitive aid, not an autonomous decision-maker.

**3. Multimodal Medical Vision (Image + Text)**

KVEC Triage provides a conversational medical AI assistant with multimodal vision support via MedGemma's mmproj-F16 vision projector (~945MB). Four specialized quick-assess modes target common field scenarios where visual assessment adds clinical value:

- **Wound Assessment** — Photograph wounds for classification (laceration, abrasion, burn, puncture), depth/severity estimation, contamination assessment, and field treatment recommendations
- **Medication Identification** — Photograph pills, bottles, or packaging for identification, common indications, standard dosing, and drug interaction alerts relevant to field care
- **Skin Condition Assessment** — Photograph rashes, lesions, or skin findings for pattern recognition, morphology description, and differential suggestions
- **ECG/Monitor Analysis** — Photograph 12-lead ECGs or cardiac monitor screens for rhythm identification, interval analysis, and clinical correlation with the patient presentation

Each mode uses a domain-specific system prompt that guides MedGemma's visual analysis toward clinically actionable outputs. All modes include safety disclaimers emphasizing that AI-assisted assessment requires clinical confirmation and does not replace provider judgment.

## Technical details

**Architecture: Fully on-device Edge AI deployment on consumer mobile hardware**

KVEC Triage is a React Native mobile application (Expo SDK 54, React Native 0.81, TypeScript) with New Architecture enabled. The entire AI pipeline — language model inference and vision processing — runs locally on the device with no cloud dependencies after the initial one-time model download (~3.4GB total).

**On-device inference stack:**

| Component | Technology | Size | Purpose |
|-----------|------------|------|---------|
| LLM Runtime | llama.rn (GGUF format) | — | On-device MedGemma inference engine |
| LLM Model | MedGemma 4B Q4_K_M (unsloth) | ~2.49GB | PCR generation, triage reasoning, medical chat |
| Vision Projector | mmproj-F16.gguf | ~945MB | Multimodal image understanding for medical vision |

**Performance on iPhone 15 Pro (A17 Pro, 8GB RAM):**

| Metric | Value |
|--------|-------|
| MedGemma cold start | ~8–12 seconds |
| PCR generation (typical report) | ~15–30 seconds |
| Triage assessment | ~10–20 seconds |
| Token throughput | ~15–25 tokens/sec |
| Runtime memory footprint | ~2.5 GB |

MedGemma runs with all 99 layers offloaded to GPU via Apple Metal on physical devices, with a 2048-token context window, 512-token batch size, and temperature 0.3 for deterministic clinical output. On simulator builds, GPU offloading is automatically disabled (0 layers) for compatibility, detected at runtime via `expo-device`. The Q4_K_M quantization was selected after testing multiple quantization levels — it provides the best balance of medical terminology accuracy, reasoning quality, and inference speed while fitting within the memory budget of modern smartphones (8GB+ RAM).

**Key engineering decisions for feasibility:**

- **On-demand model loading with vision reinit:** MedGemma is loaded into memory only when the first inference is requested, rather than at app launch. This keeps the app responsive during startup and avoids holding ~2.5GB of GPU memory when the user is still entering notes. The LLM context is managed as a singleton and shared across PCR generation, triage assessment, and medical chat. When the user navigates from text-only features (PCR generation) to multimodal features (medical chat with images), the LLM context is automatically released and reinitialized with the correct configuration — multimodal inference requires `ctx_shift: false`, which is incompatible with the text-only configuration. This reinit is transparent to the user.

- **Streaming UI:** Tokens stream to the interface in real-time via callbacks, so providers see the PCR building progressively rather than waiting for full generation. This provides immediate feedback and allows early assessment of output quality.

- **Prompt engineering for safety:** System prompts explicitly instruct MedGemma to never fabricate clinical findings, to mark undocumented vitals as "Not documented" rather than hallucinating values, and to include disclaimers on all triage and vision outputs. The triage prompt enforces structured output sections to prevent free-form responses that might be misinterpreted.

- **Local persistence:** Generated PCRs are automatically saved to AsyncStorage with their associated triage assessments, capped at 100 entries. Medical chat conversations are also persisted automatically after each assistant response, with chat history capped at 50 entries. Providers can review, copy, and manage their report and chat history entirely offline.

- **Privacy by architecture:** No network calls are made after model download. No analytics, no telemetry, no cloud APIs. Patient data exists only in local device storage under the provider's control. This is the strongest possible HIPAA compliance posture — there is no data to breach because no data is transmitted.

**PCR quality evaluation:**

We evaluated PCR generation across representative EMS scenarios — STEMI with field interventions, motor vehicle collision trauma with c-spine precautions, and pediatric respiratory distress with nebulizer treatment — against four criteria:

1. **Structural completeness** — All seven required PCR sections consistently present in output
2. **Medical terminology** — Correct use of standard EMS abbreviations throughout
3. **Fidelity** — No hallucinated clinical findings beyond what appears in the source transcript
4. **Conciseness** — Appropriate detail level matching ePCR documentation standards

MedGemma reliably transforms disjointed clinical notes into properly sectioned, clinically coherent PCRs. The model's medical domain training is evident in its ability to correctly categorize findings across sections, use appropriate clinical terminology, and distinguish subjective assessment from objective findings — capabilities that general-purpose language models consistently struggle with in EMS documentation contexts.

**Deployment readiness:** The app is built with Expo Application Services (EAS) for production iOS and Android builds. The one-time model download (~3.4GB) occurs on first launch over WiFi, after which the app functions indefinitely without internet connectivity. The download manager supports resume on interruption and validates file integrity by size before marking models as ready.

---

*Built entirely with publicly available HAI-DEF models. All AI inference runs on-device. No patient data is collected, transmitted, or stored externally.*
