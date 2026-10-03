# 0007 - Local food-screening observation pilot

- **Status:** Accepted for the implementation experiment; quality and release remain unqualified
- **Date:** 2026-10-03
- **Deciders:** Greg authorized the local-screening slice; Codex selected the experiment candidate

## Context

Greg reports build 10 discovery passed zero/one/five shots, repeats and locked execution on his iPhone. Discovery does not prove a classifier can run while locked or classify food reliably. The approved next slice evaluates food locally before any upload. Jev is text-only and cannot directly classify images. No trained food model, dataset, licence, or accuracy result is assumed to exist in this repository.

## Decision

Use Apple's built-in Vision revision-1 classifier as an opt-in local observation experiment with durable results and separate human evaluation labels.

## Consequences

- Positive: existing Apple Vision/Core ML frameworks supply the candidate on the iOS 26.4 target; no third-party package, redistributed weights, model download, provider call or account is introduced. [Classification API](https://developer.apple.com/documentation/vision/vnclassifyimagerequest).
- Positive: a separate action shares discovery's checkpoint. Explicit enabling includes already discovered photos since enrollment. The original discovery-only action remains available. Persist candidates, attempt count before image access, then each result. Preserve invalid/future files and reject overlapping screening/control/label edits with a host actor.
- Negative: this general classifier is unqualified for meals, drinks, packaged food, macro suitability, sensitive scenes or photographed screens. Exact `food` label support is checked on device. Experimental thresholds and screenshot/mixed-scene abstention are hypotheses, not a privacy guarantee. Scores are not calibrated probabilities; OS/hardware can change behavior despite a pinned request revision.
- Neutral: request 512px local images, preserve orientation, reject dimensions over 1024px, disable Photos network access and retain no image file. This proves neither full-resolution access nor dependable resource availability. [Photos policy](https://developer.apple.com/documentation/photos/phimagerequestoptions/isnetworkaccessallowed).
- Neutral: select CPU for every supported compute stage; fail visibly if unavailable. Measure successful/error read-plus-classification time. Locked execution, memory and battery need device proof. [Stage devices](https://developer.apple.com/documentation/vision/vnrequest/supportedcomputestagedevices), [device selection](https://developer.apple.com/documentation/vision/vnrequest/setcomputedevice(_:for:)).
- Neutral: at most three photos per invocation, with a soft 20-second budget checked between operations. Image acquisition resolves after five seconds; Vision requests cooperative cancellation after ten. Total runtime is not capped at 20 seconds. Wait for the Vision worker before another classification rather than independently resuming a timeout and permitting overlapping work. [Cancellation](https://developer.apple.com/documentation/vision/vnrequest/cancel()).
- Neutral: errors/interrupted attempts consume a maximum three attempts and remain visible after exhaustion. Prioritise new work over retries; uncertain/non-food results are terminal. Disable preserves evidence and prevents subsequent screening runs. No reconnect wakeup, upload, macro analysis or meal persistence is added.
- Neutral: separately retain food presence, macro suitability and development/held-out labels. Include pending and exhausted clear-meal misses in evaluation denominators. Counters do not establish a blind dataset: pre-record truth, splits and burst grouping before viewing outputs; tune development only. Future policy versions require an explicit evidence-preserving migration or separate store. [Apple evaluation guidance](https://developer.apple.com/documentation/vision/classifying-images-for-categorization-and-search).

## Alternatives considered

A dedicated bundled Core ML food model may perform better, but requires weight availability, redistribution licence, size and device profiling. Compare it if this candidate fails; do not silently add an unverified model dependency.

Cloud vision sends non-food images before screening and changes the accepted local privacy boundary. It is outside this slice's authority.

Manual image selection supplies explicit approval before upload and remains required if literal zero non-food transmission is the policy. It belongs in the later intake proof; it does not evaluate automatic local screening.
