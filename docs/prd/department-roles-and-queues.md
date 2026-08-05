# Department Roles And Queues

Saved prompt for the next design pass.

## Goal

Mythic needs role-aware work queues by department so each user sees the right amount of operational context.

## Departments

- Sales
- Design
- Production
- Logistics
- Operations

## Authority Levels

- Junior employee
- Senior employee
- Junior manager
- Senior manager
- Director

## Queue Model

Managers should have a planning queue of tasks ready to be assigned. Employees should have a personal work queue of tasks assigned to them.

The likely next data-level work is task assignment support:

- Assign a production task to a user.
- Record who assigned it and when.
- Restrict managers to assigning work inside their department unless they have owner/admin authority.
- Allow senior managers and directors broader visibility than junior managers.
- Keep every assignment and reassignment in the event log.

## UI Intent

- Dashboard: role validation, manager planning queue, employee task queue.
- Manager view: tasks ready to assign, assigned work by employee, blocked work.
- Employee view: only assigned tasks, blockers, and allowed actions.
- Owner/admin views: reports, owner production overview, system-wide operational views.
