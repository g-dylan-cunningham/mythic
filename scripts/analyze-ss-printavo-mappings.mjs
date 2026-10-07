#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const START_DATE = "2026-09-01";
const END_DATE = "2026-10-04";
const PRINTAVO_PAGE_SIZE = 100;
const PRINTAVO_MAX_PAGES = 25;
const PRINTAVO_PAGE_DELAY_MS = 250;

const APPAREL_CATEGORIES = new Set([
  "dtf",
  "dtg",
  "embroidered apparel",
  "printed apparel",
]);

const SIZE_FIELDS = new Map([
  ["size_6m", "6M"],
  ["size_12m", "12M"],
  ["size_18m", "18M"],
  ["size_24m", "24M"],
  ["size_2t", "2T"],
  ["size_3t", "3T"],
  ["size_4t", "4T"],
  ["size_5t", "5T"],
  ["size_yxs", "YXS"],
  ["size_ys", "YS"],
  ["size_ym", "YM"],
  ["size_yl", "YL"],
  ["size_yxl", "YXL"],
  ["size_xs", "XS"],
  ["size_s", "S"],
  ["size_m", "M"],
  ["size_l", "L"],
  ["size_xl", "XL"],
  ["size_2xl", "2XL"],
  ["size_3xl", "3XL"],
  ["size_4xl", "4XL"],
  ["size_5xl", "5XL"],
  ["size_6xl", "6XL"],
  ["size_other", "Other"],
]);

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function compact(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeSize(value) {
  const normalized = compact(value);
  const aliases = {
    xsmall: "xs",
    small: "s",
    medium: "m",
    large: "l",
    xlarge: "xl",
    xxl: "2xl",
    xxlarge: "2xl",
    "2xlarge": "2xl",
    xxxl: "3xl",
    xxxlarge: "3xl",
    "3xlarge": "3xl",
    xxxxl: "4xl",
    xxxxlarge: "4xl",
    "4xlarge": "4xl",
    xxxxxl: "5xl",
    xxxxxlarge: "5xl",
    "5xlarge": "5xl",
    xxxxxxl: "6xl",
    xxxxxxlarge: "6xl",
    "6xlarge": "6xl",
  };

  return aliases[normalized] ?? normalized;
}

function numberValue(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function categoryName(line) {
  if (typeof line.category === "string") {
    return line.category.trim().toLowerCase();
  }

  return line.category?.name?.trim().toLowerCase() ?? "";
}

function printavoLineSizes(line) {
  const sizes = [];

  for (const [field, label] of SIZE_FIELDS) {
    const quantity = numberValue(line[field]);

    if (quantity > 0) {
      sizes.push({ label, normalizedSize: normalizeSize(label), quantity });
    }
  }

  if (sizes.length === 0 && line.size) {
    const quantity = numberValue(line.total_quantities);

    if (quantity > 0) {
      sizes.push({
        label: String(line.size).trim(),
        normalizedSize: normalizeSize(line.size),
        quantity,
      });
    }
  }

  return sizes;
}

function normalizePrintavoOrder(order) {
  const lines = (order.lineitems_attributes ?? []).flatMap((line) => {
    if (!APPAREL_CATEGORIES.has(categoryName(line))) {
      return [];
    }

    const styleNumber = String(line.style_number ?? "").trim();
    const color = String(line.color ?? "").trim();
    const lineItemId = numberValue(line.id);
    const sizes = printavoLineSizes(line);

    if (!styleNumber || !color || lineItemId <= 0 || sizes.length === 0) {
      return [];
    }

    const normalizedStyle = compact(styleNumber);
    const normalizedColor = compact(color);

    return [
      {
        color,
        description: String(line.style_description ?? "").trim(),
        lineItemId,
        normalizedColor,
        normalizedStyle,
        quantity: sizes.reduce((sum, size) => sum + size.quantity, 0),
        sizes,
        styleNumber,
      },
    ];
  });

  return {
    createdAt:
      dateValue(order.custom_created_at) ??
      dateValue(order.formatted_custom_created_at_date) ??
      dateValue(order.created_at),
    dueAt: dateValue(order.due_date),
    id: numberValue(order.id),
    lines,
    visualId: String(order.visual_id ?? order.id),
  };
}

function normalizeSsGroup(poNumber, orders) {
  const lineMap = new Map();

  for (const order of orders) {
    for (const line of order.lines ?? []) {
      const normalizedStyle = compact(line.styleName);
      const normalizedColor = compact(line.colorName);
      const normalizedSize = normalizeSize(line.sizeName);
      const sku = String(line.sku ?? "").trim();
      const quantity = numberValue(line.qtyOrdered);

      if (
        !normalizedStyle ||
        !normalizedColor ||
        !normalizedSize ||
        !sku ||
        quantity <= 0
      ) {
        continue;
      }

      const key = `${normalizedStyle}::${normalizedColor}::${normalizedSize}::${sku}`;
      const current = lineMap.get(key);

      lineMap.set(key, {
        brandName: String(line.brandName ?? "").trim(),
        colorName: String(line.colorName ?? "").trim(),
        normalizedColor,
        normalizedSize,
        normalizedStyle,
        price: numberValue(line.price),
        quantity: (current?.quantity ?? 0) + quantity,
        sizeName: String(line.sizeName ?? "").trim(),
        sku,
        styleName: String(line.styleName ?? "").trim(),
        title: String(line.title ?? "").trim(),
      });
    }
  }

  const orderDates = orders
    .map((order) => dateValue(order.orderDate) ?? dateValue(order.invoiceDate))
    .filter((value) => value !== null);

  return {
    guids: orders.map((order) => String(order.guid ?? "")).filter(Boolean),
    orderAt: orderDates.length > 0 ? Math.min(...orderDates) : null,
    orderNumbers: orders
      .map((order) => String(order.orderNumber ?? ""))
      .filter(Boolean),
    poNumber,
    lines: [...lineMap.values()],
  };
}

function printavoPieces(order) {
  const pieces = new Map();

  for (const line of order.lines) {
    for (const size of line.sizes) {
      const key = `${line.normalizedStyle}::${line.normalizedColor}::${size.normalizedSize}`;
      pieces.set(key, (pieces.get(key) ?? 0) + size.quantity);
    }
  }

  return pieces;
}

function ssPieces(group) {
  const pieces = new Map();

  for (const line of group.lines) {
    const key = `${line.normalizedStyle}::${line.normalizedColor}::${line.normalizedSize}`;
    pieces.set(key, (pieces.get(key) ?? 0) + line.quantity);
  }

  return pieces;
}

function isDatePlausible(group, order) {
  if (group.orderAt === null || order.createdAt === null) {
    return false;
  }

  const DAY = 24 * 60 * 60 * 1000;
  const earliest = order.createdAt - 7 * DAY;
  const latest = (order.dueAt ?? order.createdAt + 120 * DAY) + 45 * DAY;

  return group.orderAt >= earliest && group.orderAt <= latest;
}

function compareOrder(group, order) {
  const supplier = ssPieces(group);
  const source = printavoPieces(order);
  let overlap = 0;

  for (const [key, quantity] of source) {
    overlap += Math.min(quantity, supplier.get(key) ?? 0);
  }

  const printavoQuantity = [...source.values()].reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  const supplierQuantity = [...supplier.values()].reduce(
    (sum, quantity) => sum + quantity,
    0,
  );

  return {
    overlap,
    printavoCoverage:
      printavoQuantity > 0 ? overlap / printavoQuantity : 0,
    printavoQuantity,
    supplierCoverage:
      supplierQuantity > 0 ? overlap / supplierQuantity : 0,
    supplierQuantity,
  };
}

function findStrongCandidates(groups, orders) {
  return groups.map((group) => {
    const candidates = orders
      .filter(
        (order) => order.lines.length > 0 && isDatePlausible(group, order),
      )
      .map((order) => ({ order, score: compareOrder(group, order) }))
      .filter(
        ({ score }) =>
          score.overlap > 0 &&
          score.printavoCoverage >= 0.8 &&
          (score.overlap >= 6 || score.printavoCoverage === 1),
      )
      .sort(
        (left, right) =>
          right.score.printavoCoverage - left.score.printavoCoverage ||
          right.score.overlap - left.score.overlap ||
          right.score.supplierCoverage - left.score.supplierCoverage,
      );

    return { candidates, group };
  });
}

function lineMappingsForPair(group, order, orderScore) {
  const supplierByStyleColor = new Map();

  for (const line of group.lines) {
    const key = `${line.normalizedStyle}::${line.normalizedColor}`;
    const current = supplierByStyleColor.get(key) ?? [];
    current.push(line);
    supplierByStyleColor.set(key, current);
  }

  return order.lines.flatMap((line) => {
    const key = `${line.normalizedStyle}::${line.normalizedColor}`;
    const supplierLines = supplierByStyleColor.get(key) ?? [];

    if (supplierLines.length === 0) {
      return [];
    }

    const matchesBySize = new Map();

    for (const supplierLine of supplierLines) {
      const current = matchesBySize.get(supplierLine.normalizedSize) ?? [];
      current.push(supplierLine);
      matchesBySize.set(supplierLine.normalizedSize, current);
    }

    const variants = [];

    for (const size of line.sizes) {
      const matches = matchesBySize.get(size.normalizedSize) ?? [];
      const skuSet = new Set(matches.map((match) => match.sku));
      const quantity = matches.reduce(
        (sum, match) => sum + match.quantity,
        0,
      );

      if (skuSet.size !== 1 || quantity < size.quantity) {
        return [];
      }

      const match = matches[0];
      variants.push({
        customerPrice: match.price,
        observedQty: quantity,
        requestedQty: size.quantity,
        sku: match.sku,
        sourceSize: size.label,
        supplierSize: match.sizeName,
      });
    }

    const representative = supplierLines[0];
    const consistentIdentity = supplierLines.every(
      (supplierLine) =>
        supplierLine.brandName === representative.brandName &&
        supplierLine.styleName === representative.styleName &&
        supplierLine.colorName === representative.colorName,
    );
    const sourceDescriptionMatchesBrand = compact(line.description).includes(
      compact(representative.brandName),
    );

    if (!consistentIdentity || !sourceDescriptionMatchesBrand) {
      return [];
    }

    return [
      {
        evidence: {
          comparison: orderScore,
          printavoVisualId: order.visualId,
          ssGuids: group.guids,
          ssOrderNumbers: group.orderNumbers,
          ssPoNumber: group.poNumber,
        },
        printavoLineItemId: line.lineItemId,
        printavoOrderId: order.id,
        sourceColor: line.color,
        sourceDescription: line.description,
        sourceStyleNumber: line.styleNumber,
        vendorBrandName: representative.brandName,
        vendorColor: representative.colorName,
        vendorStyleName: representative.styleName,
        vendorTitle: representative.title,
        variants,
      },
    ];
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Request to ${url.origin}${url.pathname} failed with ${response.status}.`,
    );
  }

  return data;
}

async function fetchSsOrders() {
  const baseUrl = process.env.SS_API_BASE_URL ?? "https://api.ssactivewear.com";
  const version = process.env.SS_API_VERSION ?? "v2";
  const accountNumber = requiredEnvironment("SS_ACCOUNT_NUMBER");
  const apiKey = requiredEnvironment("SS_API_KEY");
  const url = new URL(`/${version}/orders/`, baseUrl);
  url.searchParams.set("invoicestartdate", START_DATE);
  url.searchParams.set("invoiceenddate", END_DATE);
  url.searchParams.set("lines", "true");
  url.searchParams.set("mediatype", "json");

  return fetchJson(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountNumber}:${apiKey}`).toString("base64")}`,
    },
  });
}

async function fetchPrintavoOrders() {
  const baseUrl =
    process.env.PRINTAVO_API_BASE_URL ?? "https://www.printavo.com";
  const version = process.env.PRINTAVO_API_VERSION ?? "v1";
  const email = requiredEnvironment("PRINTAVO_API_EMAIL");
  const token = requiredEnvironment("PRINTAVO_API_TOKEN");
  const orders = [];

  for (let page = 1; page <= PRINTAVO_MAX_PAGES; page += 1) {
    const url = new URL(`/api/${version}/orders`, baseUrl);
    url.searchParams.set("email", email);
    url.searchParams.set("token", token);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PRINTAVO_PAGE_SIZE));
    url.searchParams.set("sort_column", "custom_created_at");
    url.searchParams.set("direction", "desc");
    const data = await fetchJson(url);
    const pageOrders = Array.isArray(data?.data) ? data.data : [];
    orders.push(...pageOrders);

    if (pageOrders.length < PRINTAVO_PAGE_SIZE) {
      break;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, PRINTAVO_PAGE_DELAY_MS),
    );
  }

  return orders;
}

async function resolveSsStyles(mappings) {
  const baseUrl = process.env.SS_API_BASE_URL ?? "https://api.ssactivewear.com";
  const version = process.env.SS_API_VERSION ?? "v2";
  const accountNumber = requiredEnvironment("SS_ACCOUNT_NUMBER");
  const apiKey = requiredEnvironment("SS_API_KEY");
  const identities = new Map();

  for (const mapping of mappings) {
    identities.set(
      `${compact(mapping.vendorBrandName)}::${compact(mapping.vendorStyleName)}`,
      {
        brandName: mapping.vendorBrandName,
        styleName: mapping.vendorStyleName,
      },
    );
  }

  const resolved = new Map();

  for (const [key, identity] of identities) {
    const url = new URL(`/${version}/styles/`, baseUrl);
    url.searchParams.set("search", identity.styleName);
    url.searchParams.set("mediatype", "json");
    const data = await fetchJson(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountNumber}:${apiKey}`).toString("base64")}`,
      },
    });
    const exact = (Array.isArray(data) ? data : []).filter(
      (style) =>
        compact(style.brandName) === compact(identity.brandName) &&
        compact(style.styleName) === compact(identity.styleName),
    );

    if (exact.length === 1) {
      resolved.set(key, {
        vendorPartNumber: String(exact[0].partNumber ?? "").trim(),
        vendorStyleId: String(exact[0].styleID ?? "").trim(),
      });
    }
  }

  return mappings.flatMap((mapping) => {
    const identity = resolved.get(
      `${compact(mapping.vendorBrandName)}::${compact(mapping.vendorStyleName)}`,
    );

    return identity?.vendorPartNumber && identity.vendorStyleId
      ? [{ ...mapping, ...identity }]
      : [];
  });
}

function groupSsOrders(orders) {
  const grouped = new Map();

  for (const order of orders) {
    const poNumber = String(order.poNumber ?? "").trim();
    const key = poNumber || `GUID:${order.guid}`;
    const current = grouped.get(key) ?? [];
    current.push(order);
    grouped.set(key, current);
  }

  return [...grouped].map(([poNumber, group]) =>
    normalizeSsGroup(poNumber, group),
  );
}

function aggregateMappings(mappings) {
  const groups = new Map();

  for (const mapping of mappings) {
    const key = `${compact(mapping.sourceStyleNumber)}::${compact(mapping.sourceColor)}`;
    const current = groups.get(key) ?? [];
    current.push(mapping);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, observations]) => {
    const targets = new Set(
      observations.map(
        (mapping) =>
          `${mapping.vendorStyleId}::${compact(mapping.vendorColor)}`,
      ),
    );

    return {
      consistent: targets.size === 1,
      key,
      observationCount: observations.length,
      observations,
    };
  });
}

function outputPath() {
  const index = process.argv.indexOf("--output");

  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const [rawSsOrders, rawPrintavoOrders] = await Promise.all([
    fetchSsOrders(),
    fetchPrintavoOrders(),
  ]);
  const ssGroups = groupSsOrders(rawSsOrders);
  const printavoOrders = rawPrintavoOrders.map(normalizePrintavoOrder);
  const comparisons = findStrongCandidates(ssGroups, printavoOrders);
  const uniqueStrong = comparisons.filter(
    (comparison) => comparison.candidates.length === 1,
  );
  const inferredMappings = uniqueStrong.flatMap(({ candidates, group }) =>
    lineMappingsForPair(group, candidates[0].order, candidates[0].score),
  );
  const resolvedMappings = await resolveSsStyles(inferredMappings);
  const mappingGroups = aggregateMappings(resolvedMappings);
  const acceptedMappings = mappingGroups
    .filter((group) => group.consistent)
    .flatMap((group) => group.observations);
  const result = {
    generatedAt: new Date().toISOString(),
    scope: {
      endDate: END_DATE,
      printavoMaxPages: PRINTAVO_MAX_PAGES,
      startDate: START_DATE,
    },
    summary: {
      acceptedLineMappings: acceptedMappings.length,
      acceptedReusableRelationships: mappingGroups.filter(
        (group) => group.consistent,
      ).length,
      printavoOrders: rawPrintavoOrders.length,
      resolvedLineMappings: resolvedMappings.length,
      ssOrders: rawSsOrders.length,
      ssPoGroups: ssGroups.length,
      uniqueStrongGroups: uniqueStrong.length,
    },
    relationships: mappingGroups.filter((group) => group.consistent),
    rejectedConflicts: mappingGroups.filter((group) => !group.consistent),
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const destination = outputPath();

  if (destination) {
    await writeFile(destination, json, "utf8");
  }

  console.log(JSON.stringify(result.summary, null, 2));
}

await main();
