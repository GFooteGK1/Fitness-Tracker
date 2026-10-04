"""Compare pinned reports on exactly the same pixels and frozen rubric."""
import argparse
import json
from pathlib import Path
from score import grade, read_manifest, metrics

RUBRIC = ["id", "sha256", "expectedPresence", "clearMeal", "sensitive", "isScreenshot", "group", "category", "split", "layer"]


def compare(baseline_manifest, baseline_digest, baseline, candidate_manifest, candidate_digest, candidate):
    left_summary = grade(baseline_manifest, baseline_digest, baseline)
    right_summary = grade(candidate_manifest, candidate_digest, candidate)
    if not left_summary["completed"] or not right_summary["completed"]:
        raise ValueError("Incomplete report; grade partial evidence separately")
    candidate_cases = {c["id"]: c for c in candidate_manifest["cases"]}
    for case in baseline_manifest["cases"]:
        peer = candidate_cases.get(case["id"], {})
        if any(case[key] != peer.get(key) for key in RUBRIC):
            raise ValueError("Comparison changes pixels or frozen rubric")
    def rows(report):
        actual = {c["id"]: c["result"] for c in report["cases"]}
        return [{**c, **actual[c["id"]]} for c in baseline_manifest["cases"]]
    return dict(schemaVersion=1, baselineManifestSHA256=baseline_digest, candidateManifestSHA256=candidate_digest,
        baselinePolicy=baseline["policyVersion"], candidatePolicy=candidate["policyVersion"],
        commonCaseIds=[c["id"] for c in baseline_manifest["cases"]],
        baseline=metrics(rows(baseline)), candidate=metrics(rows(candidate)),
        candidateBroaderSuites=right_summary["suites"], automaticUploadQualified=False,
        limitations="Development cases only. Timing is from different hardware, OS and preprocessing; do not compare latency. No held-out or physical-device qualification.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["baseline_manifest", "baseline_report", "candidate_manifest", "candidate_report", "output"]:
        parser.add_argument(name)
    args = parser.parse_args()
    left, left_hash = read_manifest(args.baseline_manifest); right, right_hash = read_manifest(args.candidate_manifest)
    result = compare(left, left_hash, json.loads(Path(args.baseline_report).read_bytes()),
        right, right_hash, json.loads(Path(args.candidate_report).read_bytes()))
    with Path(args.output).open("x", encoding="utf-8") as handle: json.dump(result, handle, indent=2)
    print(json.dumps({"baseline": result["baseline"], "candidate": result["candidate"]}, indent=2))
