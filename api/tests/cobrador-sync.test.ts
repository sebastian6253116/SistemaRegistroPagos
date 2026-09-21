import { describe, expect, it } from 'vitest';
import { CODIGO_MAX_LENGTH, codigoBaseDesdeUsuario } from '../src/lib/cobrador-sync';

/**
 * The collector code is derived from the login name and must always be a valid
 * `cobradores.codigo` value (<= 40 chars, uppercase, no separators at the
 * edges). The uniqueness suffix is resolved against the database separately.
 */
describe('codigoBaseDesdeUsuario', () => {
  it('uppercases a plain login name', () => {
    expect(codigoBaseDesdeUsuario('cobrador1')).toBe('COBRADOR1');
  });

  it('turns spaces and symbols into single hyphens', () => {
    expect(codigoBaseDesdeUsuario('Cobrador Ruta #1')).toBe('COBRADOR-RUTA-1');
    expect(codigoBaseDesdeUsuario('ruta///2')).toBe('RUTA-2');
  });

  it('keeps the letter of an accented name instead of dropping it', () => {
    expect(codigoBaseDesdeUsuario('José Pérez')).toBe('JOSE-PEREZ');
    expect(codigoBaseDesdeUsuario('Muñoz')).toBe('MUNOZ');
  });

  it('trims separators from both edges', () => {
    expect(codigoBaseDesdeUsuario('  --cobrador--  ')).toBe('COBRADOR');
  });

  it('falls back to COBRADOR when nothing usable is left', () => {
    expect(codigoBaseDesdeUsuario('')).toBe('COBRADOR');
    expect(codigoBaseDesdeUsuario('   ')).toBe('COBRADOR');
    expect(codigoBaseDesdeUsuario('###')).toBe('COBRADOR');
  });

  it('never exceeds the column length', () => {
    const largo = codigoBaseDesdeUsuario('u'.repeat(120));
    expect(largo).toHaveLength(CODIGO_MAX_LENGTH);
  });
});
