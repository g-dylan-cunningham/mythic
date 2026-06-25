type PrintavoConnectionResult =
  | {
      ok: true;
      status: number;
      url: string;
      data: unknown;
    }
  | {
      ok: false;
      status: number | null;
      url: string | null;
      error: string;
      data?: unknown;
    };

function getPrintavoConfig() {
  const baseUrl = process.env.PRINTAVO_API_BASE_URL ?? "https://www.printavo.com";
  const version = process.env.PRINTAVO_API_VERSION ?? "v1";
  const email = process.env.PRINTAVO_API_EMAIL;
  const token = process.env.PRINTAVO_API_TOKEN;

  if (!email || !token) {
    return {
      ok: false as const,
      error: "Missing PRINTAVO_API_EMAIL or PRINTAVO_API_TOKEN.",
    };
  }

  return {
    ok: true as const,
    baseUrl,
    email,
    token,
    version,
  };
}

export async function testPrintavoConnection(): Promise<PrintavoConnectionResult> {
  const config = getPrintavoConfig();

  if (!config.ok) {
    console.error("[printavo] connection test skipped:", config.error);

    return {
      ok: false,
      status: null,
      url: null,
      error: config.error,
    };
  }

  const url = new URL(`/api/${config.version}/accounts`, config.baseUrl);
  url.searchParams.set("email", config.email);
  url.searchParams.set("token", config.token);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      console.error("[printavo] connection test failed:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });

      return {
        ok: false,
        status: response.status,
        url: `${url.origin}${url.pathname}`,
        error: `Printavo returned ${response.status} ${response.statusText}.`,
        data,
      };
    }

    return {
      ok: true,
      status: response.status,
      url: `${url.origin}${url.pathname}`,
      data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Printavo request error.";

    console.error("[printavo] connection test error:", error);

    return {
      ok: false,
      status: null,
      url: `${url.origin}${url.pathname}`,
      error: message,
    };
  }
}
