"""Stage the reduced sample for the existing internal TestFlight app.

No credentials or endpoint values are read here. Original sample and native
sources stay untouched. The only Swift change is the configured App Group.
"""

from pathlib import Path
import shutil
import sys


def replace_once(text, original, replacement):
    if text.count(original) != 1:
        raise ValueError(f"Expected exactly one configuration anchor: {original}")
    return text.replace(original, replacement, 1)


def prepare(repository, destination):
    repository = Path(repository).resolve()
    destination = Path(destination).resolve()
    sample = repository / "samples/photokit-startup-probe"
    native = repository / "ios"
    # A fresh tree prevents stale native code or prior signing output inclusion.
    if destination.exists():
        raise FileExistsError("Sample staging destination must not already exist")

    project = (native / "project.yml").read_text(encoding="utf-8")
    project = replace_once(
        project,
        "CFBundleDisplayName: SociusFit Auto Meals",
        "CFBundleDisplayName: PhotoKit Startup Probe\n"
        "        SociusFitProbeVariant: apple-support-startup\n"
        "        SociusFitProbeSourceSHA: $(PROBE_SOURCE_SHA)",
    )
    project = replace_once(
        project,
        "NSPhotoLibraryUsageDescription: SociusFit checks new photos on your device so likely meal photos can be prepared for your review.",
        "NSPhotoLibraryUsageDescription: This diagnostic tests background extension scheduling after Photos permission.",
    )
    state = replace_once(
        (sample / "Shared/ProbeState.swift").read_text(encoding="utf-8"),
        '"group.com.example.photouploadprobe"',
        '"group.com.sociusfit.automeals"',
    )

    copies = {
        "App/PhotoUploadProbeApp.swift": sample / "App/PhotoUploadProbeApp.swift",
        "BackgroundUpload/BackgroundUploadExtension.swift": sample / "Extension/BackgroundUploadExtension.swift",
        "Supporting/App.entitlements": native / "Supporting/App.entitlements",
        "Supporting/BackgroundUpload.entitlements": native / "Supporting/BackgroundUpload.entitlements",
        "Supporting/App/PrivacyInfo.xcprivacy": sample / "Supporting/PrivacyInfo.xcprivacy",
        "Supporting/BackgroundUpload/PrivacyInfo.xcprivacy": sample / "Supporting/PrivacyInfo.xcprivacy",
    }
    for relative in (
        "Assets.xcassets/Contents.json",
        "Assets.xcassets/AppIcon.appiconset/Contents.json",
        "Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png",
    ):
        copies[f"Resources/{relative}"] = native / "Resources" / relative
    # Fail before staging if any allowlisted input is unavailable.
    for source in copies.values():
        if not source.is_file():
            raise FileNotFoundError(source)
    destination.mkdir(parents=True)
    for relative, source in copies.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (destination / "Shared").mkdir()
    (destination / "Shared/ProbeState.swift").write_text(state, encoding="utf-8", newline="\n")
    (destination / "project.yml").write_text(project, encoding="utf-8", newline="\n")
    print("Staged reduced startup sample with existing distribution identifiers and icon; no credentials or endpoint read.")


if __name__ == "__main__":
    prepare(Path(__file__).resolve().parents[2], sys.argv[1])
