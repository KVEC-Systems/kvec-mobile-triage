#!/usr/bin/env python3
"""
KVEC Triage Clinical Evaluation Script

Evaluates triage accuracy across three inference methods:
1. Fallback (keyword-based) - baseline
2. SetFit (ONNX) - fast classification
3. MedGemma (GGUF LLM) - full inference

Usage:
    pip install llama-cpp-python onnxruntime transformers huggingface_hub pyyaml pandas scikit-learn tqdm
    python evaluate.py
"""

import json
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from huggingface_hub import hf_hub_download
from sklearn.metrics import classification_report
from tqdm import tqdm

# =============================================================================
# Test Cases
# =============================================================================

TEST_CASES = [
    # Urology
    {"symptom": "burning pain when I pee, have to urinate frequently", "expected": "Urology"},
    {"symptom": "blood in my urine and lower back pain", "expected": "Urology"},
    {"symptom": "difficulty starting to urinate, weak stream, getting up multiple times at night", "expected": "Urology"},
    
    # Cardiology
    {"symptom": "chest pain that gets worse with exertion, shortness of breath", "expected": "Cardiology"},
    {"symptom": "heart racing for no reason, palpitations especially at night", "expected": "Cardiology"},
    {"symptom": "swollen ankles and legs, difficulty breathing when lying down", "expected": "Cardiology"},
    
    # Gastroenterology
    {"symptom": "chest pain after eating, burning in my throat, acid taste", "expected": "Gastroenterology"},
    {"symptom": "trouble swallowing, food getting stuck in my throat", "expected": "Gastroenterology"},
    {"symptom": "severe abdominal cramping, blood in stool, diarrhea for weeks", "expected": "Gastroenterology"},
    
    # Behavioral Health
    {"symptom": "feeling anxious and can't sleep, constant worry", "expected": "Behavioral Health"},
    {"symptom": "lost interest in activities, feeling hopeless, no energy", "expected": "Behavioral Health"},
    {"symptom": "panic attacks, racing heart, feeling like I'm going to die", "expected": "Behavioral Health"},
    
    # Neurology
    {"symptom": "severe headaches with visual aura, sensitivity to light", "expected": "Neurology"},
    {"symptom": "numbness and tingling in hands and feet, weakness", "expected": "Neurology"},
    {"symptom": "sudden confusion, difficulty speaking, one side weakness", "expected": "Neurology"},
    
    # Dermatology
    {"symptom": "itchy red rash on arms that spreads, dry flaky skin", "expected": "Dermatology"},
    {"symptom": "changing mole, irregular borders, getting darker", "expected": "Dermatology"},
    {"symptom": "severe acne, painful cysts on face and back", "expected": "Dermatology"},
    
    # Orthopedic Surgery
    {"symptom": "lower back pain radiating to leg, numbness in foot", "expected": "Orthopedic Surgery"},
    {"symptom": "knee swelling after injury, can't bear weight", "expected": "Orthopedic Surgery"},
    {"symptom": "shoulder pain, can't raise arm above head, grinding noise", "expected": "Orthopedic Surgery"},
    
    # Pulmonology
    {"symptom": "chronic cough, wheezing, difficulty breathing especially at night", "expected": "Pulmonology"},
    {"symptom": "shortness of breath getting worse, persistent cough with mucus", "expected": "Pulmonology"},
    {"symptom": "coughing up blood, unexplained weight loss, chest pain", "expected": "Pulmonology"},
    
    # Rheumatology
    {"symptom": "joint pain in multiple joints, morning stiffness lasting hours", "expected": "Rheumatology"},
    {"symptom": "fatigue, joint pain, butterfly rash on face", "expected": "Rheumatology"},
    {"symptom": "red swollen big toe, sudden severe pain, can't touch it", "expected": "Rheumatology"},
    
    # Women's Health
    {"symptom": "irregular periods, severe cramping, heavy bleeding", "expected": "Women's Health"},
    {"symptom": "pelvic pain, pain during intercourse, difficulty getting pregnant", "expected": "Women's Health"},
    {"symptom": "hot flashes, night sweats, mood changes, missed periods", "expected": "Women's Health"},
    
    # Primary Care
    {"symptom": "fatigue, always tired, no energy even with sleep", "expected": "Primary Care"},
    {"symptom": "always thirsty, urinating frequently, unexplained weight loss", "expected": "Primary Care"},
    {"symptom": "sore throat, runny nose, mild cough for a few days", "expected": "Primary Care"},
    
    # Pain Management
    {"symptom": "chronic pain everywhere, tender points, fibromyalgia diagnosed", "expected": "Pain Management"},
    {"symptom": "severe back pain for years, tried everything, need pain relief", "expected": "Pain Management"},
    
    # Oncology
    {"symptom": "unexplained weight loss, night sweats, swollen lymph nodes", "expected": "Oncology"},
    {"symptom": "lump in breast, nipple discharge, family history of cancer", "expected": "Oncology"},
    
    # Sports Medicine
    {"symptom": "runner's knee pain, pain going down stairs, swelling", "expected": "Sports Medicine"},
    {"symptom": "tennis elbow, pain on outside of elbow, worse with gripping", "expected": "Sports Medicine"},
    
    # Vascular Medicine
    {"symptom": "leg pain when walking, relieved by rest, cold feet", "expected": "Vascular Medicine"},
    {"symptom": "swollen leg, red and warm, pain in calf", "expected": "Vascular Medicine"},
    
    # Edge cases
    {"symptom": "seeing floaters and flashing lights in vision", "expected": "Neurology"},
    {"symptom": "ear ringing constant, hearing loss, dizziness", "expected": "Primary Care"},
    {"symptom": "hair falling out in patches, brittle nails", "expected": "Dermatology"},
    {"symptom": "difficulty concentrating, memory problems, brain fog", "expected": "Neurology"},
]

