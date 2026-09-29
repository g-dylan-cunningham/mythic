export type SupplierStyleCandidate = {
  brandName: string;
  partNumber: string;
  styleID: string;
  styleName: string;
  title: string;
};

export type SupplierVariant = {
  colorName: string;
  customerPrice: number;
  sizeName: string;
  sku: string;
  totalQty: number;
};

export type SupplierCrossReference = {
  brandName: string;
  colorName: string;
  sizeName: string;
  sku: string;
  styleName: string;
  yourSku: string;
};

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mappingKey(styleNumber: string, color: string) {
  return `${compact(styleNumber)}::${compact(color)}`;
}

export function selectSupplierStyleCandidate({
  candidates,
  description,
  styleNumber,
}: {
  candidates: SupplierStyleCandidate[];
  description: string | null;
  styleNumber: string;
}) {
  const normalizedStyle = compact(styleNumber);
  const exactStyles = candidates.filter(
    (candidate) =>
      compact(candidate.styleName) === normalizedStyle ||
      compact(candidate.partNumber) === normalizedStyle,
  );

  if (exactStyles.length === 1) {
    return exactStyles[0];
  }

  if (exactStyles.length === 0 || !description) {
    return null;
  }

  const normalizedDescription = compact(description);
  const brandMatches = exactStyles.filter((candidate) =>
    normalizedDescription.includes(compact(candidate.brandName)),
  );

  return brandMatches.length === 1 ? brandMatches[0] : null;
}

export function selectSupplierColor(
  sourceColor: string,
  availableColors: string[],
) {
  const normalizedSource = compact(sourceColor);
  const exactMatches = availableColors.filter(
    (color) => compact(color) === normalizedSource,
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const containsMatches = availableColors.filter((color) => {
    const normalizedColor = compact(color);

    return (
      normalizedColor.includes(normalizedSource) ||
      normalizedSource.includes(normalizedColor)
    );
  });

  return containsMatches.length === 1 ? containsMatches[0] : null;
}

export function normalizeSupplierSize(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    xsmall: "xs",
    small: "s",
    medium: "m",
    large: "l",
    xlarge: "xl",
    xxlarge: "2xl",
    xxxlarge: "3xl",
    xxxxlarge: "4xl",
    xxxxxlarge: "5xl",
    xxxxxxlarge: "6xl",
    xxl: "2xl",
    xxxl: "3xl",
    xxxxl: "4xl",
    xxxxxl: "5xl",
    xxxxxxl: "6xl",
    "2xlarge": "2xl",
    "3xlarge": "3xl",
    "4xlarge": "4xl",
    "5xlarge": "5xl",
    "6xlarge": "6xl",
  };

  return aliases[normalized] ?? normalized;
}

export function selectSupplierVariant(
  sourceSize: string,
  color: string,
  variants: SupplierVariant[],
) {
  const normalizedColor = compact(color);
  const normalizedSize = normalizeSupplierSize(sourceSize);
  const matches = variants.filter(
    (variant) =>
      compact(variant.colorName) === normalizedColor &&
      normalizeSupplierSize(variant.sizeName) === normalizedSize,
  );

  return matches.length === 1 ? matches[0] : null;
}

export function selectSupplierCrossReferences({
  color,
  crossReferences,
  sizes,
  styleNumber,
}: {
  color: string;
  crossReferences: SupplierCrossReference[];
  sizes: string[];
  styleNumber: string;
}) {
  const matches = sizes.map((size) => {
    const sizeMatches = crossReferences.filter(
      (reference) =>
        compact(reference.styleName) === compact(styleNumber) &&
        compact(reference.colorName) === compact(color) &&
        normalizeSupplierSize(reference.sizeName) ===
          normalizeSupplierSize(size),
    );

    return sizeMatches.length === 1 ? sizeMatches[0] : null;
  });

  if (matches.some((match) => !match)) {
    return null;
  }

  const resolved = matches.filter(
    (match): match is SupplierCrossReference => match !== null,
  );
  const brands = new Set(resolved.map((match) => compact(match.brandName)));

  return brands.size === 1 ? resolved : null;
}
