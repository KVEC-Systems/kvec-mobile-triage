# KVEC Triage — Competition Improvements Design

**Date:** 2026-02-19
**Competition:** [MedGemma Impact Challenge](https://www.kaggle.com/competitions/med-gemma-impact-challenge)
**Deadline:** 2026-02-24
**Approach:** Feature-First (shippable increments per day)

## Context

KVEC Triage is an offline-first EMS triage app running MedGemma + Voxtral on-device. The competition judges on 5 criteria: effective HAI-DEF model use, problem importance, real-world impact, technical feasibility, and execution/communication quality. There is a special prize for Edge AI deployment.

### Constraints
- MedASR has a bug preventing speech recognition — staying with Voxtral for ASR
- MedGemma 1.5 uses excessive reasoning tokens — staying with MedGemma 4B Q4_K_M
- 5 days to deadline

## Changes

### 1. Medical Prompt Improvements

**PCR System Prompt** — `lib/llm.ts` → `generatePCR()`

Replace the generic prompt with an EMS-specific structured prompt specifying:
- Required sections: Chief Complaint, HPI, Vitals, Physical Exam, Assessment/Impression, Interventions, Disposition
- NHTSA/NEMSIS terminology conventions
- Concise clinical abbreviations (pt, hx, dx, tx, etc.)
- Clearly delimited output sections

**Inline Triage Assessment** — `lib/llm.ts` new function + `app/index.tsx`

After PCR generation, add a "Triage Assessment" button that sends the PCR to MedGemma with a CDS prompt requesting:
- Acuity level (ESI 1-5)
- Top 3 differential diagnoses
- Recommended interventions
- Transport priority

Appears as a collapsible section below the PCR, reusing the existing streaming UI pattern.

**Chat System Prompt** — `lib/llm.ts` → chat flow

- Medical safety guardrails ("For emergencies, call 911")
- Scope statement ("clinical reasoning aid, not a diagnostic tool")
- Structured response encouragement (differential format)

### 2. PCR History Screen

**New: `app/history.tsx`**
- FlatList of saved PCRs showing: timestamp, chief complaint excerpt, acuity badge
- Tap to view full PCR + triage assessment
- AsyncStorage-based persistence
- Share/copy button on detail view

**New: `lib/storage.ts`**
- `savePCR(pcr, triageAssessment, clinicalNotes)` → saves to AsyncStorage
- `loadPCRHistory()` → returns sorted list
- `deletePCR(id)` → remove single entry

**Modify: `app/index.tsx`**
- Auto-save PCR after generation completes
- Navigation to history

**Modify: `components/HamburgerMenu.tsx`**
- Add History route

### 3. Medical Vision Workflows

**Modify: `app/chat.tsx`**
- Add quick-assess buttons above input: "Wound Assessment", "Medication ID", "Skin Condition", "ECG/Monitor"
- Each pre-fills a medical context prompt before image picker
- Example: "Wound Assessment" → system context for wound severity, size estimation, type classification

Lightweight implementation — pre-crafted prompts paired with existing image picker flow.

### 4. Docs & Cleanup

- Rewrite README.md to match actual app functionality
- Remove dead `lib/audio.ts`
- Reconcile `settings.tsx` model list with `download.ts` (remove MedASR references)
- Fix `app.json` userInterfaceStyle to "dark"

### 5. Evaluation Benchmarks

**New: `evaluation/README.md`**
- Evaluation methodology
- 3-5 sample PCR outputs (input clinical notes → generated PCR)
- Qualitative assessment: structured fields, medical terminology accuracy
- On-device performance metrics: inference latency, memory usage, model load time

## Sequencing

| Day | Work | Files |
|-----|------|-------|
| 1 | Prompts + inline triage | `lib/llm.ts`, `app/index.tsx` |
| 2 | PCR history screen | `app/history.tsx`, `lib/storage.ts`, `app/index.tsx`, `components/HamburgerMenu.tsx` |
| 3 | Medical vision workflows | `app/chat.tsx` |
| 4 | Docs cleanup | `README.md`, `lib/audio.ts`, `settings.tsx`, `app.json` |
| 5 | Evaluation + submission prep | `evaluation/README.md`, video, writeup |
