# Printavo Order Statuses

Last updated: 2026-07-09

This file tracks Mythic's configured Printavo order statuses and early mapping
notes for the production workflow build.

Source: `/api/v1/orderstatuses` export saved locally as `statuses.json`.

Treat these names as account configuration, not global Printavo constants. The
app should sync `/api/v1/orderstatuses` and map by external `id`, not by name.
Names can change, and the actual Printavo name for `Schedule & Order Garments `
currently includes a trailing space.

## Status List

| Order | ID | Quote | Color | Status | Initial Mythic Interpretation |
| ---: | ---: | :---: | --- | --- | --- |
| 1 | `37017` | Yes | `#C4C4C4` | `Quote` | Quote/pre-production |
| 2 | `475424` | Yes | `#FFF700` | `Webform Quote Received` | Quote/pre-production |
| 3 | `338710` | Yes | `#00FFC4` | `Quote Sent` | Quote/pre-production |
| 4 | `475399` | Yes | `#9EB4DE` | `📣 Quote Approval Reminder 1` | Quote follow-up |
| 5 | `475400` | Yes | `#839AC4` | `📣 Quote Approval Reminder 2` | Quote follow-up |
| 6 | `475401` | Yes | `#5A75B0` | `📣 Quote Approval Reminder 3` | Quote follow-up |
| 7 | `475398` | Yes | `#383D80` | `Quote - Approval Archived` | Quote closed/archived |
| 8 | `51702` | Yes | `#474747` | `LOST` | Closed/lost |
| 9 | `49377` | Yes | `#66B0B0` | `Quote - In Play / Hold` | Quote hold |
| 10 | `340042` | Yes | `#98DE83` | `CREDIT` | Billing/accounting |
| 11 | `353542` | Yes | `#1EFF00` | `Template` | Internal/template |
| 12 | `56087` | No | `#F700FF` | `📣 Approved! - Payment Request Sent` | Approved/pre-production |
| 13 | `475421` | No | `#9EB4DE` | `📣 Payment Request Reminder 1` | Payment follow-up |
| 14 | `475422` | No | `#839AC4` | `📣 Payment Request Reminder 2` | Payment follow-up |
| 15 | `475423` | No | `#5A75B0` | `📣 Payment Request Reminder 3` | Payment follow-up |
| 16 | `475420` | No | `#F700FF` | `Mockups Needed` | Art required |
| 17 | `54331` | No | `#F70F0F` | `Awaiting Details` | Customer/details blocker |
| 18 | `340040` | No | `#86B093` | `Design In Progress` | Art in progress |
| 19 | `347279` | No | `#1EFF00` | `Artwork Approval - Sent` | Art approval pending |
| 20 | `475403` | No | `#9EB4DE` | `📣 Art Approval Reminder 1` | Art follow-up |
| 21 | `475404` | No | `#839AC4` | `📣 Art Approval Reminder 2` | Art follow-up |
| 22 | `475405` | No | `#5A75B0` | `📣 Art Approval Reminder 3` | Art follow-up |
| 23 | `51465` | No | `#00FFC4` | `Presale In Progress` | Presale/commercial |
| 24 | `353341` | No | `#62F9FC` | `EVENTS` | Event/commercial |
| 25 | `120802` | No | `#FFF700` | `Schedule & Order Garments ` | Production trigger candidate |
| 26 | `37024` | No | `#07DE00` | `Ready For Production` | Production ready |
| 27 | `492558` | No | `#46A100` | `In Production` | Production active |
| 28 | `533873` | No | `#47A0D9` | `Production Complete - Fulfillment Ready` | Production complete/fulfillment |
| 29 | `49527` | No | `#737373` | `Complete - Awaiting Pickup` | Fulfillment/customer pickup |
| 30 | `340408` | No | `#638761` | `Complete - Payment Terms Established` | Complete/billing terms |
| 31 | `346056` | No | `#9E0000` | `Complete - Payment Needed` | Complete/payment needed |
| 32 | `343971` | No | `#FF0000` | `Picked Up - Payment Not Collected` | Fulfilled/payment issue |
| 33 | `343972` | No | `#FF7300` | `PAST 30 DAYS - OVERDUE` | Accounting overdue |
| 34 | `49208` | No | `#000000` | `Complete` | Closed/complete |
| 35 | `492697` | No | `#CC0000` | `Ask Accountant` | Accounting exception |

## Candidate Mythic Status Mapping

These mappings are preliminary and should be validated with Cole before
automating job creation or write-backs.

### Pre-Production / Commercial

- `QUOTE`
- `WEBFORM QUOTE RECEIVED`
- `QUOTE SENT`
- `QUOTE APPROVAL REMINDER 1`
- `QUOTE APPROVAL REMINDER 2`
- `QUOTE APPROVAL REMINDER 3`
- `QUOTE - APPROVAL ARCHIVED`
- `LOST`
- `QUOTE - IN PLAY / HOLD`
- `CREDIT`
- `TEMPLATE`
- `APPROVED! - PAYMENT REQUEST SENT`
- `PAYMENT REQUEST REMINDER 1`
- `PAYMENT REQUEST REMINDER 2`
- `PAYMENT REQUEST REMINDER 3`
- `PRESALE IN PROGRESS`
- `EVENTS`

### Art / Details

- `MOCKUPS NEEDED`
- `AWAITING DETAILS`
- `DESIGN IN PROGRESS`
- `ARTWORK APPROVAL - SENT`
- `ART APPROVAL REMINDER 1`
- `ART APPROVAL REMINDER 2`
- `ART APPROVAL REMINDER 3`

### Production

- `120802`: `Schedule & Order Garments `
- `37024`: `Ready For Production`
- `492558`: `In Production`
- `533873`: `Production Complete - Fulfillment Ready`

### Fulfillment / Closeout

- `COMPLETE - AWAITING PICKUP`
- `COMPLETE - PAYMENT TERMS ESTABLISHED`
- `COMPLETE - PAYMENT NEEDED`
- `PICKED UP - PAYMENT NOT COLLECTED`
- `PAST 30 DAYS - OVERDUE`
- `COMPLETE`
- `ASK ACCOUNTANT`

## Initial Automation Rules To Consider

- `120802` / `Schedule & Order Garments `: create or activate a Mythic
  production job.
- `37024` / `Ready For Production`: mark the job ready to schedule/run if Mythic receiving
  and art checks agree.
- `492558` / `In Production`: mark the Mythic job active only if the transition came from
  Mythic or a production lead confirms it.
- `533873` / `Production Complete - Fulfillment Ready`: close production tasks
  and move to fulfillment/closeout.
- Payment/accounting statuses should remain Printavo-owned unless they block
  production decisions.

## Open Questions

- Which statuses are manually changed by staff versus automation/Zapier?
- Does `SCHEDULE & ORDER GARMENTS` always mean the order should enter Mythic?
- Does `READY FOR PRODUCTION` mean garments are physically received, art is
  approved, or both?
- Should Mythic ever write `IN PRODUCTION` or `PRODUCTION COMPLETE -
  FULFILLMENT READY` back to Printavo?
- Which statuses should be hidden from production workers?
