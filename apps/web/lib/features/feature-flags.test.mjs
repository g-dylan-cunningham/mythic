import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessFeatureWithFlags,
  dashboardTools,
} from "./feature-flags.ts";

const activeFlags = {
  operationalReports: true,
  printavoFetching: true,
  productionSuite: true,
  ssInventory: true,
};

function profile(overrides = {}) {
  return {
    authority_level: "junior_employee",
    department: "sales",
    is_active: true,
    role: "staff",
    ...overrides,
  };
}

test("sales staff can use S&S inventory but not admin Printavo fetching", () => {
  const salesProfile = profile();

  assert.equal(
    canAccessFeatureWithFlags(salesProfile, "ssInventory", activeFlags),
    true,
  );
  assert.equal(
    canAccessFeatureWithFlags(salesProfile, "printavoFetching", activeFlags),
    false,
  );
});

test("non-sales staff cannot use the S&S inventory tool", () => {
  assert.equal(
    canAccessFeatureWithFlags(
      profile({ department: "production" }),
      "ssInventory",
      activeFlags,
    ),
    false,
  );
});

test("owners and admins can use enabled internal tools", () => {
  for (const role of ["owner", "admin"]) {
    assert.equal(
      canAccessFeatureWithFlags(
        profile({ department: null, role }),
        "printavoFetching",
        activeFlags,
      ),
      true,
    );
  }
});

test("a disabled feature remains inaccessible regardless of permission", () => {
  assert.equal(
    canAccessFeatureWithFlags(
      profile({ role: "owner" }),
      "productionSuite",
      { ...activeFlags, productionSuite: false },
    ),
    false,
  );
});

test("retained production access preserves the existing internal audience", () => {
  assert.equal(
    canAccessFeatureWithFlags(
      profile({ department: "production" }),
      "productionSuite",
      activeFlags,
    ),
    true,
  );
  assert.equal(
    canAccessFeatureWithFlags(
      profile({ department: null, role: "customer" }),
      "productionSuite",
      activeFlags,
    ),
    false,
  );
});

test("inactive accounts cannot access enabled tools", () => {
  assert.equal(
    canAccessFeatureWithFlags(
      profile({ is_active: false, role: "owner" }),
      "ssInventory",
      activeFlags,
    ),
    false,
  );
});

test("dashboard catalog contains only the active rollout tools", () => {
  assert.deepEqual(
    dashboardTools.map((tool) => tool.feature),
    ["ssInventory", "printavoFetching"],
  );
});
