import assert from "node:assert/strict";
import test from "node:test";
import { getApparelOrderingRollout } from "./rollout.ts";

test("defaults to fully disabled when rollout mode is missing or invalid", () => {
  for (const value of [undefined, "", "enabled", "TRUE"]) {
    assert.deepEqual(
      getApparelOrderingRollout({ MYTHIC_APPAREL_ORDERING_MODE: value }),
      {
        featureEnabled: false,
        mappingConfirmationsEnabled: false,
        mode: "off",
        printavoStatusUpdatesEnabled: false,
        ssOrderSubmissionEnabled: false,
      },
    );
  }
});

test("review mode permits inspection but no writes or external mutations", () => {
  assert.deepEqual(
    getApparelOrderingRollout({
      MYTHIC_APPAREL_ORDERING_MODE: "review",
      MYTHIC_ENABLE_PRINTAVO_STATUS_UPDATES: "true",
      MYTHIC_ENABLE_SS_ORDER_SUBMISSION: "true",
    }),
    {
      featureEnabled: true,
      mappingConfirmationsEnabled: false,
      mode: "review",
      printavoStatusUpdatesEnabled: false,
      ssOrderSubmissionEnabled: false,
    },
  );
});

test("live mode still requires explicit external mutation switches", () => {
  const live = getApparelOrderingRollout({
    MYTHIC_APPAREL_ORDERING_MODE: "live",
  });

  assert.equal(live.featureEnabled, true);
  assert.equal(live.mappingConfirmationsEnabled, true);
  assert.equal(live.printavoStatusUpdatesEnabled, false);
  assert.equal(live.ssOrderSubmissionEnabled, false);

  const enabled = getApparelOrderingRollout({
    MYTHIC_APPAREL_ORDERING_MODE: "live",
    MYTHIC_ENABLE_PRINTAVO_STATUS_UPDATES: "true",
    MYTHIC_ENABLE_SS_ORDER_SUBMISSION: "true",
  });

  assert.equal(enabled.printavoStatusUpdatesEnabled, true);
  assert.equal(enabled.ssOrderSubmissionEnabled, true);
});
