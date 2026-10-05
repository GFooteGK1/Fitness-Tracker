"""Compare frozen v3/v4 policies on matching semantic and native diagnostic receipts.

This offline composition executes no models and establishes no device qualification.
"""
import argparse
import copy
import hashlib
import json
import math
import re
import tempfile
from pathlib import Path
from compose_scene import evaluate, read_policy as read_v2_policy
from diagnose_scene import summarize
from encoder_export import write_new
from human_backup import abstain, read_policy as read_v3_policy
from score import read_manifest, grade
from siglip_probe import read_config, file_digest, supporting_pins

BASE = Path(__file__).parent
COUNT_FIELDS = {"face": "faceCount", "humanRectangle": "humanRectangleCount",
    "bodyPose": "bodyPoseCount", "handPose": "handPoseCount"}


def read_policy():
    data = (BASE / "scene-policy-v4.json").read_bytes()
    policy = json.loads(data)
    _, source_hash = read_v3_policy()
    expected = dict(schemaVersion=1, policyVersion="siglip2-full-upper-human-v4",
        sourcePolicyVersion="siglip2-human-backup-v3", sourceDecisionConfigurationSHA256=source_hash,
        diagnosticVersion="vision-geometry-diagnostics-v1", baselineProfile="full-body-512",
        additionalProfile="upper-body-512", minimumConfidence=.2, minimumPosePoints=2,
        maximumHandCount=4, candidateRule="v3 candidate AND no accepted observations in upper-body-512",
        qualification="evaluation only; no automatic uploads or physical-device qualification")
    if policy != expected:
        raise ValueError("Changed frozen upper-body proposal")
    return policy, hashlib.sha256(data).hexdigest()


def scene(profile):
    return dict(completed=True, reason="validated diagnostic observations", stages=list(COUNT_FIELDS),
        durationMilliseconds=profile["durationMilliseconds"],
        **{COUNT_FIELDS[s["stage"]]: s["acceptedCount"] for s in profile["stages"]})


def gate_checks(cases, rows):
    if not any("expectedGate" in c for c in cases):
        return {"available": False, "reason": "No frozen gate expectations; preserve original label metrics"}
    observed = {row.get("id"): row for row in rows}
    if len(observed) != len(rows) or set(observed) != {c["id"] for c in cases}:
        raise ValueError("Missing, unknown or duplicate gate result")
    checked = []
    for case in cases:
        row = observed[case["id"]]
        if row.get("sha256") != case.get("sha256"):
            raise ValueError("Changed gate image hash")
        expected = case.get("expectedGate")
        if expected not in {"foodCandidate", "uncertain", "nonCandidate"}:
            raise ValueError("Missing or invalid frozen gate expectation")
        actual = row["result"]["outcome"]
        passed = actual in {"uncertain", "nonFood"} if expected == "nonCandidate" else actual == expected
        checked.append(dict(id=case["id"], group=case["group"], expected=expected, actual=actual, passed=passed))
    groups = sorted({c["group"] for c in cases})
    by_id = {r["id"]: r for r in checked}
    positive = [c for c in cases if c["expectedGate"] == "foodCandidate"]
    human = [c for c in cases if c.get("humanPresence") == "confirmed" and c.get("expectedPresence") == "food"]
    return dict(available=True, cases=checked, caseCount=len(checked), casePasses=sum(c["passed"] for c in checked),
        eligibleFoodRecall=dict(passed=sum(by_id[c["id"]]["actual"] == "foodCandidate" for c in positive), total=len(positive)),
        confirmedHumanFoodFalsePasses=dict(passed=sum(by_id[c["id"]]["actual"] == "foodCandidate" for c in human), total=len(human)),
        familyCount=len(groups), familyPasses=sum(all(c["passed"] for c in checked if c["group"] == group) for group in groups))


