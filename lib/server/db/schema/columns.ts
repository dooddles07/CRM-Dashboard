import { customType } from "drizzle-orm/pg-core";

/**
 * Encrypted contact columns (plan/01-foundation.md §4.1) and the encrypted
 * secrets on `integrations` all pass through pgcrypto's `pgp_sym_encrypt`,
 * which returns bytea. Drizzle has no built-in bytea column, hence the
 * customType. Encryption/decryption happens in the service layer (Phase
 * 04), never here — this column just stores whatever bytes it is given.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** audit_log.ip_address. Postgres validates the value; the app does not. */
export const inet = customType<{ data: string; driverData: string }>({
  dataType() {
    return "inet";
  },
});
