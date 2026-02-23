# KVEC Triage — Demo Flow

## Sample Clinical Notes

Paste this into the Clinical Notes screen:

```
65 y/o male, chest pain x 2 hrs, substernal pressure radiating to left arm, diaphoretic, hx HTN and diabetes, BP 168/94, HR 92, SpO2 96% RA, 12-lead shows ST elevation V1-V4, administered ASA 324mg, nitro 0.4mg SL with some relief, IV established 18g left AC, transporting emergent to St. Mary's cardiac cath lab, patient alert and oriented x4
```

---

## Step-by-Step Flow

### 1. Download Screen (first launch only)
- App opens to download screen
- Tap **Download** to fetch MedGemma (~2.49GB)
- Wait for download to complete, then auto-navigates to main screen

### 2. Clinical Notes Screen
- Paste or type the sample clinical notes above
- Tap **Generate PCR**

### 3. PCR Output Screen
- Watch MedGemma stream a structured Patient Care Report
- Should produce 7 sections: Chief Complaint, HPI, Vitals, Physical Exam, Assessment, Interventions, Disposition
- Wait for generation to finish (~15-30 seconds)

### 4. Triage Assessment
- Tap the **Triage** button (amber)
- Watch the triage assessment stream below the PCR
- Expected output:
  - **ACUITY:** ESI 1 — active STEMI
  - **DIFFERENTIAL DX:** STEMI, unstable angina, aortic dissection (with reasoning)
  - **RECOMMENDED INTERVENTIONS:** continuous monitoring, cath lab activation, consider heparin
  - **TRANSPORT PRIORITY:** Emergent — cardiac cath lab

### 5. Copy & New
- Tap **Copy** to copy PCR to clipboard
- Tap **New** to start a fresh report

### 6. Medical Chat — Text Query (via hamburger menu)
- Tap the **hamburger menu** (☰) in the top-left corner
- Select **Medical Chat**
- Wait for "Loading model..." to finish (reloads LLM with vision projector)
- Type a medical question, e.g.:

```
What are the contraindications for administering TPA in a suspected stroke patient?
```

- Tap the **send** button
- Watch MedGemma stream a structured medical response

### 7. Medical Chat — Vision Assessment
- Tap the **image button** (📷) next to the text input
- Choose **Photo Library** (or **Camera** to take a live photo)
- Select a sample medical image (see "Sample Images" section below)
- The image appears as a preview above the input bar
- Optionally type additional context, e.g.: `"What do you see?"`
- Tap **send**
- Watch MedGemma analyze the image and stream its assessment

### 7b. Quick-Assess Vision Modes (alternative to step 7)
- On a fresh chat (no messages yet), four quick-assess chips appear above the input:
  - **Wound** — wound classification, severity, field treatment
  - **Medication** — pill/bottle identification, dosage, safety info
  - **Skin** — skin condition differential, severity assessment
  - **ECG/Monitor** — rhythm analysis, vital sign interpretation
- Tap one of the chips (e.g., **Wound**)
- A prompt appears to take or select a photo
- Choose your image — the specialized prompt is auto-filled
- Tap **send** to get a targeted assessment

> **Note:** Vision features require the mmproj file (~945MB) to be downloaded. If mmproj is not available, the image button will be grayed out and text-only chat still works.

---

## Sample Images for Medical Chat

You can save these to your iPhone's photo library for use during the demo:

| Mode | What to use | Where to find |
|------|-------------|---------------|
| **Wound** | Photo of a laceration, abrasion, or burn | Search Google Images for "laceration wound clinical" or use a first-aid training photo |
| **Medication** | Photo of a pill bottle or blister pack | Photograph any OTC medication (ibuprofen, acetaminophen, etc.) |
| **Skin** | Photo of a rash or skin lesion | Search "dermatology clinical photo rash" or use a dermatology atlas image |
| **ECG/Monitor** | Photo of a 12-lead ECG strip or monitor screen | Search "12 lead ECG STEMI" — many free educational ECG images are available from sites like [Life in the Fast Lane (LITFL)](https://litfl.com/ecg-library/) |

**Easiest option for the demo:** Take a photo of a common OTC medication bottle (like Tylenol or Advil) and use the **Medication** quick-assess mode. This requires no preparation and gives a clear, verifiable result.

---

## Alternative Scenarios

### Trauma Case
```
32 y/o female, MVC rollover, unrestrained driver, +LOC approximately 2 min, c-spine precautions initiated, GCS 14 E4V4M6, complaining of neck pain and left-sided chest pain, tender left ribs 5-8, decreased breath sounds left base, BP 102/68, HR 110, RR 24, SpO2 92% RA, 2 large bore IVs bilateral AC, 1L NS bolus initiated, placed on 15L NRB improving to SpO2 97%, immobilized on long board, transporting emergent to Regional Level 1 Trauma Center
```

### Pediatric Respiratory
```
4 y/o male, respiratory distress x 3 hrs, mom reports URI symptoms x 2 days with worsening wheeze tonight, hx asthma with 2 prior ED visits, audible wheeze bilateral, intercostal retractions, nasal flaring, RR 36, HR 128, SpO2 89% RA, temp 101.2F, administered albuterol 2.5mg nebulizer with improvement to SpO2 94%, placed on 2L NC, IV access deferred per protocol, transporting to Children's Hospital ED, mom accompanying
```

### Geriatric Fall
```
82 y/o female, ground level fall at home, found by daughter on kitchen floor, unclear how long down, complaining of right hip pain unable to bear weight, right leg shortened and externally rotated, hx afib on warfarin and osteoporosis, BP 148/82, HR 88 irregularly irregular, RR 18, SpO2 95% RA, GCS 15, oriented x4, no head strike per patient, splinted right leg in position of comfort, IV 20g right hand, pain management with fentanyl 50mcg IV with relief from 8/10 to 4/10, transporting to University Hospital ED
```
