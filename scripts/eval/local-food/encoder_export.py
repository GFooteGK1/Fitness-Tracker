"""Local evaluation export: image encoder and fixed text vectors, no app integration."""
import argparse
import hashlib
import io
import json
import platform
import re
from pathlib import Path
from fetch import image_path, verify
from score import read_manifest, grade
from siglip_probe import read_config, supporting_pins, verify_supporting, file_digest, decide


def write_new(path, value):
    with Path(path).open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, indent=2); handle.write("\n")


def export(configuration, manifest_path, images, model_directory, baseline_path, output):
    import torch
    import numpy as np
    from transformers import AutoModel, AutoProcessor
    from PIL import Image, ImageOps
    config, config_hash = read_config(configuration)
    manifest, manifest_hash = read_manifest(manifest_path)
    if any(not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", c["id"]) for c in manifest["cases"]):
        raise ValueError("Unsafe export case ID")
    baseline = json.loads(Path(baseline_path).read_bytes())
    if not grade(manifest, manifest_hash, baseline)["completed"]:
        raise ValueError("Baseline must be complete")
    expected_artifact = dict(repository=config["repository"], revision=config["revision"],
        weightSHA256=config["weightSHA256"], configurationSHA256=config_hash, supportingFiles=supporting_pins(config))
    if manifest.get("modelArtifact") != expected_artifact:
        raise ValueError("Wrong frozen model/policy")
    model_directory = Path(model_directory)
    if file_digest(model_directory / "model.safetensors") != config["weightSHA256"]:
        raise ValueError("Wrong weights")
    supporting = verify_supporting(model_directory, supporting_pins(config))
    for case in manifest["cases"]:
        with image_path(images, case["file"]).open("rb") as handle: verify(handle.read(10_485_761), case["sha256"])
    root = Path(output); root.mkdir(parents=True, exist_ok=False)
    write_new(root / "started.json", dict(completed=False, manifestSHA256=manifest_hash, modelArtifact=expected_artifact))
    torch.set_num_threads(config["threads"])
    model = AutoModel.from_pretrained(model_directory, local_files_only=True, trust_remote_code=False,
        use_safetensors=True, attn_implementation="eager").eval().to("cpu")
    processor = AutoProcessor.from_pretrained(model_directory, local_files_only=True, trust_remote_code=False, use_fast=False)

    class ImageEncoder(torch.nn.Module):
        def __init__(self, vision):
            super().__init__(); self.vision = vision

        def forward(self, pixel_values):
            vector = self.vision(pixel_values=pixel_values, return_dict=False)[1]
            return vector / vector.norm(dim=-1, keepdim=True)

    wrapper = ImageEncoder(model.vision_model).eval()
    with torch.inference_mode():
        tokens = processor(text=[p["text"] for p in config["prompts"]], padding="max_length",
            max_length=model.config.text_config.max_position_embeddings, truncation=True, return_tensors="pt")
        vectors = model.get_text_features(**tokens); vectors = vectors / vectors.norm(dim=-1, keepdim=True)
        example = torch.zeros(1, 3, 224, 224)
        traced = torch.jit.trace(wrapper, example, check_trace=True).eval()
        torch.jit.save(traced, str(root / "image-encoder.pt"))
        # Reload the persisted artifact, not just the in-memory trace.
        traced = torch.jit.load(str(root / "image-encoder.pt"), map_location="cpu").eval()
        text = dict(schemaVersion=1, modelArtifact=expected_artifact, modelSupportingSHA256=supporting,
            prompts=config["prompts"], vectors=vectors.tolist(), logitScale=float(model.logit_scale.exp()),
            logitBias=float(model.logit_bias), vectorDimension=vectors.shape[1],
            preprocessing=json.loads((model_directory / "preprocessor_config.json").read_bytes()))
        write_new(root / "text-vectors.json", text)
        report = dict(schemaVersion=1, completed=False, manifestSHA256=manifest_hash, baselineSHA256=file_digest(baseline_path),
            modelArtifact=expected_artifact, encoderSHA256=file_digest(root / "image-encoder.pt"),
            textVectorsSHA256=file_digest(root / "text-vectors.json"), torch=torch.__version__,
            operatingSystem=platform.platform(), imageEncoderBytes=(root / "image-encoder.pt").stat().st_size,
            textVectorsBytes=(root / "text-vectors.json").stat().st_size, maxLogitError=0.0, cases=[])
        baseline_cases = {c["id"]: c for c in baseline["cases"]}
        for case in manifest["cases"]:
            with image_path(images, case["file"]).open("rb") as handle: data = handle.read(10_485_761)
            verify(data, case["sha256"])
            with Image.open(io.BytesIO(data)) as image:
                inputs = processor(images=ImageOps.exif_transpose(image).convert("RGB"), return_tensors="pt")
            eager = wrapper(inputs["pixel_values"])
            actual = traced(inputs["pixel_values"])
            eager_logits = (eager @ vectors.T) * model.logit_scale.exp() + model.logit_bias
            logits = (actual @ vectors.T) * model.logit_scale.exp() + model.logit_bias
            error = float((logits - eager_logits).abs().max())
            saved = baseline_cases[case["id"]]["diagnostics"]["promptLogits"]
            baseline_error = max(abs(float(logits[0, i]) - saved[p["id"]]) for i, p in enumerate(config["prompts"]))
            result, diagnostics = decide(config, logits[0].tolist(), case["isScreenshot"])
            passed = error <= 0.0001 and baseline_error <= 0.0001 and result["outcome"] == baseline_cases[case["id"]]["result"]["outcome"]
            row = dict(id=case["id"], sha256=case["sha256"], logitError=error, baselineLogitError=baseline_error,
                passed=passed, result=result, diagnostics=diagnostics)
            report["cases"].append(row); report["maxLogitError"] = max(report["maxLogitError"], error, baseline_error)
            # Tensors are ignored local conversion inputs; never retained by CI artifact upload.
            tensor_path = root / (case["id"] + ".npy")
            with tensor_path.open("xb") as handle: np.save(handle, inputs["pixel_values"].numpy(), allow_pickle=False)
            row["tensorSHA256"] = file_digest(tensor_path)
            row["logits"] = logits[0].tolist()
            with (root / "parity.partial.json").open("w", encoding="utf-8") as handle: json.dump(report, handle, indent=2)
            print(case["id"], "parity" if passed else "MISMATCH", flush=True)
            if not passed: raise ValueError("Encoder parity failed; preserve export and partial report")
        report["completed"] = True
        write_new(root / "parity.json", report)
        print("Image encoder bytes", report["imageEncoderBytes"], "text vectors bytes", report["textVectorsBytes"], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["configuration", "manifest", "images", "model", "baseline", "output"]: parser.add_argument(name)
    args = parser.parse_args()
    export(args.configuration, args.manifest, args.images, args.model, args.baseline, args.output)
