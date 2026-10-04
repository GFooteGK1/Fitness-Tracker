"""Contract tests need no model, torch, Pillow, network or paid inference."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from compare import compare
from score import read_manifest, grade
from siglip_probe import read_config, decide, verify_supporting, supporting_pins


class SiglipContracts(unittest.TestCase):
    def setUp(self):
        self.config, self.config_hash = read_config(Path(__file__).with_name("siglip-probe.json"))
        self.manifest, self.digest = read_manifest(Path(__file__).with_name("fixtures.siglip2-development-v1.json"))

    def logits(self, food, nonfood, risk, safe):
        values = dict(food=food, nonFood=nonfood, risk=risk, safe=safe)
        return [values[p["group"]] for p in self.config["prompts"]]

    def report(self):
        return dict(schemaVersion=1, completed=True, manifestSHA256=self.digest, modelArtifact=self.manifest["modelArtifact"],
            policyVersion=self.manifest["policyVersion"], requestRevision=0, operatingSystem="mock contract test",
            generatedAt="2026-10-04T00:00:00Z", preprocessing="mock, no inference",
            cases=[dict(id=c["id"], sha256=c["sha256"], result=dict(outcome="nonFood", reason="mock", durationMilliseconds=1))
                   for c in self.manifest["cases"]])

    def test_abstention_and_margin_boundaries(self):
        for values, outcome in [((2, 1, 0, 1), "foodCandidate"), ((0, 1, 0, 1), "nonFood"),
                                ((.5, 0, 0, 1), "uncertain"), ((2, 0, 1, 1), "uncertain")]:
            self.assertEqual(decide(self.config, self.logits(*values))[0]["outcome"], outcome)
        self.assertEqual(decide(self.config, self.logits(10, 0, 0, 1), True)[0]["reason"], "screenshot")

    def test_invalid_logits_rejected(self):
        for logits in [[], [float("nan")] * 24, [float("inf")] * 24]:
            with self.assertRaises(ValueError): decide(self.config, logits)

    def test_supporting_artifact_change_rejected(self):
        import hashlib
        data = b"known processor bytes"
        blob = b"blob " + str(len(data)).encode("ascii") + b"\0" + data
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "processor.json"; path.write_bytes(data)
            pins = {"processor.json": {"algorithm": "gitBlobSHA1", "hash": hashlib.sha1(blob).hexdigest()}}
            self.assertEqual(verify_supporting(root, pins)["processor.json"], hashlib.sha256(data).hexdigest())
            path.write_bytes(b"changed bytes")
            with self.assertRaises(ValueError): verify_supporting(root, pins)
            path.write_bytes(data)
            lfs_pins = {"processor.json": {"algorithm": "sha256", "hash": hashlib.sha256(data).hexdigest()}}
            self.assertEqual(verify_supporting(root, lfs_pins)["processor.json"], hashlib.sha256(data).hexdigest())
            path.write_bytes(b"changed LFS bytes")
            with self.assertRaises(ValueError): verify_supporting(root, lfs_pins)
        self.assertEqual(self.manifest["modelArtifact"]["supportingFiles"], supporting_pins(self.config))

    def test_config_pin_and_finite_margins(self):
        self.assertEqual(self.manifest["modelArtifact"]["configurationSHA256"], self.config_hash)
        for mutation in [dict(revision="z" * 40), dict(weightSHA256="x" * 64), dict(threads=0),
                         dict(candidateMargin=float("nan")), dict(nonFoodMargin=20)]:
            with tempfile.TemporaryDirectory() as root:
                path = Path(root) / "config.json"; path.write_text(json.dumps({**self.config, **mutation}), encoding="utf-8")
                with self.assertRaises(ValueError): read_config(path)

    def test_model_and_prompt_provenance_required(self):
        for artifact in [None, {**self.manifest["modelArtifact"], "revision": "0" * 40},
                         {**self.manifest["modelArtifact"], "configurationSHA256": "0" * 64}]:
            report = self.report(); report["modelArtifact"] = artifact
            with self.assertRaises(ValueError): grade(self.manifest, self.digest, report)

    def test_real_and_synthetic_denominators_separate(self):
        result = grade(self.manifest, self.digest, self.report())
        self.assertEqual(result["suites"]["publicReference/development"]["count"], 26)
        self.assertEqual(result["suites"]["synthetic/development"]["count"], 6)
        self.assertFalse(result["automaticUploadQualified"])

    def test_comparison_rejects_changed_rubric_and_incomplete_reports(self):
        left = copy.deepcopy(self.manifest); left["cases"] = left["cases"][:21]
        report = self.report(); baseline = copy.deepcopy(report); baseline["cases"] = baseline["cases"][:21]
        result = compare(left, self.digest, baseline, self.manifest, self.digest, report)
        self.assertEqual(len(result["commonCaseIds"]), 21)
        changed = copy.deepcopy(self.manifest); changed["cases"][0]["sensitive"] = True
        with self.assertRaises(ValueError): compare(left, self.digest, baseline, changed, self.digest, report)
        report["cases"].pop()
        with self.assertRaises(ValueError): compare(left, self.digest, baseline, self.manifest, self.digest, report)


if __name__ == "__main__": unittest.main()
