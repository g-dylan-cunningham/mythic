# Roles And Entitlements

Mythic uses three profile fields together. This keeps access simple without creating a separate role for every department and seniority level.

## Core Role: `role`

The database field is `profiles.role`.

- `owner`: full business visibility and owner-only views.
- `admin`: system administration and broad reporting access.
- `staff`: internal Mythic team member.
- `customer`: reserved for a future customer portal.

## Department: `department`

The database field is `profiles.department`.

Current values are `sales`, `design`, `production`, `logistics`, and `operations`.

Department tells the app where a person works and which work queues are relevant to them.

## Authority Level: `authority_level`

The database field is `profiles.authority_level`.

Current values are `junior_employee`, `senior_employee`, `junior_manager`, `senior_manager`, and `director`.

Authority level tells the app how much visibility and control a person should have inside their department.

## Examples

`design-manager@mythic.press` is not a special app role. It is:

- `role = staff`
- `department = design`
- `authority_level = junior_manager`

`owner@mythic.press` is:

- `role = owner`
- `department = operations`
- `authority_level = director`

In practice: `role` controls broad app access, `department` routes work, and `authority_level` controls employee-vs-manager behavior.
