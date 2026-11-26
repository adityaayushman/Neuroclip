import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from torch import nn

QUANT_OPS = ["MatMul", "Gemm", "LSTM", "Conv"]
SAFE_QUANT_OPS = ["MatMul", "Gemm", "LSTM"]


def export_fp32(model: nn.Module, path: Path, window: int, n_features: int) -> None:
    model.eval()
    dummy = torch.zeros(1, window, n_features)
    torch.onnx.export(
        model,
        dummy,
        str(path),
        input_names=["window"],
        output_names=["logit"],
        dynamic_axes={"window": {0: "batch"}, "logit": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )


def quantize_int8(fp32: Path, out: Path, ops: list[str]) -> None:
    quantize_dynamic(str(fp32), str(out), weight_type=QuantType.QInt8, op_types_to_quantize=ops)


def op_counts(path: Path) -> dict[str, int]:
    import onnx

    counts: dict[str, int] = {}
    for node in onnx.load(str(path)).graph.node:
        counts[node.op_type] = counts.get(node.op_type, 0) + 1
    return counts


def session(path: Path) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    return ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])


def run_logits(path: Path, x: np.ndarray) -> np.ndarray:
    return session(path).run(None, {"window": x.astype(np.float32)})[0]


def latency_ms(path: Path, window: int, n_features: int, runs: int = 300) -> dict[str, float]:
    sess = session(path)
    x = np.random.default_rng(0).standard_normal((1, window, n_features)).astype(np.float32)
    for _ in range(20):
        sess.run(None, {"window": x})
    times = []
    for _ in range(runs):
        t0 = time.perf_counter()
        sess.run(None, {"window": x})
        times.append((time.perf_counter() - t0) * 1000)
    return {"median_ms": float(np.median(times)), "p95_ms": float(np.percentile(times, 95))}


def size_mb(path: Path) -> float:
    return path.stat().st_size / 1e6
