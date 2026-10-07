import {
  mappingKey,
  normalizeSupplierSize,
  selectSupplierColor,
  selectSupplierCrossReferences,
  selectSupplierStyleCandidate,
  selectSupplierVariant,
  type SupplierCrossReference,
  type SupplierStyleCandidate,
} from "@/lib/apparel-ordering/matching-logic";
import type {
  ApparelVendorMappingSource,
  ApparelVendorReusableMapping,
} from "@/lib/apparel-ordering/vendor-mappings";
import type { PrintavoOrderLineSummary } from "@/lib/printavo/order-summary";
import {
  getSsCrossReferences,
  getSsStyleInventoryReport,
  searchSsStyles,
  type SsStyleInventoryReport,
} from "@/lib/ss/client";

export type SsVariantSelection = {
  availableQty: number;
  customerPrice: number;
  requestedQty: number;
  sourceSize: string;
  supplierSize: string;
  sku: string;
};

export type SsLineSuggestion = {
  hasSufficientInventory: boolean;
  matchSource: ApparelVendorMappingSource;
  supplierBrandName: string;
  supplierColor: string;
  supplierPartNumber: string;
  supplierStyleId: string;
  supplierStyleName: string;
  supplierTitle: string;
  variants: SsVariantSelection[];
};

export type SsLineMatchResult =
  | { suggestion: SsLineSuggestion; unresolvedReason: null }
  | { suggestion: null; unresolvedReason: string };

function candidateFromMapping(
  mapping: ApparelVendorReusableMapping,
): SupplierStyleCandidate {
  return {
    brandName: mapping.vendorBrandName,
    partNumber: mapping.vendorPartNumber,
    styleID: mapping.vendorStyleId,
    styleName: mapping.vendorStyleName,
    title: mapping.vendorStyleName,
  };
}

