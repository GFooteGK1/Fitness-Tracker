# Frozen visible development packets

Byte-exact copies of the September 26 synthetic development manifest, requests
and proposed labels from `output/programming-quality-review/jev-whole-week-development-v1`.
These are visible development test inputs, not sealed holdout data or athlete records.

Manifest SHA-256: `21a3dd4cf35f21ec368ccacd47c5775844c867e411d5032ebd8663ddc6ac81a7`.
Proposed-labels SHA-256: `7fd855a89823344ce24862632069e108d1a3a62eec5f2fbcf1c0068c4e3e08d8`.
The manifest binds each request's hash and byte count. Original evidence:
`docs/verification/programming-quality/jev-whole-week-packet-2026-09-26.md`.

The bounded runner tests these frozen packets. Separate generator tests exercise
current compiler inputs. An expanded equipment catalog does not authorize a new
packet or alter the frozen runner's manifest guard. Labels remain proposed and
unreviewed; injected test labels and token counts confer no live authority.
