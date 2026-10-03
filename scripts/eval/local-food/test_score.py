import copy
import hashlib
import tempfile
import unittest
import subprocess
import sys
import json
from pathlib import Path
from score import grade, read_manifest, validate_manifest
from fetch import image_path, verify, PublicMediaRedirects
import urllib.request


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.manifest, self.digest = read_manifest(Path(__file__).with_name("fixtures.json"))
        self.report = dict(schemaVersion=1, manifestSHA256=self.digest, policyVersion=self.manifest["policyVersion"],
            requestRevision=1, operatingSystem="test fixture, no real inference", preprocessing="test fixture",
            generatedAt="2026-10-03T00:00:00Z", completed=True,
            cases=[dict(id=c["id"], sha256=c["sha256"], result=dict(outcome="foodCandidate" if c["expectedPresence"] == "food" else "nonFood",
                reason="mock_result_for_grader_test", durationMilliseconds=100)) for c in self.manifest["cases"]])

    def evaluate(self):
        return grade(self.manifest, self.digest, self.report)

    def test_frozen_dataset_and_no_qualification_from_perfect_development(self):
        result = self.evaluate()
        suite = result["suites"]["publicReference/development"]
        self.assertEqual((suite["count"], suite["foodRecall"]["total"], suite["nonFoodFalsePasses"]["total"]), (21, 19, 2))
        self.assertEqual(suite["foodRecall"]["rate"], 1)
        self.assertFalse(result["automaticUploadQualified"])
        self.assertTrue(result["coverageGaps"])

    def test_missing_error_and_uncertain_meals_stay_in_denominator(self):
        clear = [c["id"] for c in self.manifest["cases"] if c["clearMeal"]]
        self.report["cases"] = [c for c in self.report["cases"] if c["id"] != clear[0]]
        for identifier, outcome in zip(clear[1:3], ["error", "uncertain"]):
            next(c for c in self.report["cases"] if c["id"] == identifier)["result"]["outcome"] = outcome
        suite = self.evaluate()["suites"]["publicReference/development"]
        self.assertEqual(suite["clearMealRecall"]["total"], len(clear))
        self.assertEqual(suite["clearMealRecall"]["passed"], len(clear) - 3)
        self.assertEqual(suite["errorsIncludingMissing"], 2)
        self.assertEqual(suite["timing"]["count"], 20)
        self.assertFalse(self.evaluate()["completed"])

    def test_nonfood_and_sensitive_passes_are_visible(self):
        next(c for c in self.report["cases"] if c["id"] == "public-20")["result"]["outcome"] = "foodCandidate"
        summary = self.evaluate()
        suite = summary["suites"]["publicReference/development"]
        self.assertEqual(suite["nonFoodFalsePasses"]["passed"], 1)
        self.assertIn("sensitive_false_pass", next(c for c in summary["failures"] if c["id"] == "public-20")["tags"])

    def test_provenance_and_case_integrity_rejected(self):
        for mutation in [lambda r: r.update(manifestSHA256="wrong"), lambda r: r.update(policyVersion="wrong"),
                         lambda r: r["cases"].append(r["cases"][0]), lambda r: r["cases"][0].update(sha256="wrong"),
                         lambda r: r["cases"][0].update(id="unknown"), lambda r: r["cases"][0]["result"].update(durationMilliseconds=-1)]:
            report = copy.deepcopy(self.report); mutation(report)
            with self.assertRaises(ValueError):
                grade(self.manifest, self.digest, report)

    def test_group_leakage_duplicate_pixels_and_unsafe_paths_rejected(self):
        for mutation in [lambda m: m["cases"][5].update(split="heldOut"),
                         lambda m: m["cases"][0].update(file="../private.jpg"),
                         lambda m: m["cases"][0].update(sha256=m["cases"][1]["sha256"])]:
            manifest = copy.deepcopy(self.manifest); mutation(manifest)
            with self.assertRaises(ValueError): validate_manifest(manifest)

    def test_splits_and_evidence_layers_not_pooled_and_empty_rate_is_null(self):
        self.manifest["cases"][-1].update(split="heldOut", layer="synthetic")
        result = self.evaluate()
        self.assertEqual(set(result["suites"]), {"publicReference/development", "synthetic/heldOut"})
        self.assertIsNone(result["suites"]["synthetic/heldOut"]["foodRecall"]["rate"])

    def test_fetch_hash_mismatch_and_path_escape_rejected(self):
        data = b"fixture"
        verify(data, hashlib.sha256(data).hexdigest())
        with self.assertRaises(ValueError): verify(data, "0" * 64)
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError): image_path(root, "../private.jpg")

    def test_redirect_to_unapproved_host_rejected_before_request(self):
        request = urllib.request.Request("https://upload.wikimedia.org/reference.jpg")
        for destination in ["https://example.com/image.jpg", "http://upload.wikimedia.org/image.jpg",
                            "https://user:password@upload.wikimedia.org/image.jpg"]:
            with self.assertRaises(ValueError):
                PublicMediaRedirects().redirect_request(request, None, 302, "redirect", {}, destination)

    def test_cli_grades_interrupted_empty_report_and_preserves_existing_output(self):
        self.report.update(completed=False, cases=[])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); report = root / "partial.json"; summary = root / "summary.json"
            report.write_text(json.dumps(self.report), encoding="utf-8")
            command = [sys.executable, "-B", str(Path(__file__).with_name("score.py")),
                str(Path(__file__).with_name("fixtures.json")), str(report), str(summary)]
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            saved = summary.read_bytes(); result = json.loads(saved)
            suite = result["suites"]["publicReference/development"]
            self.assertEqual(suite["errorsIncludingMissing"], 21)
            self.assertEqual(suite["foodRecall"]["rate"], 0)
            self.assertFalse(result["completed"])
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(summary.read_bytes(), saved)


if __name__ == "__main__":
    unittest.main()
