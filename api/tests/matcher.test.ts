import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  calcularPuntaje,
  coincideReferenciaMonto,
  evaluarVinculoConciliacion,
  MIN_DIGITOS_CONTRASTE,
  normalizarReferencia,
  referenciasCoinciden,
  sufijoReferencia,
  type MovimientoCandidato,
  type PagoParaConciliar,
  type PagoParaDuplicado,
} from '../src/modules/conciliacion/matcher';

const CONFIG = { toleranciaMontoBs: 0.01, ventanaDias: 3, referenciaSufijo: 8 };

function pago(over: Partial<PagoParaConciliar> = {}): PagoParaConciliar {
  return {
    referencia: '12345678',
    montoBs: new Prisma.Decimal('3600.00'),
    fechaPago: new Date('2026-09-19T00:00:00.000Z'),
    cuentaRecaudadoraId: 1,
    ...over,
  };
}

function mov(over: Partial<MovimientoCandidato> = {}): MovimientoCandidato {
  return {
    id: 1,
    referencia: '12345678',
    montoBs: new Prisma.Decimal('3600.00'),
    fechaEjecucion: new Date('2026-09-19T00:00:00.000Z'),
    ...over,
  };
}

describe('sufijoReferencia', () => {
  it('returns the last N digits', () => {
    expect(sufijoReferencia('120012345678', 8)).toBe('12345678');
  });

  it('falls back to the whole reference when it is shorter than N', () => {
    expect(sufijoReferencia('5678', 8)).toBe('5678');
  });

  it('normalizes non-digits before comparing (CR-001 R1)', () => {
    expect(normalizarReferencia('12-34')).toBe('1234');
    expect(sufijoReferencia('12-34', 8)).toBe('1234');
    expect(sufijoReferencia('  12 34 ', 8)).toBe('1234');
  });
});

describe('referenciasCoinciden (CR-001 R1: 4-digit contrast floor)', () => {
  it('matches a 4-digit reference against a longer bank reference', () => {
    const r = referenciasCoinciden('5678', '120099995678', 8);
    expect(r.exacta).toBe(false);
    expect(r.sufijo).toBe(true);
  });

  it('does not match when the converted full suffixes differ', () => {
    // 12345678 vs 99995678: both are 8 digits, so contrast is the full value.
    const r = referenciasCoinciden('12345678', '99995678', 8);
    expect(r.sufijo).toBe(false);
  });

  it('does not suffix-match a 1-3 digit reference', () => {
    for (const ref of ['1', '12', '123']) {
      const r = referenciasCoinciden(ref, `99999${ref}`, 8);
      expect(r.sufijo).toBe(false);
    }
  });

  it('still matches short references by exact equality', () => {
    expect(referenciasCoinciden('123', '123', 8)).toEqual({ exacta: true, sufijo: false });
  });

  it('exposes the contrast floor as a named constant', () => {
    expect(MIN_DIGITOS_CONTRASTE).toBe(4);
  });
});

describe('referenciasCoinciden (spec 5.2: exact and suffix match)', () => {
  it('matches exactly', () => {
    expect(referenciasCoinciden('12345678', '12345678', 8)).toEqual({ exacta: true, sufijo: false });
  });

  it('matches a partial reference reported by the collector', () => {
    // Collector reported a longer reference; the bank recorded a shorter one.
    const r = referenciasCoinciden('120012345678', '12345678', 8);
    expect(r.exacta).toBe(false);
    expect(r.sufijo).toBe(true);
  });

  it('does not match unrelated references', () => {
    const r = referenciasCoinciden('12345678', '87654321', 8);
    expect(r.exacta).toBe(false);
    expect(r.sufijo).toBe(false);
  });
});

describe('referenciasCoinciden (4-digit suffix contrast)', () => {
  const SUFFIX = 4;

  it('matches a longer bank reference that shares the reported last 4 digits', () => {
    // Last 4 digits coincide ("5678"); the last 8 do NOT ("11115678" vs "99995678").
    const r = referenciasCoinciden('11115678', '120099995678', SUFFIX);
    expect(r.exacta).toBe(false);
    expect(r.sufijo).toBe(true);
  });

  it('does not contrast when only the last 3 digits coincide', () => {
    // "5678" vs "9999678" share the trailing "678" but differ at the 4th digit.
    const r = referenciasCoinciden('5678', '9999678', SUFFIX);
    expect(r.exacta).toBe(false);
    expect(r.sufijo).toBe(false);
  });

  it('still enforces MIN_DIGITOS_CONTRASTE for references shorter than 4 digits', () => {
    for (const ref of ['1', '12', '123']) {
      const r = referenciasCoinciden(ref, `99999${ref}`, SUFFIX);
      expect(r.sufijo).toBe(false);
    }
    expect(MIN_DIGITOS_CONTRASTE).toBe(4);
  });

  it('drives the contrast through the configured suffix in calcularPuntaje', () => {
    const pagoLargo = pago({ referencia: '11115678' });
    const movBanco = mov({ referencia: '120099995678' });

    const con4 = calcularPuntaje(pagoLargo, movBanco, { ...CONFIG, referenciaSufijo: 4 });
    expect(con4).not.toBeNull();
    expect(con4!.coincidenciaSufijo).toBe(true);

    // The old 8-digit contrast does NOT match the same pair, so these assertions
    // fail if the engine ignores `referenciaSufijo`.
    expect(
      calcularPuntaje(pagoLargo, movBanco, { ...CONFIG, referenciaSufijo: 8 }),
    ).toBeNull();
  });
});

