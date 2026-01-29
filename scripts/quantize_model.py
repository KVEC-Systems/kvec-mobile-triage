#!/usr/bin/env python3
"""
Quantize MedSigLIP ONNX model to INT8 for smaller file size.

Usage:
    python scripts/quantize_model.py
"""

from pathlib import Path
from onnxruntime.quantization import quantize_dynamic, QuantType

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = PROJECT_ROOT / "models"

INPUT_MODEL = MODELS_DIR / "medsiglip-text.onnx"
OUTPUT_MODEL = MODELS_DIR / "medsiglip-text-int8.onnx"


def main():
    print(f"Quantizing {INPUT_MODEL}...")
    print(f"Input size: {INPUT_MODEL.stat().st_size / 1024 / 1024:.1f} MB")
    
    # Check for external data file
    data_file = Path(str(INPUT_MODEL) + ".data")
    if data_file.exists():
        print(f"External data file: {data_file.stat().st_size / 1024 / 1024:.1f} MB")
    
    # Dynamic quantization to INT8
    # This quantizes weights to INT8, which reduces model size significantly
    quantize_dynamic(
        model_input=str(INPUT_MODEL),
        model_output=str(OUTPUT_MODEL),
        weight_type=QuantType.QInt8,
        per_channel=True,
        reduce_range=False,
    )
    
    print(f"\n✅ Quantized model saved to {OUTPUT_MODEL}")
    print(f"Output size: {OUTPUT_MODEL.stat().st_size / 1024 / 1024:.1f} MB")
    
    # Check for quantized data file
    quant_data_file = Path(str(OUTPUT_MODEL) + ".data")
    if quant_data_file.exists():
        print(f"Output data file: {quant_data_file.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
