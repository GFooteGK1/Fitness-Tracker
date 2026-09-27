"""Package an already compiled support sample using an explicit file allowlist.

Called only after both unsigned xcodebuild steps succeed in ios-compile.yml.
No build products, user settings, signing material, or repository metadata enter
the source ZIP. Compilation success belongs to the workflow, not this script.
"""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile


def main():
    source = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    paths = [
        "App/PhotoUploadProbeApp.swift",
        "Extension/BackgroundUploadExtension.swift",
        "Shared/ProbeState.swift",
        "Supporting/App.entitlements",
        "Supporting/Extension.entitlements",
        "Supporting/PrivacyInfo.xcprivacy",
        "Supporting/App-Info.plist",
        "Supporting/Extension-Info.plist",
        "project.yml",
        "README.md",
        "PhotoUploadProbe.xcodeproj/project.pbxproj",
        "PhotoUploadProbe.xcodeproj/xcshareddata/xcschemes/PhotoUploadProbe.xcscheme",
    ]
    files = {name: (source / name).read_bytes() for name in paths}
    receipt = {
        "sourceCommit": os.environ["GITHUB_SHA"],
        "workflowRun": (
            f"{os.environ['GITHUB_SERVER_URL']}/{os.environ['GITHUB_REPOSITORY']}"
            f"/actions/runs/{os.environ['GITHUB_RUN_ID']}"
        ),
        "runAttempt": os.environ["GITHUB_RUN_ATTEMPT"],
        "xcode": subprocess.check_output(["xcodebuild", "-version"], text=True).strip(),
        "xcodegen": "2.46.0",
        "configuration": "Debug",
        "unsignedBuildDestinations": ["generic/platform=iOS Simulator", "generic/platform=iOS"],
        "physicalDeviceTested": False,
        "signingTested": False,
    }
    files["BUILD-VERIFICATION.json"] = (json.dumps(receipt, indent=2) + "\n").encode()
    files["SHA256SUMS.txt"] = "".join(
        f"{hashlib.sha256(data).hexdigest()}  {name}\n"
        for name, data in sorted(files.items())
    ).encode()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / "photokit-startup-probe-source.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
        for name, data in sorted(files.items()):
            package.writestr(f"photokit-startup-probe/{name}", data)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / (archive.name + ".sha256")).write_text(
        f"{digest}  {archive.name}\n", encoding="utf-8"
    )
    print(json.dumps(receipt, indent=2))
    print(f"Package SHA-256: {digest}")


if __name__ == "__main__":
    main()
