import assert from "node:assert/strict";
import test from "node:test";
import { deriveHeadlinePhase } from "./headline-phase.ts";

function tasks(completedKeys, skippedKeys = []) {
  return [
    ...completedKeys.map((workflow_step_key) => ({
      status: "complete",
      workflow_step_key,
    })),
    ...skippedKeys.map((workflow_step_key) => ({
      status: "skipped",
      workflow_step_key,
    })),
  ];
}

const readyKeys = [
  "apparel.order_apparel",
  "apparel.apparel_received",
  "art.ready_to_burn_screens",
  "prep.burn_screens",
  "prep.confirm_print_locations",
  "prep.confirm_ink_color_count",
  "prep.confirm_garment_handling",
  "prep.confirm_finishing_requirements",
  "prep.estimate_difficulty_time",
];

test("starts in needs sourcing", () => {
  assert.equal(deriveHeadlinePhase([]).key, "phase.needs_sourcing");
});

test("advances only through consecutively satisfied phase gates", () => {
  assert.equal(
    deriveHeadlinePhase(tasks(["apparel.order_apparel"])).key,
    "phase.awaiting_goods",
  );
  assert.equal(
    deriveHeadlinePhase(tasks(readyKeys)).key,
    "phase.ready_for_production",
  );
  assert.equal(
    deriveHeadlinePhase(tasks([...readyKeys, "prep.assign_press_day"])).key,
    "phase.scheduled",
  );
});

test("treats intentionally skipped prerequisite work as satisfied", () => {
  assert.equal(
    deriveHeadlinePhase(
      tasks(
        readyKeys.filter((key) => key !== "art.ready_to_burn_screens"),
        ["art.ready_to_burn_screens"],
      ),
    ).key,
    "phase.ready_for_production",
  );
});

test("reopening an earlier prerequisite moves the presentation backward", () => {
  const currentTasks = tasks([
    ...readyKeys,
    "prep.assign_press_day",
    "production.in_production",
  ]);
  const receivedTask = currentTasks.find(
    (task) => task.workflow_step_key === "apparel.apparel_received",
  );

  assert.equal(deriveHeadlinePhase(currentTasks).key, "phase.in_production");
  receivedTask.status = "open";
  assert.equal(deriveHeadlinePhase(currentTasks).key, "phase.awaiting_goods");
});

test("blocked work does not replace the underlying headline phase", () => {
  assert.equal(
    deriveHeadlinePhase([
      ...tasks(["apparel.order_apparel"]),
      { status: "blocked", workflow_step_key: "art.create_revise_artwork" },
    ]).key,
    "phase.awaiting_goods",
  );
});

