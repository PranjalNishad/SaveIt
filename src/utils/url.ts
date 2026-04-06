import type { Platform } from "@/types";

const TRACKING_PARAMS = new Set([
    "igsh",
    "igshid",
    "ig_rid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "si",
    "feature",
    "ref",
    "fbclid",
    "tt_from",
]);

/**
 * Strips tracking query parameters from a URL so the same content
 * always maps to the same cache key regardless of who shared it.
 *
 * Example:
 *   instagram.com/reel/ABC123/?igsh=xyz  →  instagram.com/reel/ABC123/
 *   youtube.com/watch?v=abc&si=xyz       →  youtube.com/watch?v=abc
 */
export function normalizeUrl(rawUrl: string, platform: Platform): string {
    try {
        const url = new URL(rawUrl);

        if (platform === "instagram") {
            url.search = "";
            url.hash = "";
            const path = url.pathname.replace(/\/+$/, "") + "/";
            return `${url.origin}${path}`;
        }

        for (const param of TRACKING_PARAMS) {
            url.searchParams.delete(param);
        }
        url.hash = "";

        return url.toString();
    } catch {
        return rawUrl;
    }
}
