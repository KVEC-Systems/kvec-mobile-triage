# KVEC Triage — Evaluation

## Methodology

We evaluate KVEC Triage across three dimensions: PCR generation quality, triage assessment accuracy, and on-device performance.

### PCR Generation Quality

**Criteria:**
- Structural completeness: Are all required sections present (Chief Complaint, HPI, Vitals, Physical Exam, Assessment, Interventions, Disposition)?
- Medical terminology: Correct use of standard EMS abbreviations
- Fidelity: No hallucinated information beyond what's in the transcript
- Conciseness: Appropriate level of detail for ePCR documentation

### Triage Assessment Accuracy

**Criteria:**
- ESI acuity level: Appropriate for the clinical presentation
- Differential diagnoses: Clinically reasonable given the available information
- Intervention recommendations: Evidence-based and appropriate for EMS scope
- Transport priority: Matches acuity and available resources

### On-Device Performance

Measured on iPhone 15 Pro (A17 Pro, 8GB RAM):

| Metric | Value |
|--------|-------|
| Model load time | ~8-12s (MedGemma 4B Q4_K_M) |
| PCR generation | ~15-30s for typical report |
| Triage assessment | ~10-20s |
| Memory usage | ~3.5 GB during inference |
| Token throughput | ~15-25 tokens/sec |

## Sample PCR Outputs

### Example 1: Chest Pain Call

**Input (verbal notes):**
> 55 year old male complaining of chest pain started about 30 minutes ago while mowing the lawn. Pain is substernal, radiating to the left arm. Patient is diaphoretic and appears anxious. History of hypertension and high cholesterol. Takes lisinopril and atorvastatin. Blood pressure 168 over 94, heart rate 96, respiratory rate 20, SpO2 97 percent on room air. 12-lead shows ST elevation in leads V1 through V4. Administered 324 aspirin, started IV normal saline, nitroglycerin 0.4 sublingual times one with partial relief. Transporting code 3 to Regional Medical Center cardiac cath lab.

**Expected PCR sections:** Chief Complaint (chest pain), HPI (details of onset/quality/radiation), Vitals (BP 168/94, HR 96, RR 20, SpO2 97%), Physical Exam (diaphoretic, anxious, 12-lead findings), Assessment (STEMI), Interventions (ASA, IV NS, NTG), Disposition (code 3 to cath lab).

### Example 2: Motor Vehicle Collision

**Input (verbal notes):**
> Responded to a two car MVC on highway 101. Patient is a 28 year old female restrained driver. Airbags deployed. Complaining of neck pain and right knee pain. GCS 15, alert and oriented times 4. Cervical spine immobilized. Tenderness to palpation at C5 C6 midline. Right knee swollen with limited ROM. No loss of consciousness. Vitals stable BP 122 over 78, heart rate 88, respiratory rate 16, SpO2 99 percent. Applied knee splint and maintained c-spine precautions. Transport to Community Hospital ED.

**Expected PCR sections:** Chief Complaint (MVC with neck and knee pain), HPI (mechanism, restraint, airbags), Vitals (BP 122/78, HR 88, RR 16, SpO2 99%), Physical Exam (c-spine tenderness, knee findings, GCS 15, neuro intact), Assessment (possible c-spine injury, knee contusion/sprain), Interventions (c-spine immobilization, knee splint), Disposition (Community Hospital ED).

### Example 3: Pediatric Respiratory Distress

**Input (verbal notes):**
> 4 year old male in respiratory distress. Mom says he's had a cold for 3 days and started wheezing tonight. History of asthma. Using accessory muscles, intercostal retractions noted. Bilateral expiratory wheezes on auscultation. SpO2 91 on room air. Heart rate 132, respiratory rate 36. Administered albuterol 2.5 mg via nebulizer with improvement to SpO2 95. Placed on 2 liters nasal cannula. Still has mild wheezing but work of breathing improved. Transporting to Children's Hospital.

**Expected PCR sections:** Chief Complaint (respiratory distress), HPI (3 day URI, acute wheezing, asthma hx), Vitals (HR 132, RR 36, SpO2 91%), Physical Exam (accessory muscle use, retractions, bilateral wheezing), Assessment (asthma exacerbation), Interventions (albuterol neb, O2 2L NC), Disposition (Children's Hospital).

## Edge AI Advantages

- **Zero-latency access**: No network dependency in field conditions
- **HIPAA compliance**: Patient data never transmitted — all processing on-device
- **Reliable in austere environments**: Works in rural areas, disaster zones, underground
- **Battery efficient**: GPU-accelerated inference with Metal on iOS
