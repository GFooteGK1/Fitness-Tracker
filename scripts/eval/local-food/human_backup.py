"""Frozen v3 abstention proposal from archived observations; no new model calls."""
import argparse
import copy
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from score import read_manifest, grade
from siglip_probe import read_config, file_digest
from compose_scene import read_policy as read_v2_policy
from encoder_export import write_new


def read_policy():
    data = Path(__file__).with_name("scene-policy-v3.json").read_bytes()
    policy = json.loads(data)
    _, v2_hash = read_v2_policy()
    if policy != dict(policyVersion="siglip2-human-backup-v3", sourcePolicyVersion="siglip2-geometry-v2",
        sourceDecisionConfigurationSHA256=v2_hash,
        humanRiskPromptIds=["risk_people", "risk_hands", "risk_face"],
        humanSafePromptIds=["safe_meal", "safe_food", "safe_package", "safe_drink"],
        humanMargin=0.0, candidateRule="v2 candidate AND human margin below zero"):
        raise ValueError("Changed frozen human-backup proposal")
    return policy, hashlib.sha256(data).hexdigest()


def abstain(outcome, margin):
    if not math.isfinite(margin): raise ValueError("Invalid human margin")
    return "uncertain" if outcome == "foodCandidate" and margin >= 0 else outcome


def replay(manifest_path, v2_path, semantic_path, output_manifest, output_report):
    manifest, digest = read_manifest(manifest_path)
    v2 = json.loads(Path(v2_path).read_bytes()); semantic = json.loads(Path(semantic_path).read_bytes())
    policy, policy_hash = read_policy(); config, config_hash = read_config(Path(__file__).with_name("siglip-probe.json"))
    if (not grade(manifest, digest, v2)["completed"] or manifest["policyVersion"] != policy["sourcePolicyVersion"]
        or manifest.get("decisionArtifact", {}).get("configurationSHA256") != policy["sourceDecisionConfigurationSHA256"]
        or v2.get("sourceSemanticSHA256") != file_digest(semantic_path)
        or semantic.get("modelArtifact") != manifest.get("modelArtifact")
        or semantic["modelArtifact"]["configurationSHA256"] != config_hash
        or semantic.get("completed") is not True or semantic.get("policyVersion") != config["policyVersion"]):
        raise ValueError("Wrong complete source/policy provenance")
    expected = {c["id"]: c["sha256"] for c in manifest["cases"]}; observed = {}
    for row in semantic.get("cases", []):
        if row.get("id") not in expected or row["id"] in observed or row.get("sha256") != expected[row["id"]]:
            raise ValueError("Changed, unknown or duplicate semantic case")
        observed[row["id"]] = row
    if set(observed) != set(expected): raise ValueError("Missing semantic case")
    if Path(output_manifest).exists() or Path(output_report).exists(): raise ValueError("Choose new output paths")
    rows = copy.deepcopy(v2["cases"])
    for row in rows:
        values = observed[row["id"]].get("diagnostics", {}).get("promptLogits", {})
        if set(values) != {p["id"] for p in config["prompts"]} or any(type(v) not in {int, float} or not math.isfinite(v) for v in values.values()):
            raise ValueError("Invalid exact prompt observations")
        margin = max(values[k] for k in policy["humanRiskPromptIds"]) - max(values[k] for k in policy["humanSafePromptIds"])
        previous = row["result"]["outcome"]; outcome = abstain(previous, margin)
        row["diagnostics"]["humanMargin"] = margin
        if outcome != previous:
            row["result"].update(outcome=outcome, reason="human_semantic_context")
    proposal = {**manifest, "dataset": manifest["dataset"] + "-human-backup-v3", "policyVersion": policy["policyVersion"],
        "decisionArtifact": {"configurationSHA256": policy_hash}}
    write_new(output_manifest, proposal)
    report = {**v2, "manifestSHA256": file_digest(output_manifest), "policyVersion": policy["policyVersion"],
        "decisionArtifact": proposal["decisionArtifact"], "sourceV2SHA256": file_digest(v2_path),
        "preprocessing": v2["preprocessing"] + "; archived human-semantic abstention replay",
        "replayGeneratedAt": datetime.now(timezone.utc).isoformat(),
        "execution": "archived observations only; no model or detector execution",
        "physicalDeviceQualified": False, "cases": rows}
    write_new(output_report, report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["v2_manifest", "v2_report", "semantic_report", "output_manifest", "output_report"]: parser.add_argument(name)
    args = parser.parse_args()
    report = replay(args.v2_manifest, args.v2_report, args.semantic_report, args.output_manifest, args.output_report)
    print("Replayed", len(report["cases"]), "archived cases; no new model/detector execution")
