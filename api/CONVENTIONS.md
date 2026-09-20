# Backend Conventions (api/)

This document is the contract every backend module must follow. Read it before
writing code. The goal is consistency, server-side optimization and a good UX.

## Stack

- Node.js + TypeScript (strict), Express 4, Prisma 5, MySQL/MariaDB.
- Zod for validation, bcryptjs for hashing, jsonwebtoken for JWT.

## Module layout

Every feature lives in `src/modules/<name>/` with exactly these files:

```
<name>.schema.ts      Zod schemas + inferred types
<name>.service.ts     business logic + Prisma access (no Express types)
<name>.controller.ts  HTTP glue: reads req, calls service, writes res
<name>.routes.ts      Router with validate/auth/requirePermiso middleware
```

Controllers must be thin. All Prisma access happens in the service.

## Error handling

- Throw `ApiError` from `src/lib/http.ts`. Never build error responses by hand.
- Throw `ApiError.badRequest|unauthorized|forbidden|notFound|conflict`.
- Throw `ZodError` indirectly by parsing input in middleware; the central
  `errorHandler` already maps it to a Spanish `validation_error` payload.
- Wrap every controller with `asyncHandler` from `src/lib/http.ts`.

## Validation

Use `validate({ body, query, params })` from `src/middleware/validate.ts`.
Query strings arrive as strings: use `z.coerce.number()` / `z.coerce.boolean()`
and provide defaults.

## Auth & permissions

- Global gate: `authenticate` from `src/middleware/auth.ts` on protected routers.
- Fine-grained gate: `requirePermiso('pagos.validar')` (ALL keys) or
  `requirePermiso.some('a','b')` (ANY key).
- The session user is `req.user: AuthUser` (id, usuario, rol, permisos, cobradorId).
- **Collector data isolation (spec 3)**: a collector must NEVER see another
  collector's payments. Enforce in the DATA layer, not just the UI: if the user
  has `pagos.ver_propios` and NOT `pagos.ver_todos`, force
  `cobradorId = req.user.cobradorId` in the where clause, ignoring any query
  parameter.

## Pagination, search & filters (MANDATORY)

Every list endpoint is server-side paginated and filterable:

- Use `parsePagination(req.query)` and `paginate(data, total, params)` from
  `src/lib/http.ts`.
- Return shape: `{ data: [...], meta: { page, pageSize, total, totalPages } }`.
- Use Prisma `where`/`orderBy`/`skip`/`take`. NEVER load everything and slice in
  memory.
- Runs two queries in `Promise.all`: `findMany(...)` and `count({ where })`.
- Search: `contains` on the relevant text fields (MySQL is case-insensitive with
  the utf8mb4_unicode_ci collation).

## Money & rates (CRITICAL)

- All money is `DECIMAL(18,2)`, rates `DECIMAL(18,6)`. Use Prisma `Decimal`.
- Serialize Decimal to **string** in JSON responses so no precision is lost:
  `montoBs: row.montoBs.toString()`. Never send Decimals as floats.
- The rate is NEVER accepted as input. Compute it with `calcularTasa()` from
  `src/lib/money.ts` (rounds to 6 decimals). Persist `montoBs`, `montoUsd` and
  `tasa` together. Never recompute a historical amount with a new rate.
- Aggregate sums/averages **in the database** (Prisma `aggregate`/`groupBy` or
  `$queryRaw`). Do not pull rows to sum them in Node.

## Audit

Write an audit entry for crear / editar / validar / rechazar / borrar / importar
using `auditar()` and `snapshot()` from `src/lib/audit.ts`. The signature:

```ts
await auditar({
  usuarioId: req.user.id,
  entidad: 'pagos_reportados',
  entidadId: id,
  accion: 'validar',
  datosAntes: snapshot(before),
  datosDespues: snapshot(after),
  ip: req.ip,
});
```

## Dates & timezone

- Persist and transfer timestamps in UTC (ISO 8601).
- Business timezone is `America/Caracas` (env `BUSINESS_TIMEZONE`).
- Use `dayjs` for date math. Parse `YYYY-MM-DD` filters as UTC day boundaries.

## Response conventions

- Create: `201` + the created resource.
- Update/actions: `200` + the updated resource or a `{ message }` payload.
- Delete: `204`.
- Lists: `{ data, meta }` as above.

## Parameters & config values

Read tunables from the `parametros` table via a small helper, falling back to
env defaults: tolerances (`match.amount_tolerance_bs`), date window
(`match.date_window_days`), reference suffix (`match.reference_suffix`) and the
vintage threshold (`cobro.umbral_antiguedad_dias`).

## File uploads

- Use `multer` with memory storage; validate mime/extension.
- Support files go to `UPLOAD_DIR` (default `uploads/`) and are served at
  `/uploads/...`. Persist the public URL in the record.

## Performance rules

- Select only the fields you need (`select`) or explicitly include relations.
- Avoid N+1: fetch relations with `include`, or batch with `findMany({ where: { id: { in: ids } } })`.
- Add indexes when a new filter needs one (migration).
- Keep list endpoints under ~100ms on the seeded dataset.
