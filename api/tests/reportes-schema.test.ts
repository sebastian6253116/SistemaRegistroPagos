import { describe, expect, it } from 'vitest';
import { exportQuerySchema, reporteQuerySchema } from '../src/modules/reportes/reportes.schema';

/**
 * The report filter was replaced end-to-end: the old numeric age filter is gone
 * and `clasificacionAntiguedad` is the only vintage filter. These tests pin the
 * contract at the schema boundary (the one layer `npm test` can exercise
 * without a database): exactly the two allowed buckets, or absence.
 */
describe('reporteQuerySchema.clasificacionAntiguedad', () => {
  it('accepts both buckets and absence (no filter)', () => {
    expect(
      reporteQuerySchema.parse({ clasificacionAntiguedad: 'del-dia' })
        .clasificacionAntiguedad,
    ).toBe('del-dia');
    expect(
      reporteQuerySchema.parse({ clasificacionAntiguedad: 'viejo' })
        .clasificacionAntiguedad,
    ).toBe('viejo');
    expect(reporteQuerySchema.parse({}).clasificacionAntiguedad).toBeUndefined();
  });

  it('rejects any value outside the two buckets', () => {
    for (const bad of ['nuevo', 'del_dia', 'DEL-DIA', '', '0']) {
      expect(
        reporteQuerySchema.safeParse({ clasificacionAntiguedad: bad }).success,
        `expected ${JSON.stringify(bad)} to be rejected`,
      ).toBe(false);
    }
  });

  it('applies the same rule to the export query schema', () => {
    expect(
      exportQuerySchema.parse({ clasificacionAntiguedad: 'viejo' })
        .clasificacionAntiguedad,
    ).toBe('viejo');
    expect(
      exportQuerySchema.safeParse({ clasificacionAntiguedad: 'nuevo' }).success,
    ).toBe(false);
  });
});
