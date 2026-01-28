# Clinical Evaluation Report

## Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 45 |
| Correct Predictions | 21 |
| **Overall Accuracy** | **47.0%** |
| Average Confidence | 67.0% |
| Average Inference Time | 0.02ms |

## Per-Specialty Performance

| Specialty | Total | Correct | Precision | Recall | F1 Score |
|-----------|-------|---------|-----------|--------|----------|
| Women's Health | 3 | 3 | 100% | 100% | 1.00 |
| Gastroenterology | 3 | 3 | 75% | 100% | 0.86 |
| Behavioral Health | 3 | 2 | 100% | 67% | 0.80 |
| Dermatology | 4 | 2 | 67% | 50% | 0.57 |
| Pulmonology | 3 | 2 | 50% | 67% | 0.57 |
| Urology | 3 | 1 | 100% | 33% | 0.50 |
| Neurology | 5 | 2 | 67% | 40% | 0.50 |
| Orthopedic Surgery | 3 | 2 | 33% | 67% | 0.44 |
| Cardiology | 3 | 1 | 50% | 33% | 0.40 |
| Primary Care | 4 | 3 | 18% | 75% | 0.29 |
| Rheumatology | 3 | 0 | 0% | 0% | 0.00 |
| Pain Management | 2 | 0 | 0% | 0% | 0.00 |
| Oncology | 2 | 0 | 0% | 0% | 0.00 |
| Sports Medicine | 2 | 0 | 0% | 0% | 0.00 |
| Vascular Medicine | 2 | 0 | 0% | 0% | 0.00 |

## Misclassifications

| Symptom | Expected | Predicted |
|---------|----------|-----------|
| blood in my urine and lower back pain | Urology | Orthopedic Surgery |
| difficulty starting to urinate, weak stream, ge... | Urology | Primary Care |
| chest pain that gets worse with exertion, short... | Cardiology | Gastroenterology |
| swollen ankles and legs, difficulty breathing w... | Cardiology | Pulmonology |
| lost interest in activities, feeling hopeless, ... | Behavioral Health | Primary Care |
| sudden confusion, difficulty speaking, one side... | Neurology | Primary Care |
| severe acne, painful cysts on face and back | Dermatology | Primary Care |
| lower back pain radiating to leg, numbness in foot | Orthopedic Surgery | Neurology |
| coughing up blood, unexplained weight loss, che... | Pulmonology | Cardiology |
| joint pain in multiple joints, morning stiffnes... | Rheumatology | Orthopedic Surgery |
| fatigue, joint pain, butterfly rash on face | Rheumatology | Dermatology |
| red swollen big toe, sudden severe pain, can't ... | Rheumatology | Primary Care |
| sore throat, runny nose, mild cough for a few days | Primary Care | Pulmonology |
| chronic pain everywhere, tender points, fibromy... | Pain Management | Primary Care |
| severe back pain for years, tried everything, n... | Pain Management | Orthopedic Surgery |
| unexplained weight loss, night sweats, swollen ... | Oncology | Primary Care |
| lump in breast, nipple discharge, family histor... | Oncology | Primary Care |
| runner's knee pain, pain going down stairs, swe... | Sports Medicine | Orthopedic Surgery |
| tennis elbow, pain on outside of elbow, worse w... | Sports Medicine | Primary Care |
| leg pain when walking, relieved by rest, cold feet | Vascular Medicine | Primary Care |

*...and 4 more misclassifications*

---
*Generated: 2026-01-28T19:59:41.198Z*
*Evaluation Mode: Fallback Triage (keyword-based)*

> Note: This baseline uses the keyword-based fallback. SetFit and LLM will achieve higher accuracy.
