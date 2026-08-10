/**
 * The one place the kebab-case (TypeScript) / snake_case (Postgres) enum
 * boundary is crossed. Every enum member in lib/types.ts differs from its
 * database counterpart only by this substitution — see
 * plan/01-foundation.md §2.1. Do not scatter this conversion elsewhere.
 *
 * Typed as a recursive template literal transform (not a plain `string`
 * return) so that passing e.g. `AppointmentStatus` yields the exact
 * generated pgEnum literal union, not a widened string Drizzle would then
 * reject.
 */
type KebabToSnake<S extends string> = S extends `${infer Head}-${infer Rest}`
  ? `${Head}_${KebabToSnake<Rest>}`
  : S;

type SnakeToKebab<S extends string> = S extends `${infer Head}_${infer Rest}`
  ? `${Head}-${SnakeToKebab<Rest>}`
  : S;

export function toDbEnum<T extends string>(value: T): KebabToSnake<T> {
  return value.replace(/-/g, "_") as KebabToSnake<T>;
}

export function fromDbEnum<T extends string>(value: T): SnakeToKebab<T> {
  return value.replace(/_/g, "-") as SnakeToKebab<T>;
}
