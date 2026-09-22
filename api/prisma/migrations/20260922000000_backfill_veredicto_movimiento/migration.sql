-- Backfill the movement-derived vintage verdict for historical validated payments.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Commit 894b8ac (CR-005) started persisting `tipo_cobro_derivado` together with
-- `fuente_derivacion = 'movimiento'` at VALIDATION time. The column itself was
-- added by migration 20260921230918 with NO backfill, so every payment validated
-- before that deploy has `fuente_derivacion IS NULL`. The "nuevo vs viejo"
-- reports filter on `fuente_derivacion = 'movimiento'`, so those historical rows
-- are excluded and the charts currently show ZERO.
--
-- This statement classifies that historical set by re-deriving the verdict from
-- the linked bank movement, exactly as the application does at validation time.
--
-- THRESHOLD IS READ FROM `parametros`, NEVER HARDCODED
-- ----------------------------------------------------
-- The threshold is environment-dependent: the local DB seeds
-- `cobro.umbral_antiguedad_dias = 30` while production runs `1`. A hardcoded
-- value would classify the same data differently per environment, so it is read
-- from `parametros` at execution time.
-- Fallback = 1: when the parameter row is missing the migration must still be
-- deterministic. `1` matches the production value and the "1 day or more is old"
-- intent of `esPagoViejo` (`hueco >= umbral`), so it is the defensible default.
--
-- SEMANTIC PARITY WITH THE APP
-- ----------------------------
-- `hueco = DATEDIFF(p.fecha_pago, mb.fecha_ejecucion)` is a signed whole-day gap.
-- Both columns are DATE, so DATEDIFF floors to whole days exactly like
-- `antiguedadEnDias`'s `Math.floor`. `hueco >= umbral` mirrors `esPagoViejo`.
-- Negative gaps (movement executed AFTER the reported date) are naturally never
-- "viejo" for any non-negative threshold.
-- `revisar_clasificacion` uses the same mismatch rule as `requiereRevision`: flag
-- when the derived value differs from the collector's mark. `tipo_cobro` is the
-- collector's own mark and is NEVER overwritten.
--
-- IDEMPOTENCY GUARD
-- -----------------
-- Prisma applies each migration only once, but this statement is written to be
-- SAFE TO RE-RUN. The `fuente_derivacion IS NULL OR fuente_derivacion <> 'movimiento'`
-- predicate means a second run (or any partially-applied state) only visits rows
-- that still lack a movement-derived verdict, so it converges instead of
-- double-writing.
--
-- DELIBERATELY LEFT UNTOUCHED
-- ---------------------------
-- - Non-validated payments (pendiente/rechazado/duplicado) are NOT modified:
--   they carry no linked movement, so there is no verdict to derive. Their
--   `tipo_cobro_derivado` / `fuente_derivacion` stay exactly as they are.
-- - Validated rows without a linked movement row are excluded by the INNER JOIN.
--
-- IRREVERSIBLE
-- ------------
-- This reclassifies historical data in place. There is no down-migration; a
-- rollback requires restoring from a backup or redeploying the previous version.
--
-- Safe on an empty or already-backfilled database: it simply affects 0 rows.

UPDATE pagos_reportados p
JOIN movimientos_banco mb ON mb.id = p.movimiento_banco_id
SET
  -- Derived verdict, exactly like the app: gap of `umbral` days OR MORE is old.
  p.tipo_cobro_derivado = CASE
    WHEN DATEDIFF(p.fecha_pago, mb.fecha_ejecucion)
         >= COALESCE(
              (SELECT CAST(valor AS SIGNED)
               FROM parametros
               WHERE clave = 'cobro.umbral_antiguedad_dias'),
              1
            )
    THEN 'viejo'
    ELSE 'nuevo'
  END,
  -- Provenance marker consumed by the reports; its absence is why the charts
  -- showed zero before this backfill.
  p.fuente_derivacion = 'movimiento',
  -- Recompute the derived value inline instead of reading the column just
  -- assigned above: in a multi-table UPDATE the evaluation order of SET
  -- expressions is unspecified, so this stays correct on every MySQL/MariaDB.
  p.revisar_clasificacion = (
    CASE
      WHEN DATEDIFF(p.fecha_pago, mb.fecha_ejecucion)
           >= COALESCE(
                (SELECT CAST(valor AS SIGNED)
                 FROM parametros
                 WHERE clave = 'cobro.umbral_antiguedad_dias'),
                1
              )
      THEN 'viejo'
      ELSE 'nuevo'
    END
  ) <> p.tipo_cobro
WHERE p.estado = 'validado'
  AND p.movimiento_banco_id IS NOT NULL
  -- Idempotency guard: only rows still missing a movement-derived verdict.
  AND (p.fuente_derivacion IS NULL OR p.fuente_derivacion <> 'movimiento');
