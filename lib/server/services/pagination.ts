/**
 * The collection envelope every list service returns, matching the shape
 * docs/API.md documents so Phase 05's route handlers serialise it directly
 * rather than reshaping it.
 *
 * ```json
 * { "data": [...],
 *   "meta":  { "page": 1, "perPage": 25, "total": 18241, "totalPages": 730 },
 *   "links": { "next": "/api/v1/patients?page=2", "prev": null } }
 * ```
 *
 * `links` is not built here: a service does not know the route it is being
 * served under, and inventing one would make the service depend on the HTTP
 * layer it is meant to be independent of. Phase 05 adds them from `meta`.
 */
export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

/** What every list service accepts. Services extend it with their own filters. */
export interface PageRequest {
  page?: number;
  perPage?: number;
}

const DEFAULT_PER_PAGE = 25;
/**
 * A caller asking for 10,000 rows is either a mistake or an export, and an
 * export is a different operation with its own capability and its own audit
 * entry (plan/04 §2.2). Capping here rather than trusting the caller means a
 * missing validator upstream cannot turn a list into a bulk extraction.
 */
const MAX_PER_PAGE = 100;

export function resolvePage(request: PageRequest): { page: number; perPage: number; offset: number } {
  const page = Math.max(1, Math.floor(request.page ?? 1));
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(request.perPage ?? DEFAULT_PER_PAGE)));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function paginate<T>(data: T[], total: number, page: number, perPage: number): Paginated<T> {
  return {
    data,
    meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  };
}
