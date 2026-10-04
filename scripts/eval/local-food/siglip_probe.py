"""Evaluation-only local CPU model. No image upload or phone integration."""
import argparse
import hashlib
import io
import json
import math
import os
import platform
import time
from datetime import datetime, timezone
from pathlib import Path
from score import read_manifest
from fetch import image_path, verify


def file_digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1_048_576), b""):
            value.update(block)
    return value.hexdigest()


def read_config(path):
    data = Path(path).read_bytes(); config = json.loads(data)
    ids = [p["id"] for p in config["prompts"]]
    if (config["repository"] != "google/siglip2-base-patch16-224"
            or len(config["revision"]) != 40 or any(c not in "0123456789abcdef" for c in config["revision"])
            or len(config["weightSHA256"]) != 64 or any(c not in "0123456789abcdef" for c in config["weightSHA256"])
            or len(set(ids)) != len(ids) or not 1 <= len(ids) <= 64
            or {p["group"] for p in config["prompts"]} != {"food", "nonFood", "risk", "safe"}
            or any(not p["text"] or len(p["text"]) > 256 for p in config["prompts"])
            or any(type(config[key]) not in {int, float} or not math.isfinite(config[key])
                   for key in ["nonFoodMargin", "candidateMargin", "riskMargin"])
            or not config["nonFoodMargin"] < config["candidateMargin"]
            or type(config["threads"]) is not int or not 1 <= config["threads"] <= 8):
        raise ValueError("Invalid frozen probe configuration")
    return config, hashlib.sha256(data).hexdigest()


def decide(config, logits, screenshot=False):
    if len(logits) != len(config["prompts"]) or any(not math.isfinite(v) for v in logits):
        raise ValueError("Invalid model logits")
    grouped = {group: max(value for prompt, value in zip(config["prompts"], logits) if prompt["group"] == group)
               for group in ["food", "nonFood", "risk", "safe"]}
    margin = grouped["food"] - grouped["nonFood"]
    risk = grouped["risk"] - grouped["safe"]
    # Relative similarity scores are not calibrated probabilities or upload permission.
    confidence = 1 / (1 + math.exp(-max(-80, min(80, margin))))
    if screenshot: outcome, reason = "uncertain", "screenshot"
    elif risk >= config["riskMargin"]: outcome, reason = "uncertain", "risk_context"
    elif margin >= config["candidateMargin"]: outcome, reason = "foodCandidate", "food_similarity_margin"
    elif margin <= config["nonFoodMargin"]: outcome, reason = "nonFood", "non_food_similarity_margin"
    else: outcome, reason = "uncertain", "ambiguous_similarity_margin"
    return dict(outcome=outcome, reason=reason, foodConfidence=confidence, labels=[], durationMilliseconds=0), {
        "foodMargin": margin, "riskMargin": risk,
        "promptLogits": {p["id"]: value for p, value in zip(config["prompts"], logits)}}


def supporting_pins(config):
    pins = json.loads(Path(__file__).with_name("siglip-model-files.json").read_bytes())
    required = {"config.json", "preprocessor_config.json", "special_tokens_map.json",
                "tokenizer.json", "tokenizer.model", "tokenizer_config.json"}
    if (pins["repository"] != config["repository"] or pins["revision"] != config["revision"]
            or set(pins["files"]) != required
            or any(v["algorithm"] not in {"gitBlobSHA1", "sha256"}
                   or len(v["hash"]) != (40 if v["algorithm"] == "gitBlobSHA1" else 64)
                   or any(c not in "0123456789abcdef" for c in v["hash"])
                   for v in pins["files"].values())):
        raise ValueError("Invalid pinned supporting artifacts")
    return pins["files"]


def verify_supporting(model_directory, pins):
    digests = {}
    for name, expected in pins.items():
        with (Path(model_directory) / name).open("rb") as handle: data = handle.read(67_108_865)
        if len(data) > 67_108_864:
            raise ValueError("Supporting artifact exceeds limit")
        blob = b"blob " + str(len(data)).encode("ascii") + b"\0" + data
        observed = hashlib.sha1(blob).hexdigest() if expected["algorithm"] == "gitBlobSHA1" else hashlib.sha256(data).hexdigest()
        if observed != expected["hash"]:
            raise ValueError("Supporting artifact differs from pinned repository revision: " + name)
        digests[name] = hashlib.sha256(data).hexdigest()
    return digests


def download(config, cache):
    # Anonymous public download only. No remote code, credentials, provider API or inference endpoint.
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    from huggingface_hub import snapshot_download
    folder = snapshot_download(config["repository"], revision=config["revision"], token=False,
        cache_dir=str(cache), max_workers=1, allow_patterns=["README.md", "config.json", "model.safetensors",
        "preprocessor_config.json", "special_tokens_map.json", "tokenizer.json", "tokenizer.model", "tokenizer_config.json"])
    if file_digest(Path(folder) / "model.safetensors") != config["weightSHA256"]:
        raise ValueError("Model weight hash differs from the frozen public artifact")
    verify_supporting(folder, supporting_pins(config))
    return Path(folder)


