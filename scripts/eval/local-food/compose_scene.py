"""Compose actual frozen semantic observations with independent native scene receipts."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from score import read_manifest, grade
from siglip_probe import read_config, file_digest
from encoder_export import write_new

STAGES = {"face", "humanRectangle", "bodyPose", "handPose"}
COUNT_FIELDS = ["faceCount", "humanRectangleCount", "bodyPoseCount", "handPoseCount"]


def read_policy():
    data = Path(__file__).with_name("scene-policy-v2.json").read_bytes()
    policy = json.loads(data)
    if (policy["policyVersion"] != "siglip2-geometry-v2" or policy["guardVersion"] != "vision-human-geometry-v1"
            or policy["sceneRevisions"] != {"face": 3, "humanRectangle": 2, "bodyPose": 1, "handPose": 1}
            or policy["minimumConfidence"] != 0.2 or policy["minimumPosePoints"] != 2 or policy["maximumHandCount"] != 4
            or policy["candidateMargin"] != 1 or policy["nonFoodMargin"] != -1 or policy["contextMargin"] != 0
            or policy["contextPromptIds"] != ["risk_document", "risk_screen", "risk_medical"]
            or policy["sourcePolicyVersion"] != "siglip2-food-probe-v1"):
        raise ValueError("Decision contract differs from the fixed native proposal")
    return policy, hashlib.sha256(data).hexdigest()


def scene_valid(scene):
    return (isinstance(scene, dict) and type(scene.get("completed")) is bool
        and isinstance(scene.get("reason"), str) and 0 < len(scene["reason"].encode()) <= 128
        and type(scene.get("durationMilliseconds")) is int and scene["durationMilliseconds"] >= 0
        and all(type(scene.get(key)) is int and 0 <= scene[key] <= 10_000 for key in COUNT_FIELDS)
        and isinstance(scene.get("stages"), list) and all(isinstance(v, str) for v in scene["stages"])
        and len(set(scene["stages"])) == len(scene["stages"]) and set(scene["stages"]) <= STAGES
        and (not scene["completed"] or set(scene["stages"]) == STAGES))


def evaluate(food_margin, context_margin, scene, screenshot):
    if screenshot: return "uncertain", "screenshot"
    if not scene_valid(scene) or not scene["completed"]: return "uncertain", "scene_evidence_unavailable"
    if not math.isfinite(food_margin) or not math.isfinite(context_margin): return "error", "invalid_semantic_scores"
    if any(scene[key] > 0 for key in COUNT_FIELDS): return "uncertain", "human_geometry"
    if context_margin >= 0: return "uncertain", "context_similarity"
    if food_margin >= 1: return "foodCandidate", "food_similarity_margin"
    if food_margin <= -1: return "nonFood", "non_food_similarity_margin"
    return "uncertain", "ambiguous_similarity_margin"


def compose(source_manifest_path, semantic_path, scene_path, output_manifest, output_report, configuration_path=None):
    manifest, digest = read_manifest(source_manifest_path)
    semantic = json.loads(Path(semantic_path).read_bytes())
    if not grade(manifest, digest, semantic)["completed"]: raise ValueError("Incomplete semantic report")
    config, config_hash = read_config(configuration_path or Path(__file__).with_name("siglip-probe.json"))
    if semantic.get("modelArtifact", {}).get("configurationSHA256") != config_hash:
        raise ValueError("Semantic configuration differs from archived observations")
    policy, policy_hash = read_policy()
    if semantic["policyVersion"] != policy["sourcePolicyVersion"]: raise ValueError("Wrong source policy")
    scenes = json.loads(Path(scene_path).read_bytes())
    if (scenes.get("schemaVersion") != 1 or scenes.get("manifestSHA256") != digest
            or scenes.get("sceneGuardVersion") != policy["guardVersion"]
            or scenes.get("policyVersion") != policy["guardVersion"] or scenes.get("requestRevision") != 0
            or scenes.get("sceneRevisions") != policy["sceneRevisions"] or not scenes.get("operatingSystem")
            or type(scenes.get("sceneMinimumConfidence")) not in {int, float}
            or not math.isfinite(scenes["sceneMinimumConfidence"])
            or abs(scenes["sceneMinimumConfidence"] - policy["minimumConfidence"]) > 0.000001
            or scenes.get("sceneMinimumPosePoints") != policy["minimumPosePoints"]
            or scenes.get("sceneMaximumHandCount") != policy["maximumHandCount"]
            or not scenes.get("preprocessing") or not scenes.get("generatedAt")
            or type(scenes.get("completed")) is not bool):
        raise ValueError("Scene provenance differs from frozen input/requests")
    expected = {case["id"]: case for case in manifest["cases"]}; native = {}
    for row in scenes.get("cases", []):
        if row.get("id") not in expected or row["id"] in native or row.get("sha256") != expected[row["id"]]["sha256"]:
            raise ValueError("Unknown, duplicate or changed scene case")
        native[row["id"]] = row.get("scene")
    proposal = {**manifest, "dataset": manifest["dataset"] + "-geometry-v2", "policyVersion": policy["policyVersion"],
        "decisionArtifact": {"configurationSHA256": policy_hash}}
    # Prevent either path from replacing previous evidence; do not publish a half-overwritten pair.
    if Path(output_manifest).exists() or Path(output_report).exists(): raise ValueError("Choose new output paths")
    rows = []
    semantic_rows = {c["id"]: c for c in semantic["cases"]}
    for case in manifest["cases"]:
        actual = semantic_rows[case["id"]]
        values = actual.get("diagnostics", {}).get("promptLogits", {})
        if set(values) != {p["id"] for p in config["prompts"]} or any(type(v) not in {float, int} or not math.isfinite(v) for v in values.values()):
            raise ValueError("Missing or invalid exact prompt observations")
        food = max(values[p["id"]] for p in config["prompts"] if p["group"] == "food")
        margin = food - max(values[p["id"]] for p in config["prompts"] if p["group"] == "nonFood")
        context = max(values[key] for key in policy["contextPromptIds"]) - food
        scene = native.get(case["id"])
        outcome, reason = evaluate(margin, context, scene, case["isScreenshot"])
        # Do not invent a duration when native evidence is missing.
        duration = actual["result"]["durationMilliseconds"] + (scene["durationMilliseconds"] if scene_valid(scene) else 0)
        rows.append(dict(id=case["id"], sha256=case["sha256"], result=dict(outcome=outcome, reason=reason,
            foodConfidence=1 / (1 + math.exp(-max(-80, min(80, margin)))), labels=[], durationMilliseconds=duration),
            diagnostics=dict(foodMargin=margin, contextMargin=context, scene=scene)))
    write_new(output_manifest, proposal)
    report = dict(schemaVersion=1, completed=scenes["completed"] and len(native) == len(expected)
        and all(scene_valid(v) and v["completed"] for v in native.values()),
        manifestSHA256=file_digest(output_manifest), policyVersion=policy["policyVersion"], requestRevision=0,
        modelArtifact=manifest["modelArtifact"], decisionArtifact=proposal["decisionArtifact"],
        operatingSystem="semantic: " + semantic["operatingSystem"] + "; scene: " + scenes["operatingSystem"],
        preprocessing="Semantic 224px pinned processor; geometric " + scenes["preprocessing"],
        generatedAt=scenes["generatedAt"], sourceSemanticSHA256=file_digest(semantic_path), sourceSceneSHA256=file_digest(scene_path),
        physicalDeviceQualified=False, cases=rows)
    write_new(output_report, report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["source_manifest", "semantic_report", "scene_report", "output_manifest", "output_report"]: parser.add_argument(name)
    args = parser.parse_args()
    report = compose(args.source_manifest, args.semantic_report, args.scene_report, args.output_manifest, args.output_report)
    print("Composed", len(report["cases"]), "cases; complete:", report["completed"])