SPECIALTIES = [
    'Behavioral Health', 'Cardiology', 'Dermatology', 'Gastroenterology',
    'Neurology', 'Oncology', 'Orthopedic Surgery', 'Pain Management',
    'Primary Care', 'Pulmonology', 'Rheumatology', 'Sports Medicine',
    'Urology', 'Vascular Medicine', "Women's Health"
]

# =============================================================================
# Fallback Triage (Keyword-based)
# =============================================================================

def run_fallback_triage(symptom: str) -> dict:
    """Keyword-based fallback triage"""
    s = symptom.lower()
    
    if 'burn' in s and ('pee' in s or 'urin' in s):
        return {"specialty": "Urology", "confidence": 0.85}
    if 'chest' in s and ('eat' in s or 'food' in s or 'meal' in s):
        return {"specialty": "Gastroenterology", "confidence": 0.82}
    if any(w in s for w in ['sad', 'depress', 'anxious', 'panic']):
        return {"specialty": "Behavioral Health", "confidence": 0.80}
    if any(w in s for w in ['mole', 'rash', 'skin', 'itch', 'acne']):
        return {"specialty": "Dermatology", "confidence": 0.78}
    if any(w in s for w in ['heart', 'chest pain', 'palpitation']):
        return {"specialty": "Cardiology", "confidence": 0.75}
    if any(w in s for w in ['headache', 'migraine', 'numbness', 'tingling', 'confusion']):
        return {"specialty": "Neurology", "confidence": 0.75}
    if any(w in s for w in ['back pain', 'knee', 'shoulder', 'joint']):
        return {"specialty": "Orthopedic Surgery", "confidence": 0.75}
    if any(w in s for w in ['breath', 'cough', 'wheez']):
        return {"specialty": "Pulmonology", "confidence": 0.75}
    if any(w in s for w in ['period', 'menstrua', 'pelvic', 'hot flash']):
        return {"specialty": "Women's Health", "confidence": 0.75}
    if any(w in s for w in ['swallow', 'stomach', 'diarrhea', 'abdominal', 'stool']):
        return {"specialty": "Gastroenterology", "confidence": 0.75}
    
    return {"specialty": "Primary Care", "confidence": 0.50}

# =============================================================================
# SetFit Classifier
# =============================================================================