def run(config_path, manifest_path, image_directory, model_directory, output):
    config, config_digest = read_config(config_path)
    manifest, manifest_digest = read_manifest(manifest_path)
    artifact = dict(repository=config["repository"], revision=config["revision"], weightSHA256=config["weightSHA256"],
                    configurationSHA256=config_digest, supportingFiles=supporting_pins(config))
    if (manifest.get("modelArtifact") != artifact or manifest["policyVersion"] != config["policyVersion"]
            or manifest["requestRevision"] != config["requestRevision"]):
        raise ValueError("Manifest does not bind the frozen model and prompt policy")
    output = Path(output); partial = Path(str(output) + ".partial.json")
    if output.exists() or partial.exists() or Path(str(partial) + ".next").exists():
        raise ValueError("Choose new report paths")
    # Validate all input bytes before model inference. Expected answers are never passed to the model.
    for case in manifest["cases"]:
        path = image_path(image_directory, case["file"])
        with path.open("rb") as handle: verify(handle.read(10_485_761), case["sha256"])
    model_directory = Path(model_directory)
    if file_digest(model_directory / "model.safetensors") != config["weightSHA256"]:
        raise ValueError("Wrong model artifact")
    supporting_digests = verify_supporting(model_directory, artifact["supportingFiles"])
    import torch
    import transformers
    from transformers import AutoModel, AutoProcessor
    from PIL import Image, ImageOps, __version__ as pillow_version
    torch.set_num_threads(config["threads"])
    model = AutoModel.from_pretrained(model_directory, use_safetensors=True, trust_remote_code=False,
        local_files_only=True, attn_implementation="eager").eval().to("cpu")
    processor = AutoProcessor.from_pretrained(model_directory, local_files_only=True, trust_remote_code=False, use_fast=False)
    text_inputs = processor(text=[p["text"] for p in config["prompts"]], padding="max_length",
        max_length=model.config.text_config.max_position_embeddings, truncation=True, return_tensors="pt")
    with torch.inference_mode():
        text_features = model.get_text_features(**text_inputs)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
    report = dict(schemaVersion=1, completed=False, manifestSHA256=manifest_digest,
        modelArtifact=artifact, modelSupportingSHA256=supporting_digests,
        policyVersion=config["policyVersion"], requestRevision=config["requestRevision"],
        operatingSystem=platform.platform(), preprocessing="PIL EXIF transpose, RGB, pinned SigLIP2 processor 224px",
        runtime=dict(torch=torch.__version__, transformers=transformers.__version__, pillow=pillow_version,
            python=platform.python_version(), modelClass=type(model).__name__, processorClass=type(processor).__name__,
            textContextLength=model.config.text_config.max_position_embeddings, device="cpu", threads=config["threads"]),
        generatedAt=datetime.now(timezone.utc).isoformat(), cases=[])
    with partial.open("x", encoding="utf-8") as handle: json.dump(report, handle, indent=2)
    for case in manifest["cases"]:
        started = time.perf_counter(); diagnostics = None
        try:
            with image_path(image_directory, case["file"]).open("rb") as handle: data = handle.read(10_485_761)
            verify(data, case["sha256"])
            with Image.open(io.BytesIO(data)) as opened:
                image = ImageOps.exif_transpose(opened).convert("RGB")
                inputs = processor(images=image, return_tensors="pt")
            with torch.inference_mode():
                features = model.get_image_features(**inputs)
                features = features / features.norm(dim=-1, keepdim=True)
                logits = ((features @ text_features.T) * model.logit_scale.exp() + model.logit_bias)[0].tolist()
            result, diagnostics = decide(config, logits, screenshot=case["isScreenshot"])
        except Exception as error:
            # Retain an error receipt. Do not rerun a failed case implicitly.
            result = dict(outcome="error", reason="local_inference_failed", labels=[], foodConfidence=None, durationMilliseconds=0)
            diagnostics = {"errorType": type(error).__name__}
        result["durationMilliseconds"] = round((time.perf_counter() - started) * 1000)
        report["cases"].append(dict(id=case["id"], sha256=case["sha256"], result=result, diagnostics=diagnostics))
        checkpoint = Path(str(partial) + ".next")
        with checkpoint.open("x", encoding="utf-8") as handle: json.dump(report, handle, indent=2)
        os.replace(checkpoint, partial)  # Only this invocation's newly created checkpoint is replaced.
        print(case["id"], result["outcome"], result["reason"], flush=True)
        if result["outcome"] == "error":
            raise RuntimeError("Inference failed; partial receipt retained. Diagnose before another run.")
    report["completed"] = True
    with output.open("x", encoding="utf-8") as handle: json.dump(report, handle, indent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    pull = commands.add_parser("download"); pull.add_argument("configuration"); pull.add_argument("cache")
    probe = commands.add_parser("run")
    for name in ["configuration", "manifest", "images", "model", "output"]: probe.add_argument(name)
    args = parser.parse_args()
    if args.command == "download":
        config, _ = read_config(args.configuration); print(download(config, args.cache))
    else: run(args.configuration, args.manifest, args.images, args.model, args.output)
