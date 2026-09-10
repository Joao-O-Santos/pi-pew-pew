# pi-pew-pew

## Objective

Maintain a small, read-only Pi web tool for deliberate, user-directed retrieval that is bounded, polite, transparent about access policy, and does not circumvent controls.

## Current direction

Prepare version 0.5.0 for review. This minor release makes observable access-policy changes: per-origin pacing and `Retry-After` deferral, a small user-directed allowance for robots-disallowed targets, structured temporary `503` failures, cross-origin redirect queueing, and explicit browser preflight-status reporting.

## Definition of done

The release metadata and synchronized project state are current; `npm run check` and `npm pack --dry-run` pass; the release-preparation commit is reviewed. Push, tag, and publication remain explicit human actions.

## Previous action

Completed and committed the policy hardening, public documentation, and initial synchronization manifest. The full check suite passed with 36 tests, and package dry-run completed successfully.

## Immediate next step

Review the 0.5.0 release-preparation commit, then explicitly direct any push, tag, or publication action.
