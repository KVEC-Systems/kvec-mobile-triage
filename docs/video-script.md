# KVEC Triage — 3-Minute Demo Video Script

**Target length:** 3:00
**Format:** Screen recording of app on device + voiceover

---

## Opening (0:00–0:15)

**[Show app icon / splash screen]**

> "KVEC Triage is a mobile app that uses MedGemma to solve one of the biggest problems in emergency medicine — documentation. Every EMS call requires a Patient Care Report, and paramedics spend 20 to 40 minutes writing each one, usually hours after the call from memory. KVEC Triage lets them speak their notes at the point of care and get a complete, structured report in seconds — entirely on-device, entirely offline."

## Demo 1: PCR Generation (0:15–1:15)

**[Show the PCR Recorder screen — the main screen]**

> "Here's how it works. The provider taps record and speaks their patient notes, just like they would during a radio report to the hospital."

**[Tap record, speak a sample patient scenario — e.g. chest pain STEMI case. Tap stop.]**

> "The audio is transcribed on-device by Voxtral Mini 4B — no cloud, no API calls. The transcript appears here."

**[Show transcript appearing. Tap "Generate PCR".]**

> "Now MedGemma takes that transcript and generates a structured Patient Care Report in real time. You can see the sections streaming in — Chief Complaint, HPI, Vitals, Physical Exam, Assessment, Interventions, and Disposition. These follow NHTSA and NEMSIS documentation standards. MedGemma uses correct EMS abbreviations, organizes findings into the right sections, and never fabricates information that wasn't in the original notes."

**[Let the PCR finish generating. Scroll through it briefly.]**

> "That entire report generated in about 20 seconds. What would normally take 30 minutes of typing is done before the provider even arrives at the hospital."

## Demo 2: Triage Assessment (1:15–1:50)

**[Tap the "Triage" button on the completed PCR]**

> "But KVEC Triage goes beyond documentation. Once the PCR is generated, the provider can request a clinical decision support assessment. MedGemma analyzes the report and produces an ESI acuity level — that's the standard 1 through 5 emergency severity scale — along with differential diagnoses, recommended interventions, and a transport priority with facility type."

**[Show triage assessment streaming in with the amber accent UI]**

> "This acts as a cognitive aid — a second set of eyes that can catch things under pressure. It supports the provider's judgment without replacing it."

## Demo 3: Medical Vision (1:50–2:25)

**[Navigate to Medical Chat screen]**

> "KVEC Triage also includes a multimodal medical chat powered by MedGemma's vision capabilities."

**[Show the vision mode chips: Wound, Medication, Skin, ECG/Monitor]**

> "There are four quick-assess modes for common field scenarios. For example, a provider can photograph a wound and MedGemma will classify it, estimate severity, and suggest field treatment."

**[Select a vision mode, attach a sample image, send. Show response streaming.]**

> "They can also photograph medications for identification, skin conditions for differential suggestions, or ECG strips for rhythm analysis. All of this runs locally through MedGemma's vision projector — no images are ever uploaded anywhere."

## Demo 4: History + Privacy (2:25–2:45)

**[Navigate to Report History screen]**

> "All generated reports are saved locally and searchable. Providers can review past PCRs with their triage assessments, copy them to their ePCR system, or delete them."

**[Show a history card, tap into detail view, show triage badge]**

> "And critically — everything stays on the phone. There are no cloud calls, no analytics, no data transmission of any kind. Patient data never leaves the device. This is HIPAA compliance by architecture, not by policy."

## Closing (2:45–3:00)

**[Return to main screen or show a title card]**

> "KVEC Triage turns MedGemma into a field-ready clinical tool — generating structured documentation, providing decision support, and analyzing medical images, all running on a phone with no internet required. For the 40 million EMS transports that happen every year in the US, this could save thousands of hours of documentation time and improve the quality of every patient handoff. Thank you."

---

## Production Notes

- Record on a physical iPhone (not simulator) to demonstrate real on-device performance
- Use realistic but fictional patient scenarios — no real patient data
- Keep screen recording steady, use zoom-in edits for small text if needed
- Consider a brief title card at the start: "KVEC Triage — MedGemma Impact Challenge"
- Aim for natural pacing — it's OK to be slightly under 3:00
