"""macOS-only CPU conversion/prediction parity. No photo upload or app integration."""
import argparse
import json
import math
import platform
import sys
import time
from pathlib import Path
from siglip_probe import file_digest, read_config, decide
from encoder_export import write_new


def check_export(root):
    root = Path(root); report = json.loads((root / "parity.json").read_bytes())
    if (report.get("schemaVersion") != 1 or report.get("completed") is not True
            or not report.get("cases") or len(report["cases"]) > 1000
            or any(c.get("passed") is not True for c in report["cases"])
            or file_digest(root / "image-encoder.pt") != report["encoderSHA256"]
            or file_digest(root / "text-vectors.json") != report["textVectorsSHA256"]):
        raise ValueError("Invalid export provenance")
    for case in report["cases"]:
        identifier = case["id"]
        if not identifier or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in identifier):
            raise ValueError("Unsafe tensor case ID")
        if file_digest(root / (identifier + ".npy")) != case["tensorSHA256"]:
            raise ValueError("Changed preprocessing tensor")
    return report


def convert(root, output):
    if sys.platform != "darwin": raise RuntimeError("macOS is required for Core ML CPU prediction parity")
    import coremltools as ct
    import numpy as np
    import torch
    root = Path(root); evidence = check_export(root)
    config, config_hash = read_config(Path(__file__).with_name("siglip-probe.json"))
    text = json.loads((root / "text-vectors.json").read_bytes())
    if text["modelArtifact"] != evidence["modelArtifact"] or config_hash != text["modelArtifact"]["configurationSHA256"]:
        raise ValueError("Wrong frozen text/policy export")
    output = Path(output); output.mkdir(parents=True, exist_ok=False)
    report = dict(schemaVersion=1, completed=False, sourceExportSHA256=file_digest(root / "parity.json"),
        operatingSystem=platform.platform(), coremltools=ct.__version__, torch=torch.__version__,
        computeUnits="CPU_ONLY", precision="FLOAT16", maximumLogitError=0.0, outcomeMatches=0, cases=[])
    write_new(output / "started.json", report)
    traced = torch.jit.load(str(root / "image-encoder.pt"), map_location="cpu").eval()
    started = time.perf_counter()
    model = ct.convert(traced, convert_to="mlprogram", minimum_deployment_target=ct.target.iOS17,
        inputs=[ct.TensorType(name="pixel_values", shape=(1, 3, 224, 224), dtype=np.float32)],
        outputs=[ct.TensorType(name="normalized_embedding", dtype=np.float32)],
        compute_precision=ct.precision.FLOAT16, compute_units=ct.ComputeUnit.CPU_ONLY)
    report["conversionMilliseconds"] = round((time.perf_counter() - started) * 1000)
    model.save(str(output / "image-encoder.mlpackage"))
    report["packageFiles"] = {p.relative_to(output).as_posix(): dict(bytes=p.stat().st_size, sha256=file_digest(p))
        for p in (output / "image-encoder.mlpackage").rglob("*") if p.is_file()}
    report["packageBytes"] = sum(v["bytes"] for v in report["packageFiles"].values())
    started = time.perf_counter()
    model = ct.models.MLModel(str(output / "image-encoder.mlpackage"), compute_units=ct.ComputeUnit.CPU_ONLY)
    report["loadMilliseconds"] = round((time.perf_counter() - started) * 1000)
    vectors = np.asarray(text["vectors"], dtype=np.float32)
    for case in evidence["cases"]:
        # Recheck and load that same bounded tensor buffer; allow_pickle=False forbids object code.
        import io
        with (root / (case["id"] + ".npy")).open("rb") as handle: data = handle.read(1_048_577)
        import hashlib
        if len(data) > 1_048_576 or hashlib.sha256(data).hexdigest() != case["tensorSHA256"]: raise ValueError("Changed/oversize tensor")
        inputs = np.load(io.BytesIO(data), allow_pickle=False)
        if inputs.shape != (1, 3, 224, 224) or inputs.dtype != np.float32 or not np.isfinite(inputs).all():
            raise ValueError("Invalid frozen tensor")
        started = time.perf_counter()
        predicted = np.asarray(model.predict({"pixel_values": inputs})["normalized_embedding"], dtype=np.float32)
        duration = round((time.perf_counter() - started) * 1000)
        if predicted.shape != (1, text["vectorDimension"]) or not np.isfinite(predicted).all(): raise ValueError("Invalid Core ML output")
        # Match eager normalized features, including normalization after FP16 execution.
        norm = float(np.linalg.norm(predicted))
        if not math.isfinite(norm) or norm <= 0: raise ValueError("Invalid Core ML norm")
        predicted /= norm
        logits = ((predicted @ vectors.T) * text["logitScale"] + text["logitBias"])[0].tolist()
        error = max(abs(a-b) for a,b in zip(logits, case["logits"]))
        # Screenshot metadata is not needed for semantic vector parity; preserve source outcome guard.
        result, _ = decide(config, logits, screenshot=case["result"]["reason"] == "screenshot")
        matched = result["outcome"] == case["result"]["outcome"]
        report["maximumLogitError"] = max(report["maximumLogitError"], error)
        report["outcomeMatches"] += int(matched)
        report["cases"].append(dict(id=case["id"], sha256=case["sha256"], logitError=error,
            outcomeMatches=matched, durationMilliseconds=duration))
        with (output / "parity.partial.json").open("w", encoding="utf-8") as handle: json.dump(report, handle, indent=2)
        if error > 0.05 or not matched: raise ValueError("Core ML parity failed; receipt preserved")
    report["completed"] = True
    write_new(output / "parity.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("export"); parser.add_argument("output")
    args = parser.parse_args(); convert(args.export, args.output)
