# Revised method: reuse verified public originals

Status: approved October 6; fixture release and exact-byte readback complete.
Transport publication and the single approved Mac diagnostic run are in progress.
Run37309091907 at published bbd38819f6744605cb455a365142724805e52a8f passed
unsigned app compilation, 33 Python contracts, 53 Swift tests and five XCTest
checks. Fresh diagnostics stopped on HTTP429 acquiring case11 after ten verified
downloads. No detector execution or partial native receipt occurred. The run log
is retained under the ignored fresh-challenge cache's `mac-37309091907/`.

Three acquisition failures against the source blocker are preserved: initial
third original, remaining fifteenth original after cool-off, then Mac eleventh
original. Ten-second spacing and another runner did not remove the dependency.
No further Wikimedia requests or Mac retries are allowed in this cycle.

A deterministic local ZIP contains the thirteen already verified public-domain/
CC0 originals and frozen manifest with source/author/license records. It excludes
personal device photos, models, private logs, credentials and excluded cases.
Prepared asset: `scripts/eval/data/local-food/fresh-challenge-20261005/photo-screening-fixtures-v1.zip`.
SHA256: `c42772f50d4ef24fc8ea177e772bbe0cee627c7e8c29a52bc722391f69f4825c`.

Proposed target: a **public fixture prerelease** in `GFooteGK1/Fitness-Tracker`,
tag `photo-screening-fixtures-v1`, explicitly prerelease and not latest. Live
readback confirms the repository is public. Public image-asset storage differs
from earlier JSON-only workflow retention and requires target-specific approval.
It publishes no app or TestFlight build. No automatic asset deletion is included.

Prepared workflow downloads the fixed release asset through its existing read-only
token. Before writing an exclusive image cache it verifies the ZIP hash, exact
manifest bytes, thirteen file hashes, exact entry paths/counts and size bounds.
Unexpected bytes or unavailable assets stop the job. There is no Wikimedia
fallback or automatic retry. Native profiles, thresholds, prompts and labels
remain unchanged; 1024 is diagnostic only. Local transport readback and contract
tests precede independent review.

After approval: create exactly one fixture prerelease/ZIP using prepared release
notes; read back its identity and bytes; publish only the reviewed transport code
to the existing feature branch; dispatch exactly one unsigned fresh diagnostic
run. Smallest check: thirteen image hashes and frozen manifest verify on Mac
before detector execution. Acceptance: exact native checkout, 13cases/39profiles,
complete untruncated observations, then composition and independent regrading of
fixed v3/v4 against the existing semantic receipts.

This starts a new bounded recovery cycle with one planned Mac attempt, preserving
cumulative failures. Diagnose and stop on failure; never resend automatically.
No app activation, TestFlight, paid calls, canonical meals or private-image upload.
A successful tiny set remains limited evidence, not automatic-upload qualification.

October 6 execution: Greg approved the complete recovery plan. Published fixture
prerelease `photo-screening-fixtures-v1` at exact source bbd38819. Asset615384843
has the planned name, size25,533,518 and SHA256. Downloaded actual published bytes
once into an exclusive local readback directory; all thirteen originals and exact
manifest passed extraction verification. No Wikimedia request or model rerun.
