"""Mock policy/receipt contracts; no detector or model quality evidence."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from compose_upper import compose, gate_checks
from diagnose_scene import PROFILES, STAGES
from encoder_export import write_new
from score import read_manifest
from siglip_probe import read_config

BASE = Path(__file__).parent
REVISION = "a" * 40


def fixture(root):
    manifest, _ = read_manifest(BASE / "fixtures.siglip2-development-v1.json")
    manifest["cases"] = copy.deepcopy(manifest["cases"][:6])
    manifest["dataset"] = "MOCK-contracts-no-quality-evidence"
    manifest["labeler"] = "MOCK contract fixture"
    write_new(root / "manifest.json", manifest)
    _, digest = read_manifest(root / "manifest.json")
    config, _ = read_config(BASE / "siglip-probe.json")
    values = {p["id"]: (-2 if p["group"] in {"risk", "nonFood"} else 10) for p in config["prompts"]}
    semantic = dict(schemaVersion=1, completed=True, manifestSHA256=digest,
        policyVersion=manifest["policyVersion"], requestRevision=0, modelArtifact=manifest["modelArtifact"],
        operatingSystem="MOCK no model execution", preprocessing="MOCK", generatedAt="2026-10-05T00:00:00Z",
        cases=[dict(id=c["id"], sha256=c["sha256"], result=dict(outcome="foodCandidate", reason="MOCK", durationMilliseconds=1),
            diagnostics=dict(promptLogits=copy.deepcopy(values))) for c in manifest["cases"]])
    profiles = [dict(profile=name, maximumPixels=maximum, humanUpperBodyOnly=upper, width=maximum,
        height=maximum, orientation="up after ImageIO transform", completed=True, reason="MOCK",
        durationMilliseconds=1, stages=[dict(stage=s, resultsAvailable=True, rawCount=0, acceptedCount=0,
            observationsTruncated=False, observations=[]) for s in sorted(STAGES)]) for name, (maximum, upper) in PROFILES.items()]
    native = dict(schemaVersion=1, completed=True, manifestSHA256=digest,
        diagnosticVersion="vision-geometry-diagnostics-v1", policyVersion="vision-geometry-diagnostics-v1",
        requestRevision=0, diagnosticSourceRevision=REVISION,
        preprocessing="ImageIO oriented thumbnails; diagnostic profiles at 512 and 1024 pixels",
        sceneRevisions=dict(face=3, humanRectangle=2, bodyPose=1, handPose=1), diagnosticMaximumObservations=64,
        diagnosticMaximumPoints=32, sceneMinimumConfidence=.2, sceneMinimumPosePoints=2, sceneMaximumHandCount=4,
        operatingSystem="MOCK no detector execution", generatedAt="2026-10-05T00:00:00Z",
        cases=[dict(id=c["id"], sha256=c["sha256"], sceneDiagnostics=copy.deepcopy(profiles)) for c in manifest["cases"]])
    return manifest, semantic, native


def detected(native, index, name, confidence=.2):
    profile = next(p for p in native["cases"][index]["sceneDiagnostics"] if p["profile"] == name)
    stage = next(s for s in profile["stages"] if s["stage"] == "humanRectangle")
    accepted = confidence >= .2
    stage.update(rawCount=1, acceptedCount=int(accepted), observations=[dict(confidence=confidence,
        accepted=accepted, rectangle=[0, 0, 1, 1], pointCount=0, acceptedPointCount=0,
        pointsTruncated=False, points=[])])


def execute(root, semantic, native, output="output", revision=REVISION):
    # Mutable inputs are test-only. Published evidence is never rewritten.
    (root / "semantic.json").write_text(json.dumps(semantic), encoding="utf-8")
    (root / "native.json").write_text(json.dumps(native), encoding="utf-8")
    return compose(root / "manifest.json", root / "semantic.json", root / "native.json", revision, root / output)


class UpperContracts(unittest.TestCase):
    def test_frozen_gate_expectations_include_errors_and_family_failures(self):
        cases = [dict(id="a", group="shared", expectedGate="foodCandidate"),
            dict(id="b", group="shared", expectedGate="nonCandidate"),
            dict(id="c", group="human", expectedGate="uncertain")]
        rows = [dict(id=c["id"], result=dict(outcome=o)) for c, o in zip(cases, ["foodCandidate", "error", "uncertain"])]
        result = gate_checks(cases, rows)
        self.assertEqual((result["casePasses"], result["familyPasses"]), (2, 1))
        self.assertEqual(gate_checks(cases, rows[::-1]), result)
        with self.assertRaises(ValueError): gate_checks(cases, rows[:-1])
        with self.assertRaises(ValueError): gate_checks(cases, rows + rows[:1])
        cases[0]["expectedGate"] = "invalid"
        with self.assertRaises(ValueError): gate_checks(cases, rows)

    def test_download_spacing_rejects_invalid_input_before_file_or_network_access(self):
        from fetch import fetch
        for value in [True, 0, 31, float("nan"), float("inf")]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "spacing"):
                fetch("does-not-exist", "unused", value)

    def test_fixed_baseline_and_additional_abstention_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, semantic, native = fixture(root)
            # 0 is clean; 1 has upper-only detection; 2 has full detection;
            # 3 has diagnostic-only 1024 detection; 4 has semantic human risk;
            # 5 is a non-food negative with upper detection.
            detected(native, 1, "upper-body-512")
            detected(native, 2, "full-body-512")
            detected(native, 3, "full-body-1024")
            semantic["cases"][4]["diagnostics"]["promptLogits"]["risk_hands"] = 11
            for prompt in ["meal", "ingredients", "packaged", "drink", "growing_fruit"]:
                semantic["cases"][5]["diagnostics"]["promptLogits"][prompt] = -10
            for prompt in ["risk_document", "risk_screen", "risk_medical"]:
                semantic["cases"][5]["diagnostics"]["promptLogits"][prompt] = -20
            detected(native, 5, "upper-body-512")
            result = execute(root, semantic, native)
            self.assertFalse(result["automaticUploadQualified"])
            self.assertEqual(len(result["changes"]), 1)
            self.assertEqual(result["changes"][0]["id"], manifest["cases"][1]["id"])
            rows = json.loads((root / "output/v4-results.json").read_bytes())["cases"]
            self.assertEqual([r["result"]["outcome"] for r in rows],
                ["foodCandidate", "uncertain", "uncertain", "foodCandidate", "uncertain", "nonFood"])
            with self.assertRaises(FileExistsError): execute(root, semantic, native)

    def test_rejects_wrong_hash_revision_profiles_and_nonfinite_logits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, semantic, native = fixture(root)
            variants = []
            altered = copy.deepcopy(native); altered["cases"][0]["sha256"] = "0" * 64; variants.append((semantic, altered))
            altered = copy.deepcopy(native); altered["diagnosticSourceRevision"] = "b" * 40; variants.append((semantic, altered))
            altered = copy.deepcopy(native); altered["cases"][0]["sceneDiagnostics"].pop(); variants.append((semantic, altered))
            for key in ["schemaVersion", "requestRevision", "diagnosticMaximumPoints"]:
                altered = copy.deepcopy(native); altered[key] = bool(altered[key]); variants.append((semantic, altered))
            altered = copy.deepcopy(native); altered["sceneRevisions"]["bodyPose"] = True; variants.append((semantic, altered))
            altered = copy.deepcopy(semantic); altered["cases"][0]["diagnostics"]["promptLogits"]["meal"] = float("nan"); variants.append((altered, native))
            altered = copy.deepcopy(semantic); altered["modelArtifact"]["configurationSHA256"] = "0" * 64; variants.append((altered, native))
            for index, (s, n) in enumerate(variants):
                with self.subTest(index=index), self.assertRaises(ValueError): execute(root, s, n, str(index))
                self.assertFalse((root / str(index)).exists())
            with self.assertRaises(ValueError): execute(root, semantic, native, "revision", revision="")

    def test_unavailable_and_truncated_evidence_cannot_be_routed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, semantic, native = fixture(root)
            native["cases"][0]["sceneDiagnostics"][0]["stages"][0]["resultsAvailable"] = False
            with self.assertRaisesRegex(ValueError, "Unavailable or truncated"): execute(root, semantic, native)
            native["cases"][0]["sceneDiagnostics"][0]["stages"][0]["resultsAvailable"] = True
            detected(native, 0, "upper-body-512")
            stage = next(s for s in native["cases"][0]["sceneDiagnostics"][2]["stages"] if s["stage"] == "humanRectangle")
            stage.update(rawCount=65, acceptedCount=65, observationsTruncated=True,
                observations=stage["observations"] * 64)
            with self.assertRaisesRegex(ValueError, "Unavailable or truncated"): execute(root, semantic, native)
            self.assertFalse((root / "output").exists())

    def test_exact_threshold_and_grouped_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, semantic, native = fixture(root)
            detected(native, 0, "upper-body-512", .1999)
            detected(native, 1, "upper-body-512", .2)
            result = execute(root, semantic, native)
            self.assertEqual(len(result["changes"]), 1)
            self.assertEqual(result["suites"]["publicReference/development"]["caseCount"], len(manifest["cases"]))
            self.assertEqual(result["suites"]["publicReference/development"]["familyCount"], len({c["group"] for c in manifest["cases"]}))


if __name__ == "__main__": unittest.main()
