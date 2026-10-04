# 0009 — Separate semantic food presence from geometric scene evidence

- Status: Accepted evaluation boundary; runtime adoption unqualified
- Date: 2026-10-04
- Scope: Approved native feasibility and scene-filter slice

SigLIP2 passed 11/11 exposed clear meals, while its text-only risk contrast passed
2/5 scenes containing people/body parts and abstained on the shared food package.
Food presence and suitability/privacy cannot be represented by one similarity score.

Export the image encoder with precomputed fixed text vectors. Evaluate Core ML
conversion/prediction separately from Swift preprocessing and physical-device lifecycle.
Use independent geometric face/body/hand observations for the proposed scene guard;
incomplete or unavailable evidence abstains. Retain semantic screen/document/medical
checks as experimental signals, not guaranteed detectors.

The full checkpoint and text model are unnecessary phone payloads. Lowering the old
risk threshold would tune against known failures without fixing the boundary. External
library screening would change the authorized privacy boundary, so it is excluded.

New evaluators produce separate hash-bound receipts and never replace v1 saved
classifications. No runtime model, policy migration, upload permission or meal write
is enabled. An independently frozen untouched grouped set and physical iPhone
measurements remain required. A successful converter or empty detection list alone
cannot qualify automatic uploads. See the approved feasibility plan and ADR-0008.
