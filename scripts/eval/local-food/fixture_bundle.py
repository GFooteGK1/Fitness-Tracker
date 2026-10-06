"""Transport frozen public fixtures; verify every byte before native execution."""
import argparse
import hashlib
import io
import zipfile
from pathlib import Path
from fetch import image_path, verify
from score import read_manifest

MAX_BUNDLE = 67_108_864


def originals(manifest):
    if any(c["layer"] != "publicReference" or c.get("license") not in {"CC0", "Public domain"} for c in manifest["cases"]):
        raise ValueError("Bundle accepts only reviewed CC0/public-domain fixtures")
    files = {c["file"]: c for c in manifest["cases"]}
    if len(files) != len(manifest["cases"]) or "manifest.json" in files:
        raise ValueError("Duplicate or reserved fixture file")
    return files


def pack(manifest_path, images, output):
    manifest, _ = read_manifest(manifest_path)
    files = originals(manifest)
    payload = {}
    for name, case in files.items():
        with image_path(images, name).open("rb") as handle: data = handle.read(10_485_761)
        verify(data, case["sha256"])
        payload[name] = data
    payload["manifest.json"] = Path(manifest_path).read_bytes()
    if sum(map(len, payload.values())) > MAX_BUNDLE: raise ValueError("Bundle exceeds bound")
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_STORED) as archive:
        for name in sorted(payload):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, payload[name])
    return hashlib.sha256(Path(output).read_bytes()).hexdigest()


def unpack(manifest_path, bundle, expected_sha256, output):
    manifest, _ = read_manifest(manifest_path)
    files = originals(manifest)
    if Path(bundle).stat().st_size > MAX_BUNDLE: raise ValueError("Bundle exceeds bound")
    data = Path(bundle).read_bytes()
    if len(data) > MAX_BUNDLE: raise ValueError("Bundle exceeds bound")
    if hashlib.sha256(data).hexdigest() != expected_sha256: raise ValueError("Changed bundle hash")
    payload = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = {e.filename for e in entries}
        if len(entries) != len(names) or names != set(files) | {"manifest.json"}:
            raise ValueError("Unknown, duplicate or missing bundle entry")
        if sum(e.file_size for e in entries) > MAX_BUNDLE or any(e.file_size > 10_485_760 for e in entries):
            raise ValueError("Uncompressed bundle exceeds bound")
        if archive.read("manifest.json") != Path(manifest_path).read_bytes():
            raise ValueError("Changed bundle manifest")
        for name, case in files.items():
            payload[name] = archive.read(name)
            verify(payload[name], case["sha256"])
    root = Path(output)
    root.mkdir(parents=True, exist_ok=False)
    for name, value in payload.items():
        target = image_path(root, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as handle: handle.write(value)
    return len(payload)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("pack")
    for name in ["manifest", "images", "new_bundle"]: build.add_argument(name)
    extract = commands.add_parser("unpack")
    for name in ["manifest", "bundle", "expected_sha256", "new_images"]: extract.add_argument(name)
    args = parser.parse_args()
    if args.command == "pack": print("Bundle SHA256:", pack(args.manifest, args.images, args.new_bundle))
    else: print("Verified/extracted originals:", unpack(args.manifest, args.bundle, args.expected_sha256, args.new_images))
