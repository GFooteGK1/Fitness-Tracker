"""Mock public-fixture transport checks; no classifier quality proof."""
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from fixture_bundle import pack, unpack


class BundleContracts(unittest.TestCase):
    def test_roundtrip_hashes_exclusive_outputs_and_exact_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); images = root / "images"; images.mkdir()
            (images / "one.jpg").write_bytes(b"MOCK pixels, not an image")
            digest = hashlib.sha256((images / "one.jpg").read_bytes()).hexdigest()
            case = dict(id="one", file="one.jpg", sha256=digest, expectedPresence="food", clearMeal=True,
                sensitive=False, isScreenshot=False, split="heldOut", layer="publicReference", license="CC0",
                group="one", category="MOCK")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps(dict(schemaVersion=1, cases=[case])), encoding="utf-8")
            bundle = root / "original.zip"; bundle_hash = pack(manifest, images, bundle)
            self.assertEqual(unpack(manifest, bundle, bundle_hash, root / "output"), 1)
            self.assertEqual((root / "output/one.jpg").read_bytes(), (images / "one.jpg").read_bytes())
            with self.assertRaises(FileExistsError): unpack(manifest, bundle, bundle_hash, root / "output")
            with self.assertRaises(FileExistsError): pack(manifest, images, bundle)
            with self.assertRaisesRegex(ValueError, "bundle hash"): unpack(manifest, bundle, "0" * 64, root / "bad-hash")
            for index, mutate in enumerate(["extra", "missing", "changed-pixels", "changed-manifest"]):
                changed = root / (mutate + ".zip")
                with zipfile.ZipFile(changed, "x") as archive:
                    if mutate != "missing": archive.writestr("one.jpg", b"Changed" if mutate == "changed-pixels" else (images / "one.jpg").read_bytes())
                    archive.writestr("manifest.json", b"{}" if mutate == "changed-manifest" else manifest.read_bytes())
                    if mutate == "extra": archive.writestr("../outside.jpg", b"Unexpected")
                sha = hashlib.sha256(changed.read_bytes()).hexdigest()
                output = root / str(index)
                with self.assertRaises(ValueError): unpack(manifest, changed, sha, output)
                self.assertFalse(output.exists())
            case["license"] = "Unknown"
            manifest.write_text(json.dumps(dict(schemaVersion=1, cases=[case])), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "CC0"): pack(manifest, images, root / "unsafe.zip")


if __name__ == "__main__": unittest.main()
