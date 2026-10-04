"""Explicit mock receipts test contracts, not detector quality."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from diagnose_scene import stage_reason, summarize, PROFILES, STAGES
from human_backup import abstain, replay
from score import read_manifest, grade
from encoder_export import write_new
from compose_scene import compose

BASE = Path(__file__).parent


def stage(name="face", available=True):
    return dict(stage=name, resultsAvailable=available, rawCount=0, acceptedCount=0,
        observationsTruncated=False, observations=[])


class DiagnosticContracts(unittest.TestCase):
    def test_raw_absence_filtering_and_unavailable_are_distinct(self):
        self.assertEqual(stage_reason(stage()), "no_raw_observations")
        self.assertEqual(stage_reason(stage(available=False)), "results_unavailable")
        row = {**stage(), "rawCount": 1, "observations": [dict(confidence=.1, rectangle=[0, 0, 1, 1],
            pointCount=0, acceptedPointCount=0, pointsTruncated=False, points=[], accepted=False)]}
        self.assertEqual(stage_reason(row), "confidence_or_point_filter_rejected")
        changed = copy.deepcopy(row); changed["observations"][0]["accepted"] = True
        with self.assertRaises(ValueError): stage_reason(changed)
        changed = copy.deepcopy(row); changed["observations"][0]["confidence"] = float("nan")
        with self.assertRaises(ValueError): stage_reason(changed)
        changed = copy.deepcopy(row); changed["rawCount"] = True
        with self.assertRaises(ValueError): stage_reason(changed)

    def test_complete_mock_receipt_identity_and_profile_contracts(self):
        manifest, digest = read_manifest(BASE / "fixtures.siglip2-development-v1.json")
        profiles = [dict(profile=name, maximumPixels=maximum, humanUpperBodyOnly=upper, width=maximum,
            height=maximum, orientation="up after ImageIO transform", completed=True, reason="MOCK only",
            durationMilliseconds=1, stages=[stage(s) for s in sorted(STAGES)]) for name, (maximum, upper) in PROFILES.items()]
        report = dict(schemaVersion=1, completed=True, manifestSHA256=digest, diagnosticVersion="vision-geometry-diagnostics-v1",
            policyVersion="vision-geometry-diagnostics-v1", requestRevision=0,
            preprocessing="ImageIO oriented thumbnails; diagnostic profiles at 512 and 1024 pixels",
            sceneRevisions=dict(face=3, humanRectangle=2, bodyPose=1, handPose=1),
            diagnosticMaximumObservations=64, diagnosticMaximumPoints=32, sceneMinimumConfidence=.2,
            sceneMinimumPosePoints=2, sceneMaximumHandCount=4, operatingSystem="MOCK, no detector execution",
            generatedAt="2026-10-04T00:00:00Z", cases=[dict(id=c["id"], sha256=c["sha256"], sceneDiagnostics=profiles) for c in manifest["cases"]])
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); path = root / "raw.json"; write_new(path, report)
            result = summarize(BASE / "fixtures.siglip2-development-v1.json", path, root / "summary.json")
            self.assertFalse(result["automaticUploadQualified"])
            with self.assertRaises(FileExistsError): summarize(BASE / "fixtures.siglip2-development-v1.json", path, root / "summary.json")
            changed = copy.deepcopy(report); changed["cases"][0]["sceneDiagnostics"].pop()
            path.write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaises(ValueError): summarize(BASE / "fixtures.siglip2-development-v1.json", path, root / "missing.json")
            changed = copy.deepcopy(report); changed["cases"][0]["sha256"] = "0" * 64
            path.write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaises(ValueError): summarize(BASE / "fixtures.siglip2-development-v1.json", path, root / "changed.json")
            path.write_text(json.dumps(report), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Scene provenance"):
                compose(BASE / "fixtures.siglip2-development-v1.json", BASE / "results/siglip2-windows-20261004/results.json",
                    path, root / "routing-manifest.json", root / "routing-results.json")

    def test_pose_thresholds_and_truncated_evidence(self):
        observation = dict(confidence=0, rectangle=None, pointCount=2, acceptedPointCount=2,
            pointsTruncated=False, points=[dict(confidence=.2, x=.1, y=.1) for _ in range(2)], accepted=True)
        row = {**stage("handPose"), "rawCount": 1, "acceptedCount": 1, "observations": [observation]}
        self.assertEqual(stage_reason(row), "retained_by_frozen_filter")
        rejected = copy.deepcopy(row)
        rejected["observations"][0].update(acceptedPointCount=1, accepted=False)
        rejected["observations"][0]["points"][1]["confidence"] = .1999
        rejected["acceptedCount"] = 0
        self.assertEqual(stage_reason(rejected), "confidence_or_point_filter_rejected")
        truncated = copy.deepcopy(row)
        truncated["observations"][0].update(pointCount=33, acceptedPointCount=33, pointsTruncated=True,
            points=[dict(confidence=.2, x=.1, y=.1)] * 32)
        self.assertEqual(stage_reason(truncated), "retained_by_frozen_filter")
        truncated["observations"][0]["pointsTruncated"] = False
        with self.assertRaises(ValueError): stage_reason(truncated)
        faces = {**stage(), "rawCount": 65, "acceptedCount": 65, "observationsTruncated": True,
            "observations": [dict(confidence=.2, rectangle=[0, 0, 1, 1], pointCount=0,
                acceptedPointCount=0, pointsTruncated=False, points=[], accepted=True)] * 64}
        self.assertEqual(stage_reason(faces), "retained_by_frozen_filter")
        faces["observationsTruncated"] = False
        with self.assertRaises(ValueError): stage_reason(faces)

    def test_human_backup_never_creates_a_candidate(self):
        for prior in ["foodCandidate", "uncertain", "nonFood", "error"]:
            for margin in [-10, -.001, 0, .001, 10]:
                actual = abstain(prior, margin)
                if actual == "foodCandidate": self.assertEqual(prior, "foodCandidate")
                if prior != "foodCandidate": self.assertEqual(actual, prior)
        self.assertEqual(abstain("foodCandidate", 0), "uncertain")
        with self.assertRaises(ValueError): abstain("foodCandidate", float("nan"))

    def test_archived_backup_restores_regression_and_preserves_source(self):
        source = BASE / "results/native-macos-37218964987"
        old_bytes = (source / "v2-results.json").read_bytes()
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            result = replay(source / "v2-manifest.json", source / "v2-results.json",
                BASE / "results/siglip2-windows-20261004/results.json", root / "m.json", root / "r.json")
            manifest, digest = read_manifest(root / "m.json")
            self.assertFalse(grade(manifest, digest, result)["automaticUploadQualified"])
            self.assertEqual(next(c for c in result["cases"] if c["id"] == "public-12")["result"]["outcome"], "uncertain")
            old = {c["id"]: c for c in json.loads(old_bytes)["cases"]}
            for c in result["cases"]:
                if c["result"]["outcome"] == "foodCandidate": self.assertEqual(old[c["id"]]["result"]["outcome"], "foodCandidate")
            self.assertEqual((source / "v2-results.json").read_bytes(), old_bytes)
            with self.assertRaises(ValueError): replay(source / "v2-manifest.json", source / "v2-results.json",
                BASE / "results/siglip2-windows-20261004/results.json", root / "m.json", root / "r.json")


if __name__ == "__main__": unittest.main()
