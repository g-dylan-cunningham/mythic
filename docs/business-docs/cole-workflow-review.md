# Cole Workflow Review Lists

Last updated: 2026-07-09

Purpose: share a concise list of current Monday board columns and Printavo order
statuses so Cole can confirm what is actually needed for the Mythic production
workflow build.

## Questions For Cole

- Which Monday columns are required to run production?
- Which Monday columns are nice-to-have but not essential?
- Which Monday columns are historical clutter we should not rebuild?
- Which Printavo statuses should create or update Mythic production jobs?
- Which Printavo statuses are customer/commercial only and should stay in
  Printavo?

## Monday Board Columns

Source: Monday screenshot shared during the July 8 workflow conversation.

Some labels are truncated in the screenshot. Items marked "confirm label" need
Cole to verify the exact Monday column name.

| Order | Column | Confidence | Notes / Values Seen |
| ---: | --- | --- | --- |
| 1 | `Item` | High | Job/customer/item name. |
| 2 | `Important` | High | Example values: `FRM`, `Rush + FL...`, `Social P...`. |
| 3 | `Status` | High | Example values: `In Progress`, `Complete`. |
| 4 | `Print Type` | High | Example value: `Standard / 2...`. |
| 5 | `Press` | High | Example value: `ROQ - B`. |
| 6 | `Day` | High | Example values: `Tues`, `Wed`, `Thurs`, `???`. |
| 7 | `Art` | High | Example values: `Screens Burned`, `Reprint`. |
| 8 | `Garments` / `Garment Count-In` | Medium | Header truncated as `Garme...`; values show `Counted In`. Confirm exact label. |
| 9 | `Final...` | Low | Header truncated as `Fina...`; confirm exact label and purpose. |
| 10 | `Multi...` | Low | Header truncated as `Mult...`; confirm exact label and purpose. |
| 11 | `QTY` | High | Quantity to produce. |
| 12 | `Sca...` | Low | Header truncated; values look like fractions such as `1/0`, `3/0`, `2/0`. Could be screen/art/prep tracking. Confirm exact label. |
| 13 | `Scr...` | Low | Header truncated; values look like screen counts such as `1`, `3`, `2`. Confirm exact label. |
| 14 | `Time Tracking` | High | Monday timer column. |
| 15 | `Est. HRS` | High | Estimated hours. |
| 16 | `Manual 15 minu...` | Medium | Header truncated; likely manual time adjustment in 15-minute increments. Confirm exact label. |
| 17 | `Tracked Time` | High | Calculated or reported tracked time. |
| 18 | `D...` | Low | A partially visible column begins after `Tracked Time`. Confirm whether this exists and what it is. |

## Monday Views / Groups Seen

- Board/workspace: `Print`.
- Views/tabs visible: `Main table`, `ALL OPEN JOBS`, `ROQ 6`, `ROQ 8`, `Build View View`.
- Group shown: `07.06 - 07.10`.

## Printavo Order Statuses

Source: `/api/v1/orderstatuses` export from Mythic's Printavo account.

Important implementation note: map by Printavo `id`, not name. Names can
change, and `Schedule & Order Garments ` currently includes a trailing space in
the API response.

| Order | ID | Quote | Status | Candidate Mythic Bucket |
| ---: | ---: | :---: | --- | --- |
| 1 | `37017` | Yes | `Quote` | Pre-production / commercial |
| 2 | `475424` | Yes | `Webform Quote Received` | Pre-production / commercial |
| 3 | `338710` | Yes | `Quote Sent` | Pre-production / commercial |
| 4 | `475399` | Yes | `📣 Quote Approval Reminder 1` | Pre-production / commercial |
| 5 | `475400` | Yes | `📣 Quote Approval Reminder 2` | Pre-production / commercial |
| 6 | `475401` | Yes | `📣 Quote Approval Reminder 3` | Pre-production / commercial |
| 7 | `475398` | Yes | `Quote - Approval Archived` | Pre-production / commercial |
| 8 | `51702` | Yes | `LOST` | Closed / lost |
| 9 | `49377` | Yes | `Quote - In Play / Hold` | Pre-production / commercial |
| 10 | `340042` | Yes | `CREDIT` | Billing / accounting |
| 11 | `353542` | Yes | `Template` | Internal / template |
| 12 | `56087` | No | `📣 Approved! - Payment Request Sent` | Approved / pre-production |
| 13 | `475421` | No | `📣 Payment Request Reminder 1` | Payment follow-up |
| 14 | `475422` | No | `📣 Payment Request Reminder 2` | Payment follow-up |
| 15 | `475423` | No | `📣 Payment Request Reminder 3` | Payment follow-up |
| 16 | `475420` | No | `Mockups Needed` | Art / details |
| 17 | `54331` | No | `Awaiting Details` | Art / details blocker |
| 18 | `340040` | No | `Design In Progress` | Art / details |
| 19 | `347279` | No | `Artwork Approval - Sent` | Art approval |
| 20 | `475403` | No | `📣 Art Approval Reminder 1` | Art follow-up |
| 21 | `475404` | No | `📣 Art Approval Reminder 2` | Art follow-up |
| 22 | `475405` | No | `📣 Art Approval Reminder 3` | Art follow-up |
| 23 | `51465` | No | `Presale In Progress` | Pre-production / commercial |
| 24 | `353341` | No | `EVENTS` | Pre-production / commercial |
| 25 | `120802` | No | `Schedule & Order Garments ` | Production trigger candidate |
| 26 | `37024` | No | `Ready For Production` | Production ready |
| 27 | `492558` | No | `In Production` | Production active |
| 28 | `533873` | No | `Production Complete - Fulfillment Ready` | Production complete / fulfillment |
| 29 | `49527` | No | `Complete - Awaiting Pickup` | Fulfillment / closeout |
| 30 | `340408` | No | `Complete - Payment Terms Established` | Fulfillment / billing |
| 31 | `346056` | No | `Complete - Payment Needed` | Fulfillment / billing |
| 32 | `343971` | No | `Picked Up - Payment Not Collected` | Fulfillment / billing issue |
| 33 | `343972` | No | `PAST 30 DAYS - OVERDUE` | Accounting overdue |
| 34 | `49208` | No | `Complete` | Closed / complete |
| 35 | `492697` | No | `Ask Accountant` | Accounting exception |

## Likely Mythic Build Candidates

### Definitely Relevant To Production

- Printavo: `120802` / `Schedule & Order Garments `
- Printavo: `37024` / `Ready For Production`
- Printavo: `492558` / `In Production`
- Printavo: `533873` / `Production Complete - Fulfillment Ready`
- Monday: `Status`
- Monday: `Print Type`
- Monday: `Press`
- Monday: `Day`
- Monday: `Art`
- Monday: `Garments` / `Garment Count-In`
- Monday: `QTY`
- Monday: screen-related columns
- Monday: `Time Tracking`
- Monday: `Est. HRS`
- Monday: `Tracked Time`

### Needs Confirmation

- Whether `Important` is a priority, routing, customer type, or production flag.
- Whether `Final...` is finishing, final art, final count, or another workflow
  concept.
- Whether `Multi...` means multiple print locations, multi-color, multi-garment,
  or something else.
- What the two `Sc...` / `Scr...` columns represent.
- Whether the `Manual 15 minu...` column should exist in Mythic or be replaced
  by better time tracking.
- What the trailing `D...` column is.
