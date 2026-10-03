"""Offline grader for actual LocalFoodEval output. No model/provider calls."""
import argparse
import hashlib
import json
import math
from pathlib import Path

OUTCOMES = {"foodCandidate", "nonFood", "uncertain", "error"}


def read_manifest(path):
    data = Path(path).read_bytes()
    manifest = json.loads(data)
    validate_manifest(manifest)
    return manifest, hashlib.sha256(data).hexdigest()


def validate_manifest(manifest):
    if manifest.get("schemaVersion") != 1 or not 1 <= len(manifest.get("cases", [])) <= 1000:
        raise ValueError("Invalid manifest schema or case count")
    ids, hashes, groups = set(), set(), {}
    for case in manifest["cases"]:
        identifier, digest = case.get("id"), case.get("sha256", "")
        path = Path(case.get("file", ""))
        if not isinstance(identifier, str) or not identifier or identifier in ids:
            raise ValueError("Duplicate or missing case ID")
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest) or digest in hashes:
            raise ValueError("Invalid or duplicate image digest")
        if not case.get("file") or path.is_absolute() or ".." in path.parts or "\\" in case["file"] or ":" in case["file"]:
            raise ValueError("Unsafe image path")
        if case.get("expectedPresence") not in {"food", "nonFood"}:
            raise ValueError("Missing frozen expected answer")
        if any(type(case.get(key)) is not bool for key in ["clearMeal", "sensitive", "isScreenshot"]):
            raise ValueError("Invalid rubric flags")
        if case["clearMeal"] and case["expectedPresence"] != "food":
            raise ValueError("Clear meal must contain food")
        if case.get("split") not in {"development", "heldOut"} or case.get("layer") not in {"publicReference", "synthetic", "privateDevice"}:
            raise ValueError("Invalid split or evidence layer")
        if not case.get("group") or not case.get("category"):
            raise ValueError("Missing group or category")
        if groups.setdefault(case["group"], case["split"]) != case["split"]:
            raise ValueError("Related images cross development and holdout")
        ids.add(identifier); hashes.add(digest)


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def metrics(cases):
    food = [c for c in cases if c["expectedPresence"] == "food"]
    meals = [c for c in cases if c["clearMeal"]]
    nonfood = [c for c in cases if c["expectedPresence"] == "nonFood"]
    sensitive = [c for c in cases if c["sensitive"] or c["isScreenshot"]]
    passed = lambda c: c["outcome"] == "foodCandidate"
    ratio = lambda n, d: n / d if d else None
    times = [c["durationMilliseconds"] for c in cases if c["durationMilliseconds"] is not None]
    return {
        "count": len(cases),
        "foodRecall": {"passed": sum(map(passed, food)), "total": len(food), "rate": ratio(sum(map(passed, food)), len(food))},
        "clearMealRecall": {"passed": sum(map(passed, meals)), "total": len(meals), "rate": ratio(sum(map(passed, meals)), len(meals))},
        "nonFoodFalsePasses": {"passed": sum(map(passed, nonfood)), "total": len(nonfood), "rate": ratio(sum(map(passed, nonfood)), len(nonfood))},
        "sensitiveFalsePasses": {"passed": sum(map(passed, sensitive)), "total": len(sensitive)},
        "uncertain": sum(c["outcome"] == "uncertain" for c in cases),
        "errorsIncludingMissing": sum(c["outcome"] == "error" for c in cases),
        "timing": {"count": len(times), "p50Milliseconds": percentile(times, .5), "p95Milliseconds": percentile(times, .95)},
    }


def grade(manifest, manifest_digest, report):
    validate_manifest(manifest)
    if (report.get("schemaVersion") != 1 or report.get("manifestSHA256") != manifest_digest
            or report.get("policyVersion") != manifest["policyVersion"]
            or report.get("requestRevision") != manifest["requestRevision"]
            or not report.get("operatingSystem") or not report.get("preprocessing")
            or not report.get("generatedAt") or type(report.get("completed")) is not bool):
        raise ValueError("Report provenance does not match frozen evaluation")
    expected = {c["id"]: c for c in manifest["cases"]}
    actual = {}
    for case in report.get("cases", []):
        identifier = case.get("id")
        if identifier not in expected or identifier in actual or case.get("sha256") != expected[identifier]["sha256"]:
            raise ValueError("Unknown/duplicate case or wrong image hash")
        result = case.get("result", {})
        duration = result.get("durationMilliseconds")
        if (result.get("outcome") not in OUTCOMES or not isinstance(result.get("reason"), str)
                or not result["reason"] or type(duration) is not int or duration < 0):
            raise ValueError("Invalid classifier result")
        actual[identifier] = result
    graded = []
    for identifier, case in expected.items():
        result = actual.get(identifier, {"outcome": "error", "reason": "missing_result", "durationMilliseconds": None})
        tags = []
        if case["expectedPresence"] == "food" and result["outcome"] != "foodCandidate":
            tags.append("food_miss")
        if case["clearMeal"] and result["outcome"] != "foodCandidate":
            tags.append("clear_meal_miss")
        if case["expectedPresence"] == "nonFood" and result["outcome"] == "foodCandidate":
            tags.append("non_food_false_pass")
        if (case["sensitive"] or case["isScreenshot"]) and result["outcome"] == "foodCandidate":
            tags.append("sensitive_false_pass")
        if result["outcome"] == "error":
            tags.append("execution_error")
        graded.append({**case, "outcome": result["outcome"], "reason": result["reason"],
            "durationMilliseconds": result["durationMilliseconds"], "failureTags": tags})
    # Keep synthetic data, public references, private device proof and held-out results separate.
    suites = {}
    for c in graded:
        suites.setdefault(c["layer"] + "/" + c["split"], []).append(c)
    return {
        "schemaVersion": 1, "dataset": manifest["dataset"], "manifestSHA256": manifest_digest,
        "policyVersion": report["policyVersion"], "operatingSystem": report["operatingSystem"],
        "generatedAt": report["generatedAt"],
        "completed": report["completed"] and len(actual) == len(expected),
        "requestRevision": report["requestRevision"], "preprocessing": report["preprocessing"],
        "suites": {name: {**metrics(rows), "categories": {category: metrics([c for c in rows if c["category"] == category])
            for category in sorted({c["category"] for c in rows})}} for name, rows in suites.items()},
        "failures": [{"id": c["id"], "outcome": c["outcome"], "reason": c["reason"], "tags": c["failureTags"]}
            for c in graded if c["failureTags"]],
        "coverageGaps": manifest.get("coverageGaps", []),
        "automaticUploadQualified": False,
        "qualificationReason": "Observation harness only. Representative held-out and physical-device privacy/reliability qualification require separate review.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest"); parser.add_argument("report"); parser.add_argument("output")
    args = parser.parse_args()
    manifest, digest = read_manifest(args.manifest)
    summary = grade(manifest, digest, json.loads(Path(args.report).read_text()))
    with Path(args.output).open("x", encoding="utf-8") as output:
        json.dump(summary, output, indent=2); output.write("\n")
    print(json.dumps(summary["suites"], indent=2))
