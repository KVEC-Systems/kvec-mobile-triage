#!/usr/bin/env python3
"""
Build Vector Database for Offline Protocol Navigator

Downloads clinical guidelines, exports MedSigLIP text encoder to ONNX,
generates embeddings, and saves everything for mobile use.

Usage:
    python scripts/build_vector_db.py
"""

import json
import os
from pathlib import Path

import numpy as np
import torch
from datasets import load_dataset
from transformers import AutoModel, AutoProcessor

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_DIR = PROJECT_ROOT / "assets"
MODELS_DIR = PROJECT_ROOT / "models"
CHUNK_SIZE = 400  # Characters per chunk
CHUNK_OVERLAP = 50  # Overlap between chunks

# High-quality sources to include
ALLOWED_SOURCES = {"who", "cdc", "nice", "icrc"}

# MedSigLIP model
MODEL_NAME = "google/medsiglip-448"


def load_guidelines():
    """Download and filter the EPFL guidelines dataset."""
    print("Loading epfl-llm/guidelines dataset...")
    dataset = load_dataset("epfl-llm/guidelines", split="train")
    
    # Filter for high-quality sources
    filtered = []
    for row in dataset:
        source = row.get("source", "").lower()
        if source in ALLOWED_SOURCES:
            text = row.get("clean_text") or row.get("raw_text", "")
            if len(text) > 100:  # Skip very short entries
                filtered.append({
                    "id": row.get("id", ""),
                    "title": row.get("title", "Untitled"),
                    "source": source,
                    "text": text,
                    "url": row.get("url", ""),
                })
    
    print(f"Filtered to {len(filtered)} guidelines from sources: {ALLOWED_SOURCES}")
    return filtered


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        
        # Try to break at sentence boundary
        if end < len(text):
            last_period = chunk.rfind(". ")
            if last_period > chunk_size // 2:
                chunk = chunk[:last_period + 1]
                end = start + last_period + 1
        
        chunks.append(chunk.strip())
        start = end - overlap
    
    return chunks


def export_text_encoder_to_onnx(model, processor, output_path: Path):
    """Export only the text encoder to ONNX format."""
    print(f"Exporting text encoder to ONNX: {output_path}")
    
    # Get the text encoder
    text_model = model.text_model
    
    # Sample input for tracing
    sample_text = ["sample medical text for export"]
    inputs = processor(text=sample_text, return_tensors="pt", padding="max_length", max_length=64)
    
    # Export to ONNX with dynamic axes
    torch.onnx.export(
        text_model,
        (inputs["input_ids"], inputs["attention_mask"]),
        str(output_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["text_embeds"],
        dynamic_axes={
            "input_ids": {0: "batch_size"},
            "attention_mask": {0: "batch_size"},
            "text_embeds": {0: "batch_size"},
        },
        opset_version=14,
    )
    
    print(f"Text encoder exported successfully ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")


def export_tokenizer_vocab(processor, output_path: Path):
    """Export tokenizer vocabulary for JS-side tokenization."""
    print(f"Exporting tokenizer vocab to: {output_path}")
    
    tokenizer = processor.tokenizer
    
    # Get vocab - SigLIP uses SentencePiece but we'll export a simplified version
    vocab = tokenizer.get_vocab()
    
    # Get special tokens
    special_tokens = {
        "pad_token": tokenizer.pad_token,
        "pad_token_id": tokenizer.pad_token_id,
        "eos_token": tokenizer.eos_token,
        "eos_token_id": tokenizer.eos_token_id,
        "unk_token": getattr(tokenizer, "unk_token", "<unk>"),
        "unk_token_id": getattr(tokenizer, "unk_token_id", 0),
    }
    
    tokenizer_data = {
        "vocab": vocab,
        "special_tokens": special_tokens,
        "max_length": 64,  # MedSigLIP context length
    }
    
    with open(output_path, "w") as f:
        json.dump(tokenizer_data, f)
    
    print(f"Tokenizer vocab exported ({len(vocab)} tokens)")


def generate_embeddings(texts: list[str], model, processor, batch_size: int = 32) -> np.ndarray:
    """Generate embeddings for a list of texts using MedSigLIP."""
    print(f"Generating embeddings for {len(texts)} texts...")
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)
    model.eval()
    
    all_embeddings = []
    
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        inputs = processor(
            text=batch_texts,
            return_tensors="pt",
            padding="max_length",
            max_length=64,
            truncation=True,
        ).to(device)
        
        with torch.no_grad():
            outputs = model.get_text_features(**inputs)
            # Normalize embeddings for cosine similarity
            embeddings = outputs / outputs.norm(dim=-1, keepdim=True)
            all_embeddings.append(embeddings.cpu().numpy())
        
        if (i // batch_size) % 10 == 0:
            print(f"  Processed {i + len(batch_texts)}/{len(texts)}")
    
    return np.vstack(all_embeddings)


def main():
    """Main entry point."""
    # Create output directories
    OUTPUT_DIR.mkdir(exist_ok=True)
    MODELS_DIR.mkdir(exist_ok=True)
    
    # Load guidelines
    guidelines = load_guidelines()
    
    # Load model and processor
    print(f"Loading {MODEL_NAME}...")
    model = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True)
    processor = AutoProcessor.from_pretrained(MODEL_NAME, trust_remote_code=True)
    
    # Export ONNX model and tokenizer
    onnx_path = MODELS_DIR / "medsiglip-text.onnx"
    tokenizer_path = MODELS_DIR / "medsiglip-tokenizer.json"
    
    export_text_encoder_to_onnx(model, processor, onnx_path)
    export_tokenizer_vocab(processor, tokenizer_path)
    
    # Chunk guidelines and prepare for embedding
    protocols = []
    chunk_texts = []
    
    for guideline in guidelines:
        chunks = chunk_text(guideline["text"])
        for i, chunk in enumerate(chunks):
            protocol_id = f"{guideline['source']}_{guideline['id']}_chunk_{i}"
            protocols.append({
                "id": protocol_id,
                "title": guideline["title"],
                "source": guideline["source"],
                "text": chunk,
                "url": guideline["url"],
            })
            chunk_texts.append(chunk)
    
    print(f"Created {len(protocols)} chunks from {len(guidelines)} guidelines")
    
    # Generate embeddings
    embeddings = generate_embeddings(chunk_texts, model, processor)
    
    # Add embeddings to protocols
    for i, protocol in enumerate(protocols):
        protocol["embedding"] = embeddings[i].tolist()
    
    # Save protocols database
    protocols_path = OUTPUT_DIR / "protocols.json"
    with open(protocols_path, "w") as f:
        json.dump(protocols, f)
    
    print(f"\n✅ Done!")
    print(f"   Protocols database: {protocols_path} ({len(protocols)} entries)")
    print(f"   ONNX model: {onnx_path}")
    print(f"   Tokenizer: {tokenizer_path}")
    
    # Print some stats
    embedding_dim = len(protocols[0]["embedding"])
    print(f"\n📊 Stats:")
    print(f"   Embedding dimension: {embedding_dim}")
    print(f"   Sources: {set(p['source'] for p in protocols)}")


if __name__ == "__main__":
    main()