def compose(manifest_path, semantic_path, diagnostic_path, native_revision, output):
    policy, policy_hash = read_policy()
    v2_policy, _ = read_v2_policy()
    v3_policy, v3_hash = read_v3_policy()
    config, config_hash = read_config(BASE / "siglip-probe.json")
    manifest, digest = read_manifest(manifest_path)
    semantic = json.loads(Path(semantic_path).read_bytes())
    artifact = dict(repository=config["repository"], revision=config["revision"],
        weightSHA256=config["weightSHA256"], configurationSHA256=config_hash,
        supportingFiles=supporting_pins(config))
    if (manifest.get("modelArtifact") != artifact or manifest.get("policyVersion") != config["policyVersion"]
        or type(manifest.get("requestRevision")) is not int
        or type(semantic.get("schemaVersion")) is not int or type(semantic.get("requestRevision")) is not int
        or manifest.get("requestRevision") != config["requestRevision"]
        or not grade(manifest, digest, semantic)["completed"]):
        raise ValueError("Wrong complete semantic source or model artifact")
    diagnostics = json.loads(Path(diagnostic_path).read_bytes())
    if (not isinstance(native_revision, str) or not re.fullmatch(r"[0-9a-f]{40}", native_revision)
        or diagnostics.get("diagnosticSourceRevision") != native_revision):
        raise ValueError("Native source revision must match the verified run checkout")
    # Reuse the raw validator, without replacing any archived summary.
    with tempfile.TemporaryDirectory() as directory:
        summarize(manifest_path, diagnostic_path, Path(directory) / "validated.json")
    native = {row["id"]: {p["profile"]: p for p in row["sceneDiagnostics"]} for row in diagnostics["cases"]}
    observed = {row["id"]: row for row in semantic["cases"]}
    baseline_rows, upper_rows = [], []
    for case in manifest["cases"]:
        profiles = native[case["id"]]
        # Reject incomplete and bounded/truncated evidence for every profile. The
        # 1024 profile remains diagnostic only and never affects the decision.
        for profile in profiles.values():
            for stage in profile["stages"]:
                if not stage["resultsAvailable"] or stage["observationsTruncated"] or any(
                    o["pointsTruncated"] for o in stage["observations"]):
                    raise ValueError("Unavailable or truncated native evidence")
        actual = observed[case["id"]]
        values = actual.get("diagnostics", {}).get("promptLogits", {})
        if set(values) != {p["id"] for p in config["prompts"]} or any(
            type(v) not in {int, float} or not math.isfinite(v) for v in values.values()):
            raise ValueError("Missing or invalid exact semantic observations")
        food = max(values[p["id"]] for p in config["prompts"] if p["group"] == "food")
        margin = food - max(values[p["id"]] for p in config["prompts"] if p["group"] == "nonFood")
        context = max(values[k] for k in v2_policy["contextPromptIds"]) - food
        human = max(values[k] for k in v3_policy["humanRiskPromptIds"]) - max(
            values[k] for k in v3_policy["humanSafePromptIds"])
        full, upper = scene(profiles[policy["baselineProfile"]]), scene(profiles[policy["additionalProfile"]])
        outcome, reason = evaluate(margin, context, full, case["isScreenshot"])
        baseline = abstain(outcome, human)
        if baseline != outcome:
            reason = "human_semantic_context"
        row = dict(id=case["id"], sha256=case["sha256"],
            result=dict(outcome=baseline, reason=reason, labels=[],
                foodConfidence=1 / (1 + math.exp(-max(-80, min(80, margin)))),
                durationMilliseconds=actual["result"]["durationMilliseconds"] + full["durationMilliseconds"]),
            diagnostics=dict(foodMargin=margin, contextMargin=context, humanMargin=human, scene=full))
        baseline_rows.append(row)
        additional = copy.deepcopy(row)
        additional["diagnostics"]["upperScene"] = upper
        additional["result"]["durationMilliseconds"] += upper["durationMilliseconds"]
        if baseline == "foodCandidate" and any(upper[k] > 0 for k in COUNT_FIELDS.values()):
            additional["result"].update(outcome="uncertain", reason="upper_body_geometry")
        upper_rows.append(additional)
    gate_results = {"v3": gate_checks(manifest["cases"], baseline_rows), "v4": gate_checks(manifest["cases"], upper_rows)}
    root = Path(output)
    root.mkdir(parents=True, exist_ok=False)
    common = dict(schemaVersion=1, completed=True, requestRevision=0, modelArtifact=artifact,
        operatingSystem="semantic: " + semantic["operatingSystem"] + "; native: " + diagnostics["operatingSystem"],
        preprocessing="Pinned semantic 224px processor; ImageIO full/upper 512px geometry; 1024px excluded from routing",
        generatedAt=diagnostics["generatedAt"], sourceSemanticSHA256=file_digest(semantic_path),
        sourceDiagnosticSHA256=file_digest(diagnostic_path), diagnosticSourceRevision=native_revision,
        execution="offline composition of saved observations; no new model/detector execution",
        timingQualification="Sum of measured components; not end-to-end or physical-device latency",
        physicalDeviceQualified=False, automaticUploadQualified=False)
    summaries = {}
    for name, version, configuration_hash, rows in [
        ("v3", v3_policy["policyVersion"], v3_hash, baseline_rows),
        ("v4", policy["policyVersion"], policy_hash, upper_rows)]:
        proposed = {**manifest, "dataset": manifest["dataset"] + "-" + name,
            "policyVersion": version, "decisionArtifact": {"configurationSHA256": configuration_hash}}
        path = root / (name + "-manifest.json")
        write_new(path, proposed)
        report = {**common, "manifestSHA256": file_digest(path), "policyVersion": version,
            "decisionArtifact": proposed["decisionArtifact"], "cases": rows}
        write_new(root / (name + "-results.json"), report)
        summaries[name] = grade(proposed, file_digest(path), report)
        write_new(root / (name + "-summary.json"), summaries[name])
    changes = [dict(id=a["id"], before=a["result"]["outcome"], after=b["result"]["outcome"],
        reason=b["result"]["reason"]) for a, b in zip(baseline_rows, upper_rows)
        if a["result"]["outcome"] != b["result"]["outcome"]]
    comparison = dict(schemaVersion=1, completed=True, manifestSHA256=digest,
        sourceSemanticSHA256=common["sourceSemanticSHA256"], sourceDiagnosticSHA256=common["sourceDiagnosticSHA256"],
        diagnosticSourceRevision=native_revision, v3ConfigurationSHA256=v3_hash, v4ConfigurationSHA256=policy_hash,
        changes=changes, gateChecks=gate_results, automaticUploadQualified=False, physicalDeviceQualified=False,
        suites={key: dict(caseCount=len(rows), familyCount=len({c["group"] for c in rows}))
            for key in sorted({c["layer"] + "/" + c["split"] for c in manifest["cases"]})
            for rows in [[c for c in manifest["cases"] if c["layer"] + "/" + c["split"] == key]]})
    write_new(root / "comparison.json", comparison)
    return comparison


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["manifest", "semantic_report", "diagnostic_report", "native_revision", "new_output_directory"]:
        parser.add_argument(name)
    args = parser.parse_args()
    result = compose(args.manifest, args.semantic_report, args.diagnostic_report, args.native_revision, args.new_output_directory)
    print("Composed fixed v3/v4 comparison; changed cases:", len(result["changes"]), "; no device qualification")
