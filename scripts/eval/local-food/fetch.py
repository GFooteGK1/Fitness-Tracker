"""Fetch only the frozen public fixtures; stop on errors and preserve existing files."""
import argparse
import hashlib
import time
import urllib.parse
import urllib.request
from pathlib import Path
from score import read_manifest

MAX_BYTES = 10_485_760
ALLOWED_HOSTS = {"upload.wikimedia.org", "thumb.wikimedia.org"}


def validate_url(value):
    url = urllib.parse.urlparse(value)
    if url.scheme != "https" or url.hostname not in ALLOWED_HOSTS or url.username or url.password or url.port:
        raise ValueError("Unexpected public fixture host")


class PublicMediaRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        validate_url(newurl)  # Validate before urllib sends the redirected request.
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def image_path(root, relative):
    root = Path(root).resolve()
    target = (root / relative).resolve()
    if not target.is_relative_to(root) or target == root:
        raise ValueError("Image path escapes cache")
    return target


def verify(data, expected):
    if len(data) > MAX_BYTES or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError("Fixture bytes changed or exceed limit; preserve and review the source")


def fetch(manifest_path, root):
    manifest, _ = read_manifest(manifest_path)
    for case in manifest["cases"]:
        if case["layer"] != "publicReference" or case.get("license") not in {"CC0", "Public domain"}:
            raise ValueError("Fetcher accepts only reviewed public-domain references")
        validate_url(case["download"])
        target = image_path(root, case["file"])
        if target.exists():
            with target.open("rb") as handle:
                verify(handle.read(MAX_BYTES + 1), case["sha256"])
            print(case["id"] + ": existing hash verified")
            continue
        request = urllib.request.Request(case["download"], headers={"User-Agent": "SociusFit-food-evaluation/1.0"})
        opener = urllib.request.build_opener(PublicMediaRedirects())
        with opener.open(request, timeout=30) as response:
            validate_url(response.url)
            data = response.read(MAX_BYTES + 1)
        verify(data, case["sha256"])
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as handle:
            handle.write(data)
        print(case["id"] + ": downloaded hash verified")
        time.sleep(1.2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest"); parser.add_argument("image_directory")
    args = parser.parse_args()
    fetch(args.manifest, args.image_directory)
