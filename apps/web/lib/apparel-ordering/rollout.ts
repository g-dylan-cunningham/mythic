export const APPAREL_ORDERING_MODES = ["off", "review", "live"] as const;

export type ApparelOrderingMode =
  (typeof APPAREL_ORDERING_MODES)[number];

type RolloutEnvironment = Record<string, string | undefined>;

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function apparelOrderingMode(value: string | undefined): ApparelOrderingMode {
  const normalized = value?.trim().toLowerCase();

  return APPAREL_ORDERING_MODES.includes(
    normalized as ApparelOrderingMode,
  )
    ? (normalized as ApparelOrderingMode)
    : "off";
}

export function getApparelOrderingRollout(
  environment: RolloutEnvironment = process.env,
) {
  const mode = apparelOrderingMode(
    environment.MYTHIC_APPAREL_ORDERING_MODE,
  );
  const liveMode = mode === "live";

  return Object.freeze({
    featureEnabled: mode !== "off",
    mappingConfirmationsEnabled: liveMode,
    mode,
    printavoStatusUpdatesEnabled:
      liveMode &&
      enabled(environment.MYTHIC_ENABLE_PRINTAVO_STATUS_UPDATES),
    ssOrderSubmissionEnabled:
      liveMode && enabled(environment.MYTHIC_ENABLE_SS_ORDER_SUBMISSION),
  });
}

export const apparelOrderingRollout = getApparelOrderingRollout();
