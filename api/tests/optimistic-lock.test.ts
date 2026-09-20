import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { pagoCasWhere, type PagoLockSnapshot } from '../src/modules/pagos/optimistic-lock';

function snap(over: Partial<PagoLockSnapshot> = {}): PagoLockSnapshot {
  return {
    id: 7,
    estado: 'pendiente',
    movimientoBancoId: null,
    referencia: '12345678',
    montoBs: new Prisma.Decimal('100.00'),
    montoUsd: new Prisma.Decimal('10.00'),
    tasa: new Prisma.Decimal('10.000000'),
    fechaPago: new Date('2026-09-19T00:00:00.000Z'),
    cuentaRecaudadoraId: 1,
    bancoOrigenId: null,
    cliente: 'ACME',
    concepto: 'pago',
    tipoPagoId: null,
    tipoCobro: 'nuevo',
    observaciones: null,
    updatedAt: new Date('2026-09-19T12:00:00.000Z'),
    ...over,
  };
}

describe('pagoCasWhere (CR-002 fix 1: optimistic concurrency guard)', () => {
  it('locks on the identity and the state read from the row', () => {
    const where = pagoCasWhere(snap({ id: 42, estado: 'validado' }));
    expect(where.id).toBe(42);
    expect(where.estado).toBe('validado');
  });

  it('matches on every reconciliation-relevant field', () => {
    const where = pagoCasWhere(snap());
    expect(where.movimientoBancoId).toBeNull();
    expect(where.referencia).toBe('12345678');
    expect(where.montoBs).toEqual(new Prisma.Decimal('100.00'));
    expect(where.montoUsd).toEqual(new Prisma.Decimal('10.00'));
    expect(where.fechaPago).toEqual(new Date('2026-09-19T00:00:00.000Z'));
    expect(where.cuentaRecaudadoraId).toBe(1);
  });

  it('matches on every field an edit can overwrite, so a stale snapshot cannot apply', () => {
    const where = pagoCasWhere(snap());
    for (const key of [
      'tasa',
      'bancoOrigenId',
      'cliente',
      'concepto',
      'tipoPagoId',
      'tipoCobro',
      'observaciones',
      'updatedAt',
    ] as const) {
      expect(where).toHaveProperty(key);
    }
  });

  it('produces a different where clause when a field changed (CAS mismatch is detectable)', () => {
    const original = pagoCasWhere(snap());
    const changed = pagoCasWhere(snap({ montoBs: new Prisma.Decimal('100.01') }));
    expect(changed.montoBs).not.toEqual(original.montoBs);
  });
});