class SetFitClassifier:
    def __init__(self):
        self.session = None
        self.head = None
        self.labels = None
        self.tokenizer = None
        
    def load(self):
        import onnxruntime as ort
        from transformers import AutoTokenizer
        
        print("Downloading SetFit models...")
        body_path = hf_hub_download("ekim1394/setfit-specialty-onnx", "body/model.onnx")
        head_path = hf_hub_download("ekim1394/setfit-specialty-onnx", "model_head.onnx")
        labels_path = hf_hub_download("ekim1394/setfit-specialty-onnx", "label_mapping.json")
        
        print("Loading ONNX sessions...")
        self.session = ort.InferenceSession(body_path)
        self.head = ort.InferenceSession(head_path)
        
        with open(labels_path) as f:
            label_data = json.load(f)
            # The label_mapping.json has nested structure with id2label
            self.labels = label_data.get("id2label", label_data)
            
        # Map SetFit specialty names to our expected specialty names
        self.name_mapping = {
            "Heart and Vascular": "Cardiology",
            "Orthopedics": "Orthopedic Surgery",
            "Gynecology": "Women's Health",
            "Neurosurgery": "Neurology",
            "Rheumatology Immunology and Allergy": "Rheumatology",
            "Diabetes and Endocrinology": "Primary Care",
            "Ear Nose and Throat Otolaryngology": "Primary Care",
            "Audiology": "Primary Care",
            "Bariatrics": "Primary Care",
            "Neonatology": "Primary Care",
            "Ophthalmology": "Primary Care",
            "Sleep Center": "Primary Care",
            "Wound Care": "Primary Care",
        }
            
        self.tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
        print(f"SetFit loaded! (labels: {list(self.labels.values())[:5]}...)")
        
    def classify(self, symptom: str) -> dict:
        start = time.time()
        
        inputs = self.tokenizer(symptom, padding="max_length", truncation=True, max_length=128, return_tensors="np")
        
        # Run body model
        outputs = self.session.run(None, {
            "input_ids": inputs["input_ids"].astype(np.int64),
            "attention_mask": inputs["attention_mask"].astype(np.int64),
            "token_type_ids": np.zeros_like(inputs["input_ids"]).astype(np.int64)
        })
        
        # Mean pooling - last_hidden_state is [batch, seq, hidden]
        hidden = outputs[0]  # [1, 128, 384]
        mask = inputs["attention_mask"].astype(np.float32)  # [1, 128]
        mask_expanded = np.expand_dims(mask, -1)  # [1, 128, 1]
        sum_hidden = np.sum(hidden * mask_expanded, axis=1)  # [1, 384]
        sum_mask = np.sum(mask, axis=1, keepdims=True)  # [1, 1]
        embeddings = sum_hidden / np.maximum(sum_mask, 1e-9)  # [1, 384]
        
        # Run head - returns [predicted_class, probabilities]
        head_output = self.head.run(None, {"embedding": embeddings.astype(np.float32)})
        predicted_class = int(head_output[0][0])  # First output is class index
        probabilities = head_output[1][0]  # Second output is probabilities
        confidence = float(probabilities[predicted_class]) if predicted_class < len(probabilities) else 0.9
        
        return {
            "specialty": self._map_specialty(self.labels.get(str(predicted_class), "Primary Care")),
            "confidence": confidence,
            "inference_ms": (time.time() - start) * 1000
        }
    
    def _map_specialty(self, name: str) -> str:
        """Map SetFit specialty names to our expected names"""
        return self.name_mapping.get(name, name)

# =============================================================================
# MedGemma LLM
# =============================================================================

class MedGemmaClassifier:
    def __init__(self):
        self.llm = None
        
    def load(self):
        from llama_cpp import Llama
        
        print("Downloading MedGemma GGUF... (this may take a few minutes)")
        model_path = hf_hub_download(
            "ekim1394/medgemma-4b-iq2_xxs-gguf",
            "medgemma-4b-iq2_xxs.gguf"
        )
        
        print(f"Loading model...")
        self.llm = Llama(
            model_path=model_path,
            n_ctx=256,
            n_batch=256,
            n_threads=8,
            n_gpu_layers=-1,
            verbose=False
        )
        print("MedGemma loaded!")
        
    def _find_specialty(self, text: str) -> str:
        text_lower = text.lower()
        for specialty in SPECIALTIES:
            if specialty.lower() in text_lower:
                return specialty
        # Aliases
        aliases = {
            'mental health': 'Behavioral Health', 'psychiatry': 'Behavioral Health',
            'heart': 'Cardiology', 'cardiac': 'Cardiology',
            'skin': 'Dermatology', 'gi': 'Gastroenterology',
            'neuro': 'Neurology', 'cancer': 'Oncology',
            'ortho': 'Orthopedic Surgery', 'lung': 'Pulmonology',
            'bladder': 'Urology', 'kidney': 'Urology',
            'gynecology': "Women's Health", 'ob/gyn': "Women's Health"
        }
        for alias, spec in aliases.items():
            if alias in text_lower:
                return spec
        return 'Primary Care'
        
    def classify(self, symptom: str) -> dict:
        start = time.time()
        
        # Remove <bos> since llama.cpp adds it automatically
        prompt = f"""<start_of_turn>user
Medical triage for: "{symptom}"
What medical specialty should see this patient? Answer with just the specialty name.
<end_of_turn>
<start_of_turn>model
"""
        
        response = self.llm(prompt, max_tokens=30, temperature=0.1, stop=["</s>", "\n", "<end_of_turn>"])
        text = response["choices"][0]["text"].strip()
        
        return {
            "specialty": self._find_specialty(text),
            "confidence": 0.85,
            "inference_ms": (time.time() - start) * 1000,
            "raw": text
        }