export async function getSsLineSuggestions(
  lineItems: PrintavoOrderLineSummary[],
  historicalBySource: Map<string, ApparelVendorReusableMapping>,
) {
  const crossReferencesRequest = getSsCrossReferences();
  const styleSearches = new Map<
    string,
    ReturnType<typeof searchSsStyles>
  >();

  for (const lineItem of lineItems) {
    if (!lineItem.styleNumber || !lineItem.color) {
      continue;
    }

    const historical = historicalBySource.get(
      mappingKey(lineItem.styleNumber, lineItem.color),
    );

    if (!historical && !styleSearches.has(lineItem.styleNumber)) {
      styleSearches.set(
        lineItem.styleNumber,
        searchSsStyles(lineItem.styleNumber),
      );
    }
  }

  const resolvedStyles = new Map<
    number,
    {
      candidate: SupplierStyleCandidate;
      crossReferences: SupplierCrossReference[] | null;
      historical: ApparelVendorReusableMapping | null;
    }
  >();
  const unresolved = new Map<number, string>();

  await Promise.all(
    lineItems.map(async (lineItem) => {
      if (!lineItem.lineItemId) {
        return;
      }

      if (!lineItem.styleNumber || !lineItem.color) {
        unresolved.set(
          lineItem.lineItemId,
          "The Printavo style or color is missing.",
        );
        return;
      }

      const historical = historicalBySource.get(
        mappingKey(lineItem.styleNumber, lineItem.color),
      );

      if (historical) {
        resolvedStyles.set(lineItem.lineItemId, {
          candidate: candidateFromMapping(historical),
          crossReferences: null,
          historical,
        });
        return;
      }

      const search = await styleSearches.get(lineItem.styleNumber);

      if (!search?.ok) {
        unresolved.set(
          lineItem.lineItemId,
          search?.error ?? "The S&S style search failed.",
        );
        return;
      }

      const crossReferenceResult = await crossReferencesRequest;
      const crossReferences = crossReferenceResult.ok
        ? selectSupplierCrossReferences({
            color: lineItem.color,
            crossReferences: crossReferenceResult.crossReferences,
            sizes: lineItem.sizes.map((size) => size.label),
            styleNumber: lineItem.styleNumber,
          })
        : null;
      const candidate = selectSupplierStyleCandidate({
        candidates: search.candidates,
        description:
          crossReferences?.[0]?.brandName ?? lineItem.description,
        styleNumber: lineItem.styleNumber,
      });

      if (!candidate) {
        unresolved.set(
          lineItem.lineItemId,
          "No unambiguous S&S style match was found.",
        );
        return;
      }

      resolvedStyles.set(lineItem.lineItemId, {
        candidate,
        crossReferences,
        historical: null,
      });
    }),
  );

  const inventoryReports = new Map<
    string,
    Promise<SsStyleInventoryReport>
  >();

  for (const { candidate } of resolvedStyles.values()) {
    if (!inventoryReports.has(candidate.partNumber)) {
      inventoryReports.set(
        candidate.partNumber,
        getSsStyleInventoryReport({
          minQty: 1,
          search: candidate.partNumber,
        }),
      );
    }
  }

  const results = new Map<number, SsLineMatchResult>();

  await Promise.all(
    lineItems.map(async (lineItem) => {
      const lineItemId = lineItem.lineItemId;

      if (!lineItemId) {
        return;
      }

      const resolved = resolvedStyles.get(lineItemId);

      if (!resolved) {
        results.set(lineItemId, {
          suggestion: null,
          unresolvedReason:
            unresolved.get(lineItemId) ?? "No S&S match was found.",
        });
        return;
      }

      const report = await inventoryReports.get(resolved.candidate.partNumber);

      if (!report?.ok) {
        results.set(lineItemId, {
          suggestion: null,
          unresolvedReason: report?.error ?? "S&S inventory could not be loaded.",
        });
        return;
      }

      const requestedColor =
        resolved.historical?.vendorColor ??
        resolved.crossReferences?.[0]?.colorName ??
        lineItem.color ??
        "";
      const supplierColor = selectSupplierColor(
        requestedColor,
        report.availableColors,
      );

      if (!supplierColor) {
        results.set(lineItemId, {
          suggestion: null,
          unresolvedReason: "No unambiguous S&S color match was found.",
        });
        return;
      }

      const variants: SsVariantSelection[] = [];

      for (const size of lineItem.sizes) {
        const crossReference = resolved.crossReferences?.find(
          (reference) =>
            normalizeSupplierSize(reference.sizeName) ===
            normalizeSupplierSize(size.label),
        );
        const crossReferenceVariants = crossReference
          ? report.variants.filter(
              (variant) => variant.sku === crossReference.sku,
            )
          : [];
        const supplierVariant = crossReference
          ? crossReferenceVariants.length === 1
            ? crossReferenceVariants[0]
            : null
          : selectSupplierVariant(
              size.label,
              supplierColor,
              report.variants,
            );

        if (!supplierVariant) {
          results.set(lineItemId, {
            suggestion: null,
            unresolvedReason: `No unambiguous S&S SKU was found for size ${size.label}.`,
          });
          return;
        }

        variants.push({
          availableQty: supplierVariant.totalQty,
          customerPrice: supplierVariant.customerPrice,
          requestedQty: size.quantity,
          sourceSize: size.label,
          supplierSize: supplierVariant.sizeName,
          sku: supplierVariant.sku,
        });
      }

      results.set(lineItemId, {
        suggestion: {
          hasSufficientInventory: variants.every(
            (variant) => variant.availableQty >= variant.requestedQty,
          ),
          matchSource: resolved.historical
            ? resolved.historical.matchSource
            : resolved.crossReferences
              ? "vendor_crossref"
            : "vendor_catalog",
          supplierBrandName: resolved.candidate.brandName,
          supplierColor,
          supplierPartNumber: resolved.candidate.partNumber,
          supplierStyleId: resolved.candidate.styleID,
          supplierStyleName: resolved.candidate.styleName,
          supplierTitle: resolved.candidate.title,
          variants,
        },
        unresolvedReason: null,
      });
    }),
  );

  return results;
}
