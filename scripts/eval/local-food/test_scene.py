"""Policy and composition checks use explicit fake scene observations, not detection proof."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from compose_scene import evaluate, compose, scene_valid, read_policy
from score import read_manifest, grade
from encoder_export import write_new
from coreml_feasibility import check_export


def clear():
    return dict(completed=True, reason="MOCK geometry test only", stages=["face", "humanRectangle", "bodyPose", "handPose"],
        faceCount=0, humanRectangleCount=0, bodyPoseCount=0, handPoseCount=0, durationMilliseconds=1)


class SceneContracts(unittest.TestCase):
    def test_missing_failed_partial_and_malformed_evidence_abstain(self):
        for scene in [None, {**clear(), "completed": False}, {**clear(), "stages": ["face"]},
                      {**clear(), "faceCount": -1}, {**clear(), "stages": ["face"] * 4},
                      {**clear(), "faceCount": True}]:
            self.assertEqual(evaluate(10, -1, scene, False), ("uncertain", "scene_evidence_unavailable"))

    def test_geometry_screenshot_and_semantic_boundaries(self):
        for key in ["faceCount", "humanRectangleCount", "bodyPoseCount", "handPoseCount"]:
            self.assertEqual(evaluate(10, -1, {**clear(), key: 1}, False)[1], "human_geometry")
        self.assertEqual(evaluate(float("nan"), float("nan"), None, True)[1], "screenshot")
        self.assertEqual(evaluate(float("nan"), -1, clear(), False)[0], "error")
        self.assertEqual(evaluate(3, 0, clear(), False)[1], "context_similarity")
        self.assertEqual(evaluate(1, -1, clear(), False)[0], "foodCandidate")
        self.assertEqual(evaluate(-1, -1, clear(), False)[0], "nonFood")
        self.assertEqual(evaluate(0, -1, clear(), False)[0], "uncertain")

    def test_composition_provenance_and_missing_scene_do_not_qualify(self):
        base = Path(__file__).parent
        manifest_path = base / "fixtures.siglip2-development-v1.json"
        manifest, digest = read_manifest(manifest_path)
        semantic_path = base / "results/siglip2-windows-20261004/results.json"
        policy, _ = read_policy()
        scenes = dict(schemaVersion=1, completed=True, manifestSHA256=digest, sceneGuardVersion=policy["guardVersion"],
            policyVersion=policy["guardVersion"], requestRevision=0, sceneRevisions=policy["sceneRevisions"],
            sceneMinimumConfidence=.2, sceneMinimumPosePoints=2, sceneMaximumHandCount=4,
            operatingSystem="MOCK, no detection", preprocessing="MOCK", generatedAt="2026-10-04T00:00:00Z",
            cases=[dict(id=c["id"], sha256=c["sha256"], scene=clear()) for c in manifest["cases"]])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); scene_path = root / "scene.json"
            write_new(scene_path, scenes)
            compose(manifest_path, semantic_path, scene_path, root / "m.json", root / "r.json")
            proposed, proposed_hash = read_manifest(root / "m.json")
            report = json.loads((root / "r.json").read_bytes())
            self.assertTrue(report["completed"])
            self.assertFalse(grade(proposed, proposed_hash, report)["automaticUploadQualified"])
            mutated = copy.deepcopy(report); mutated["decisionArtifact"]["configurationSHA256"] = "wrong"
            with self.assertRaises(ValueError): grade(proposed, proposed_hash, mutated)
            with self.assertRaises(ValueError): compose(manifest_path, semantic_path, scene_path, root / "m.json", root / "r.json")
            scenes["cases"].pop()
            scene_path.write_text(json.dumps(scenes), encoding="utf-8")
            composed = compose(manifest_path, semantic_path, scene_path, root / "partial-m.json", root / "partial-r.json")
            self.assertFalse(composed["completed"])
            self.assertEqual(composed["cases"][-1]["result"]["reason"], "scene_evidence_unavailable")
            scenes["cases"][0]["sha256"] = "0" * 64
            scene_path.write_text(json.dumps(scenes), encoding="utf-8")
            with self.assertRaises(ValueError): compose(manifest_path, semantic_path, scene_path, root / "bad-m.json", root / "bad-r.json")

    def test_export_receipt_rejects_changed_artifacts(self):
        from siglip_probe import file_digest
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "image-encoder.pt").write_bytes(b"MOCK encoder")
            (root / "text-vectors.json").write_bytes(b"MOCK vectors")
            (root / "case.npy").write_bytes(b"MOCK tensor")
            report = dict(schemaVersion=1, completed=True, encoderSHA256=file_digest(root / "image-encoder.pt"),
                textVectorsSHA256=file_digest(root / "text-vectors.json"), cases=[dict(id="case", passed=True,
                    tensorSHA256=file_digest(root / "case.npy"))])
            write_new(root / "parity.json", report); check_export(root)
            (root / "case.npy").write_bytes(b"Changed tensor")
            with self.assertRaises(ValueError): check_export(root)

    def test_composition_rejects_changed_prompt_grouping(self):
        base = Path(__file__).parent
        config = json.loads((base / "siglip-probe.json").read_bytes())
        food = next(p for p in config["prompts"] if p["group"] == "food")
        food["group"] = "safe"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            configuration_path = root / "changed-config.json"
            write_new(configuration_path, config)
            with self.assertRaisesRegex(ValueError, "Semantic configuration differs"):
                compose(base / "fixtures.siglip2-development-v1.json",
                    base / "results/siglip2-windows-20261004/results.json",
                    root / "unused-scene.json", root / "m.json", root / "r.json", configuration_path)
            self.assertFalse((root / "m.json").exists())
            self.assertFalse((root / "r.json").exists())

    def test_conversion_rejects_unknown_precision_before_artifact_access(self):
        from coreml_feasibility import convert
        with self.assertRaisesRegex(ValueError, "Unsupported Core ML precision"):
            convert("unused-export", "unused-output", "FLOAT64")


if __name__ == "__main__": unittest.main()
