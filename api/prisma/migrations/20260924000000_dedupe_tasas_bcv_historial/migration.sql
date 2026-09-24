-- Collapse consecutive duplicate rows in the BCV rate history.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Before the value-based dedupe landed, the hourly BCV poll appended a new
-- `tasas_bcv` row for the SAME `usd` whenever the external API republished the
-- rate under a new `apiId`. Commit 9aacc8e stopped the app from writing those
-- rows forward, but the code change alone does NOT remove the duplicates already
-- stored in production. This statement cleans up that existing history.
--
-- WHAT IT KEEPS
-- -------------
-- For every run of consecutive rows sharing the same `usd` (ordered by `id`), it
-- keeps ONLY the FIRST row (`min(id)`) and deletes the rest. A value that
-- legitimately reappears AFTER a different value is preserved: that is exactly
-- what the new forward rule allows, so the history keeps telling the truth.
--
-- WHY NOT GLOBAL (one row per value ever)
-- ---------------------------------------
-- Collapsing every equal value globally would delete a legitimate RETURN to a
-- previous value. Those rows are the newest by `fecha_api`, so deleting them
-- would make `obtenerActual()` (the "tasa actual" display, latest by
-- `fecha_api`) show a stale rate. Consecutive collapsing is the conservative
-- choice: it removes only true run-length noise.
--
-- SEMANTIC PARITY WITH THE APP
-- ----------------------------
-- This mirrors the app's forward rule, which compares the incoming value against
-- the MOST RECENT stored rate. The self-join below does the same, comparing each
-- row to the nearest earlier row of equal value with no different value in
-- between.
--
-- IDEMPOTENCY
-- -----------
-- Safe to re-run: once runs are collapsed the join matches nothing, and the
-- statement converges instead of deleting further rows.
--
-- NO FOREIGN KEY IMPACT
-- ---------------------
-- `tasas_bcv` has no foreign keys and no relations in `schema.prisma`; nothing
-- references it, so deleting rows cannot cascade or orphan anything.
--
-- IRREVERSIBLE
-- ------------
-- This deletes historical rows in place. There is no down-migration; a rollback
-- requires restoring from a backup.
--
-- Safe on an empty or already-clean table: it simply affects 0 rows.

DELETE r
FROM tasas_bcv r
JOIN tasas_bcv p
  ON p.usd = r.usd
 AND p.id < r.id
LEFT JOIN tasas_bcv d
  ON d.id < r.id
 AND d.id > p.id
 AND d.usd <> r.usd
WHERE d.id IS NULL;
