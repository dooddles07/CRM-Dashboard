import { toDataURL } from "qrcode";

/**
 * `qrcode` (node-qrcode) wasn't a dependency before this task — checked
 * package.json first (task-4-brief.md §3). No QR renderer existed anywhere
 * in this codebase. Chosen for being the standard, most widely used pure-JS
 * QR encoder (no native/canvas dependency required for the `toDataURL`
 * path used here), MIT licensed. Rendered server-side so the client never
 * needs its own QR-drawing code — the Server Action returns a plain
 * `data:image/png;base64,...` string the enrolment UI drops straight into
 * an `<img src>`.
 */
export async function totpUriToQrDataUrl(totpUri: string): Promise<string> {
  return toDataURL(totpUri, { errorCorrectionLevel: "M", margin: 1, width: 240 });
}

/**
 * The `otpauth://totp/...?secret=BASE32SECRET&issuer=...` URI Better
 * Auth's `enableTwoFactor`/`getTOTPURI` endpoints return
 * (node_modules/better-auth/dist/plugins/two-factor/totp/index.mjs, via
 * `@better-auth/utils/otp`'s `createOTP(...).url(...)`) embeds the raw
 * base32 secret as a query parameter — this pulls it back out for the
 * "can't scan? enter this key manually" fallback every authenticator app
 * UI offers. A plain regex rather than `new URL(...)`: Node's WHATWG URL
 * parser treats `otpauth:` as a non-special scheme, and its handling of
 * the `?query` boundary for non-special schemes isn't something to lean
 * on here when a regex is simpler and unambiguous either way.
 */
export function extractManualEntryKey(totpUri: string): string {
  const match = /[?&]secret=([^&]+)/.exec(totpUri);
  return match ? decodeURIComponent(match[1]) : "";
}
