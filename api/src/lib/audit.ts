import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Json = Prisma.InputJsonValue;

export interface AuditInput {
  usuarioId?: number | null;
  entidad: string;
  entidadId?: number | null;
  accion:
    | 'crear'
    | 'editar'
    | 'validar'
    | 'rechazar'
    | 'borrar'
    | 'borrar_definitivo'
    | 'importar'
    | 'login';
  datosAntes?: unknown;
  datosDespues?: unknown;
  ip?: string | null;
}

/**
 * Writes an audit trail entry (section 4, model `auditoria`).
 * Intentionally never throws on failure: auditing must not break the operation.
 *
 * Pass `tx` to enroll the entry in a caller-owned transaction. In that mode the
 * caller has opted into atomicity, so a failed write is rethrown and aborts the
 * transaction instead of being swallowed.
 */
export async function auditar(
  input: AuditInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  try {
    await client.auditoria.create({
      data: {
        usuarioId: input.usuarioId ?? null,
        entidad: input.entidad,
        entidadId: input.entidadId ?? null,
        accion: input.accion,
        datosAntes: (input.datosAntes ?? null) as Json | undefined,
        datosDespues: (input.datosDespues ?? null) as Json | undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Audit write failed:', err);
    if (tx) throw err;
  }
}

/** Serializes a Prisma record into a JSON-safe snapshot for auditing. */
export function snapshot(value: unknown): unknown {
  if (value == null) return null;
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === 'object' && v !== null && typeof (v as { toJSON?: unknown }).toJSON === 'function'
        ? (v as { toJSON: () => unknown }).toJSON()
        : v,
    ),
  );
}