# =============================================================================
# Evaluation
# =============================================================================

def evaluate(classifier_fn, name: str) -> pd.DataFrame:
    results = []
    for tc in tqdm(TEST_CASES, desc=name):
        start = time.time()
        result = classifier_fn(tc["symptom"])
        results.append({
            "symptom": tc["symptom"],
            "expected": tc["expected"],
            "predicted": result["specialty"],
            "confidence": result.get("confidence", 0),
            "inference_ms": result.get("inference_ms", (time.time() - start) * 1000),
            "correct": result["specialty"] == tc["expected"]
        })
    return pd.DataFrame(results)

def print_report(df: pd.DataFrame, name: str):
    acc = df["correct"].mean()
    avg_time = df["inference_ms"].mean()
    
    print(f"\n{'='*60}")
    print(f"{name} Results")
    print(f"{'='*60}")
    print(f"Accuracy: {acc:.1%}")
    print(f"Correct: {df['correct'].sum()}/{len(df)}")
    print(f"Avg Inference: {avg_time:.1f}ms")
    print()
    print(classification_report(df["expected"], df["predicted"], zero_division=0))

def save_results(results: dict, output_path: str):
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {output_path}")

# =============================================================================
# Main
# =============================================================================

def main():
    print("="*60)
    print("KVEC Triage Clinical Evaluation")
    print("="*60)
    print(f"Test cases: {len(TEST_CASES)}")
    print(f"Specialties: {len(SPECIALTIES)}")
    
    results = {"test_cases": len(TEST_CASES)}
    
    # 1. Fallback evaluation
    print("\n[1/3] Evaluating Fallback (keyword-based)...")
    fallback_df = evaluate(run_fallback_triage, "Fallback")
    print_report(fallback_df, "Fallback")
    results["fallback"] = {
        "accuracy": float(fallback_df["correct"].mean()),
        "avg_inference_ms": float(fallback_df["inference_ms"].mean())
    }
    
    # 2. SetFit evaluation
    print("\n[2/3] Evaluating SetFit (ONNX)...")
    try:
        setfit = SetFitClassifier()
        setfit.load()
        setfit_df = evaluate(setfit.classify, "SetFit")
        print_report(setfit_df, "SetFit")
        results["setfit"] = {
            "accuracy": float(setfit_df["correct"].mean()),
            "avg_inference_ms": float(setfit_df["inference_ms"].mean())
        }
    except Exception as e:
        print(f"SetFit failed: {e}")
        results["setfit"] = {"error": str(e)}
    
    # 3. MedGemma evaluation
    print("\n[3/3] Evaluating MedGemma (LLM)...")
    try:
        medgemma = MedGemmaClassifier()
        medgemma.load()
        llm_df = evaluate(medgemma.classify, "MedGemma")
        print_report(llm_df, "MedGemma")
        results["medgemma"] = {
            "accuracy": float(llm_df["correct"].mean()),
            "avg_inference_ms": float(llm_df["inference_ms"].mean())
        }
    except Exception as e:
        print(f"MedGemma failed: {e}")
        results["medgemma"] = {"error": str(e)}
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"{'Model':<20} {'Accuracy':<12} {'Inference':<15}")
    print("-"*47)
    for model in ["fallback", "setfit", "medgemma"]:
        if "error" in results.get(model, {}):
            print(f"{model:<20} {'ERROR':<12}")
        else:
            acc = results[model]["accuracy"]
            ms = results[model]["avg_inference_ms"]
            print(f"{model:<20} {acc:.1%}{'':>5} {ms:.1f}ms")
    
    # Save
    save_results(results, "evaluation_results.json")

if __name__ == "__main__":
    main()
