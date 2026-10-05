"""Validate raw diagnostic receipts; absence of a detection never means a safe scene."""
import argparse
import json
import math
from pathlib import Path
from score import read_manifest
from siglip_probe import file_digest
from encoder_export import write_new

PROFILES = {"full-body-512": (512, False), "full-body-1024": (1024, False), "upper-body-512": (512, True)}
STAGES = {"face", "humanRectangle", "bodyPose", "handPose"}


def integer(value, maximum=10_000):
    return type(value) is int and 0 <= value <= maximum


def finite(value):
    return type(value) in {int, float} and math.isfinite(value)


def validate_observation(row, pose):
    if (not isinstance(row, dict) or not finite(row.get("confidence")) or not 0 <= row["confidence"] <= 1
        or type(row.get("accepted")) is not bool or not integer(row.get("pointCount"))
        or not integer(row.get("acceptedPointCount"), row["pointCount"])
        or type(row.get("pointsTruncated")) is not bool or not isinstance(row.get("points"), list)):
        raise ValueError("Malformed raw observation")
    points = row["points"]
    if len(points) != min(row["pointCount"], 32) or row["pointsTruncated"] != (row["pointCount"] > 32):
        raise ValueError("Wrong point bounds/truncation")
    for p in points:
        if not isinstance(p, dict) or not all(finite(p.get(k)) for k in ["confidence", "x", "y"]) or not 0 <= p["confidence"] <= 1:
            raise ValueError("Invalid native point")
    accepted_points = sum(p["confidence"] >= .2 for p in points)
    if not accepted_points <= row["acceptedPointCount"] <= accepted_points + row["pointCount"] - len(points):
        raise ValueError("Wrong accepted point count")
    rect = row.get("rectangle")
    if pose:
        if rect is not None: raise ValueError("Unexpected pose rectangle")
        accepted = row["acceptedPointCount"] >= 2
    else:
        if row["pointCount"] or not isinstance(rect, list) or len(rect) != 4 or not all(finite(v) for v in rect):
            raise ValueError("Invalid detector rectangle")
        accepted = row["confidence"] >= .2
    if row["accepted"] != accepted: raise ValueError("Changed observation filtering")


def stage_reason(row):
    if (not isinstance(row, dict) or row.get("stage") not in STAGES
        or type(row.get("resultsAvailable")) is not bool or not integer(row.get("rawCount"))
        or not integer(row.get("acceptedCount"), row["rawCount"])
        or type(row.get("observationsTruncated")) is not bool or not isinstance(row.get("observations"), list)):
        raise ValueError("Malformed stage evidence")
    observations = row["observations"]
    if (len(observations) != min(row["rawCount"], 64) or row["observationsTruncated"] != (row["rawCount"] > 64)
        or (not row["resultsAvailable"] and row["rawCount"])):
        raise ValueError("Wrong observation bounds/truncation")
    for observation in observations: validate_observation(observation, row["stage"] in {"bodyPose", "handPose"})
    accepted = sum(o["accepted"] for o in observations)
    if not accepted <= row["acceptedCount"] <= accepted + row["rawCount"] - len(observations):
        raise ValueError("Wrong accepted observation count")
    if not row["resultsAvailable"]: return "results_unavailable"
    if not row["rawCount"]: return "no_raw_observations"
    if row["acceptedCount"]: return "retained_by_frozen_filter"
    return "confidence_or_point_filter_rejected"


def summarize(manifest_path, diagnostic_path, output):
    manifest, digest = read_manifest(manifest_path)
    report = json.loads(Path(diagnostic_path).read_bytes())
    if (type(report.get("schemaVersion")) is not int or report.get("schemaVersion") != 1
        or report.get("completed") is not True or report.get("manifestSHA256") != digest
        or report.get("diagnosticVersion") != "vision-geometry-diagnostics-v1"
        or report.get("policyVersion") != "vision-geometry-diagnostics-v1"
        or type(report.get("requestRevision")) is not int or report.get("requestRevision") != 0
        or report.get("sceneRevisions") != {"face": 3, "humanRectangle": 2, "bodyPose": 1, "handPose": 1}
        or any(type(v) is not int for v in report.get("sceneRevisions", {}).values())
        or any(type(report.get(k)) is not int for k in ["diagnosticMaximumObservations", "diagnosticMaximumPoints",
            "sceneMinimumPosePoints", "sceneMaximumHandCount"])
        or report.get("diagnosticMaximumObservations") != 64 or report.get("diagnosticMaximumPoints") != 32
        or not finite(report.get("sceneMinimumConfidence")) or report.get("sceneMinimumConfidence") != .2
        or report.get("sceneMinimumPosePoints") != 2
        or report.get("sceneMaximumHandCount") != 4 or not report.get("operatingSystem") or not report.get("generatedAt")):
        raise ValueError("Incomplete or changed diagnostic provenance")
    if report.get("preprocessing") != "ImageIO oriented thumbnails; diagnostic profiles at 512 and 1024 pixels":
        raise ValueError("Changed diagnostic preprocessing provenance")
    revision = report.get("diagnosticSourceRevision")
    if revision is not None and (not isinstance(revision, str) or len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision)):
        raise ValueError("Invalid diagnostic source revision")
    expected = {c["id"]: c["sha256"] for c in manifest["cases"]}; seen = set(); rows = []
    for case in report.get("cases", []):
        if case.get("id") not in expected or case["id"] in seen or case.get("sha256") != expected[case["id"]]:
            raise ValueError("Unknown, duplicate or changed diagnostic case")
        seen.add(case["id"]); profiles = case.get("sceneDiagnostics", []); observed = set(); summaries = []
        for profile in profiles:
            name = profile.get("profile")
            if name not in PROFILES or name in observed: raise ValueError("Wrong diagnostic profile")
            observed.add(name); maximum, upper = PROFILES[name]
            if (profile.get("completed") is not True or profile.get("maximumPixels") != maximum
                or profile.get("humanUpperBodyOnly") is not upper or not integer(profile.get("width"), maximum)
                or not integer(profile.get("height"), maximum) or min(profile["width"], profile["height"]) < 1
                or profile.get("orientation") != "up after ImageIO transform" or not integer(profile.get("durationMilliseconds"), 86_400_000)):
                raise ValueError("Incomplete or changed diagnostic preprocessing")
            stages = profile.get("stages", [])
            if len(stages) != 4 or {s.get("stage") for s in stages} != STAGES: raise ValueError("Missing diagnostic stage")
            summaries.append(dict(profile=name, width=profile["width"], height=profile["height"],
                stages=[dict(stage=s["stage"], rawCount=s["rawCount"], acceptedCount=s["acceptedCount"],
                    observationsTruncated=s["observationsTruncated"], reason=stage_reason(s)) for s in stages]))
        if observed != set(PROFILES): raise ValueError("Missing diagnostic profile")
        rows.append(dict(id=case["id"], sha256=case["sha256"], profiles=summaries))
    if seen != set(expected): raise ValueError("Missing diagnostic case")
    result = dict(schemaVersion=1, completed=True, diagnosticsOnly=True, automaticUploadQualified=False,
        manifestSHA256=digest, sourceDiagnosticSHA256=file_digest(diagnostic_path), diagnosticVersion=report["diagnosticVersion"],
        diagnosticSourceRevision=revision, operatingSystem=report["operatingSystem"], cases=rows)
    write_new(output, result)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["manifest", "diagnostic_report", "new_summary"]: parser.add_argument(name)
    args = parser.parse_args(); summarize(args.manifest, args.diagnostic_report, args.new_summary)
