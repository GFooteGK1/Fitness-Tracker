"""Behavior checks for the TestFlight sample staging boundary."""

import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("prepare-testflight-sample.py")
SPEC = importlib.util.spec_from_file_location("prepare_sample", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
REPOSITORY = SCRIPT.resolve().parents[2]


class SampleStagingTests(unittest.TestCase):
    def test_only_reduced_runtime_is_staged_and_inputs_are_preserved(self):
        inputs = [REPOSITORY / "ios/project.yml", *(
            REPOSITORY / "samples/photokit-startup-probe"
        ).rglob("*.swift")]
        before = {path: path.read_bytes() for path in inputs}
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "sample"
            MODULE.prepare(REPOSITORY, target)
            self.assertEqual(
                {p.relative_to(target).as_posix() for p in target.rglob("*.swift")},
                {"App/PhotoUploadProbeApp.swift", "Shared/ProbeState.swift",
                 "BackgroundUpload/BackgroundUploadExtension.swift"},
            )
            for dest, source in (
                ("App/PhotoUploadProbeApp.swift", "App/PhotoUploadProbeApp.swift"),
                ("BackgroundUpload/BackgroundUploadExtension.swift", "Extension/BackgroundUploadExtension.swift"),
            ):
                self.assertEqual((target / dest).read_bytes(), (
                    REPOSITORY / "samples/photokit-startup-probe" / source
                ).read_bytes())
            original = (REPOSITORY / "samples/photokit-startup-probe/Shared/ProbeState.swift").read_text()
            staged = (target / "Shared/ProbeState.swift").read_text()
            self.assertEqual(staged, original.replace(
                '"group.com.example.photouploadprobe"', '"group.com.sociusfit.automeals"'
            ))
            for name in ("App", "BackgroundUpload"):
                entitlement = plistlib.loads((target / f"Supporting/{name}.entitlements").read_bytes())
                self.assertEqual(entitlement["com.apple.security.application-groups"], ["group.com.sociusfit.automeals"])
            self.assertFalse((target / "Shared/ProtocolProbeSharedState.swift").exists())
            project = (target / "project.yml").read_text()
            self.assertIn("SociusFitProbeVariant: apple-support-startup", project)
            self.assertIn("SociusFitProbeSourceSHA: $(PROBE_SOURCE_SHA)", project)
            self.assertIn("BACKGROUND_UPLOAD_URL_BASE: https://example.invalid", project)
            self.assertIn("ITSAppUsesNonExemptEncryption: false", project)
            self.assertIn("ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon", project)
        self.assertEqual(before, {path: path.read_bytes() for path in inputs})

    def test_refuses_existing_destination_without_touching_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            sentinel = Path(temporary) / "keep.txt"
            sentinel.write_text("existing evidence")
            with self.assertRaises(FileExistsError):
                MODULE.prepare(REPOSITORY, temporary)
            self.assertEqual(sentinel.read_text(), "existing evidence")
            self.assertEqual(list(Path(temporary).iterdir()), [sentinel])

    def test_configuration_drift_fails_closed(self):
        for text in ("unrelated", "anchor anchor"):
            with self.assertRaises(ValueError):
                MODULE.replace_once(text, "anchor", "replacement")


if __name__ == "__main__":
    unittest.main()