describe('calcularPuntaje (spec 5.2)', () => {
  it('scores a perfect match (exact ref + exact amount + same day) at 100', () => {
    const c = calcularPuntaje(pago(), mov(), CONFIG);
    expect(c).not.toBeNull();
    expect(c!.puntaje).toBe(100);
    expect(c!.referenciaExacta).toBe(true);
    expect(c!.diferenciaMontoBs).toBe('0.00');
    expect(c!.diferenciaDias).toBe(0);
  });

  it('accepts amounts within the configured tolerance', () => {
    const c = calcularPuntaje(pago(), mov({ montoBs: new Prisma.Decimal('3600.01') }), CONFIG);
    expect(c).not.toBeNull();
    expect(c!.diferenciaMontoBs).toBe('0.01');
  });

  it('rejects amounts outside the tolerance', () => {
    const c = calcularPuntaje(pago(), mov({ montoBs: new Prisma.Decimal('3600.02') }), CONFIG);
    expect(c).toBeNull();
  });

  it('accepts dates within +/- window days and rejects beyond it', () => {
    const dentro = calcularPuntaje(
      pago(),
      mov({ fechaEjecucion: new Date('2026-09-16T00:00:00.000Z') }),
      CONFIG,
    );
    expect(dentro).not.toBeNull();
    expect(dentro!.diferenciaDias).toBe(3);

    const fuera = calcularPuntaje(
      pago(),
      mov({ fechaEjecucion: new Date('2026-09-15T00:00:00.000Z') }),
      CONFIG,
    );
    expect(fuera).toBeNull();
  });

  it('returns null when the reference does not match at all', () => {
    expect(calcularPuntaje(pago(), mov({ referencia: '99999999' }), CONFIG)).toBeNull();
  });

  it('scores an exact match higher than a suffix match', () => {
    const exacto = calcularPuntaje(pago(), mov(), CONFIG)!;
    const sufijo = calcularPuntaje(pago({ referencia: '120012345678' }), mov(), CONFIG)!;
    expect(exacto.puntaje).toBeGreaterThan(sufijo.puntaje);
    expect(sufijo.coincidenciaSufijo).toBe(true);
  });

  it('rejects a below-floor reference even with matching amount and date (CR-001 R1)', () => {
    expect(
      calcularPuntaje(pago({ referencia: '123' }), mov({ referencia: '99999123' }), CONFIG),
    ).toBeNull();
  });
});

describe('evaluarVinculoConciliacion (CR-002: hot edit of a validated payment)', () => {
  function movimiento(
    over: Partial<MovimientoCandidato & { cuentaRecaudadoraId: number }> = {},
  ): MovimientoCandidato & { cuentaRecaudadoraId: number } {
    return { ...mov(), cuentaRecaudadoraId: 1, ...over };
  }

  it('keeps the link when only non-conciliation fields change (editing cliente)', () => {
    // cliente / concepto / observaciones are not match inputs, so the effective
    // match values are unchanged: the link must survive the edit.
    const c = evaluarVinculoConciliacion(pago(), movimiento(), CONFIG);
    expect(c).not.toBeNull();
    expect(c!.puntaje).toBe(100);
  });

  it('keeps the link when the new amount stays within tolerance', () => {
    const c = evaluarVinculoConciliacion(
      pago({ montoBs: new Prisma.Decimal('3600.01') }),
      movimiento(),
      CONFIG,
    );
    expect(c).not.toBeNull();
    expect(c!.diferenciaMontoBs).toBe('0.01');
  });

  it('blocks the edit when the new amount leaves the tolerance', () => {
    expect(
      evaluarVinculoConciliacion(
        pago({ montoBs: new Prisma.Decimal('3600.02') }),
        movimiento(),
        CONFIG,
      ),
    ).toBeNull();
  });

  it('blocks the edit when the reference no longer matches', () => {
    expect(
      evaluarVinculoConciliacion(pago({ referencia: '99999999' }), movimiento(), CONFIG),
    ).toBeNull();
  });

  it('blocks the edit when the date leaves the window', () => {
    expect(
      evaluarVinculoConciliacion(
        pago({ fechaPago: new Date('2026-09-30T00:00:00.000Z') }),
        movimiento(),
        CONFIG,
      ),
    ).toBeNull();
  });

  it('blocks the edit when the collection account changes (invariant)', () => {
    expect(
      evaluarVinculoConciliacion(pago({ cuentaRecaudadoraId: 2 }), movimiento(), CONFIG),
    ).toBeNull();
  });
});

describe('coincideReferenciaMonto (CR-001 R3: duplicate signal, no date window)', () => {
  function pagoDuplicado(over: Partial<PagoParaDuplicado> = {}): PagoParaDuplicado {
    return {
      referencia: '5678',
      montoBs: new Prisma.Decimal('3600.00'),
      cuentaRecaudadoraId: 1,
      ...over,
    };
  }

  it('matches reference contrast + amount, ignoring the date entirely', () => {
    const lejano = mov({
      referencia: '120099995678',
      fechaEjecucion: new Date('2020-01-01T00:00:00.000Z'),
    });
    expect(coincideReferenciaMonto(pagoDuplicado(), lejano, CONFIG)).toBe(true);
  });

  it('requires the amount to stay within tolerance', () => {
    const movDistinto = mov({
      referencia: '120099995678',
      montoBs: new Prisma.Decimal('3600.02'),
    });
    expect(coincideReferenciaMonto(pagoDuplicado(), movDistinto, CONFIG)).toBe(false);
  });

  it('requires the reference to match', () => {
    expect(
      coincideReferenciaMonto(pagoDuplicado(), mov({ referencia: '11111111' }), CONFIG),
    ).toBe(false);
  });
});
