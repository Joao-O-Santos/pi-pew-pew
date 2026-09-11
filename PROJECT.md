# pi-pew-pew

## Objective

Maintain a small, read-only Pi web tool for deliberate, user-directed retrieval that is bounded, polite, transparent about access policy, and does not circumvent controls.

## Current direction

Prepare version 0.5.1 for review. This patch release removes PEW-PEW's custom `User-Agent` header from HTTP and `robots.txt` requests while retaining native runtime and Chromium user agents. It documents the access-policy change and preserves the existing bounded, read-only retrieval behavior.

## Definition of done

The release metadata and synchronized project state are current; `npm run check` and `npm pack --dry-run` pass; the release-preparation commit is reviewed. Push, tag, and publication remain explicit human actions.

## Previous action

Implemented and tested the no-custom-`User-Agent` policy change. The full check suite passed with 36 tests; package dry-run and release automation remain to be verified.

## Immediate next step

Verify the 0.5.1 release preparation, then explicitly direct any push, tag, or publication action.
