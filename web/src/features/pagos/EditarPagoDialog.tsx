import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { editarPago } from '@/api/pagos';
import { getApiErrorMessage } from '@/api/client';
import { derivedRate, formatDate, formatRate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import type { PagoReportado } from '@/types';

interface EditarPagoForm {
  referencia: string;
  montoBs: string;
  montoUsd: string;
  cliente: string;
  concepto: string;
}

export interface EditarPagoDialogProps {
  pago: PagoReportado | null;
  onClose: () => void;
  onSuccess?: () => void;
}

function formDesdePago(pago: PagoReportado | null): EditarPagoForm {
  return {
    referencia: pago?.referencia ?? '',
    montoBs: pago?.montoBs ?? '',
    montoUsd: pago?.montoUsd ?? '',
    cliente: pago?.cliente ?? '',
    concepto: pago?.concepto ?? '',
  };
}

export function EditarPagoDialog({ pago, onClose, onSuccess }: EditarPagoDialogProps) {
  const toast = useToast();
  const [form, setForm] = useState<EditarPagoForm>(() => formDesdePago(pago));
  const [pagoId, setPagoId] = useState<number | null>(pago?.id ?? null);

  // Reset the form when the edited payment changes, without losing user input on
  // a failed save (the same pago id keeps the current form values).
  if ((pago?.id ?? null) !== pagoId) {
    setPagoId(pago?.id ?? null);
    setForm(formDesdePago(pago));
  }

  const edicionMutation = useMutation({
    mutationFn: () => {
      if (!pago) throw new Error('Sin pago');
      return editarPago(pago.id, {
        referencia: form.referencia,
        montoBs: form.montoBs.replace(',', '.'),
        montoUsd: form.montoUsd.replace(',', '.'),
        cliente: form.cliente,
        concepto: form.concepto,
      });
    },
    onSuccess: () => {
      toast.success('Pago actualizado');
      onClose();
      onSuccess?.();
    },
    onError: (error) => toast.error('No se pudo actualizar', getApiErrorMessage(error)),
  });

  const esValidado = pago?.estado === 'validado';
  const esPendiente = pago?.estado === 'pendiente';
  const titulo = esPendiente ? 'Editar pago pendiente' : esValidado ? 'Editar pago validado' : 'Editar pago';

  const tasaEdit = derivedRate(
    form.montoBs.replace(',', '.') || '0',
    form.montoUsd.replace(',', '.') || '0',
  );

  return (
    <Dialog
      open={pago !== null}
      onClose={onClose}
      title={titulo}
      description="Si modifica los montos, la tasa se recalcula automáticamente."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={edicionMutation.isPending} onClick={() => edicionMutation.mutate()}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {esValidado && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            Este pago está validado y conciliado con un movimiento bancario. Al guardar, el sistema
            vuelve a evaluar la conciliación: si la edición rompe la coincidencia, no se aplicará y
            deberá revertir la validación antes de editar.
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="edit-ref">Referencia</Label>
          <Input
            id="edit-ref"
            value={form.referencia}
            onChange={(e) => setForm({ ...form, referencia: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-bs">Monto Bs</Label>
            <Input
              id="edit-bs"
              inputMode="decimal"
              value={form.montoBs}
              onChange={(e) => setForm({ ...form, montoBs: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-usd">Monto USD</Label>
            <Input
              id="edit-usd"
              inputMode="decimal"
              value={form.montoUsd}
              onChange={(e) => setForm({ ...form, montoUsd: e.target.value })}
            />
          </div>
        </div>
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          Tasa calculada:{' '}
          <span className="font-semibold tabular-nums">
            {tasaEdit !== null ? formatRate(tasaEdit) : '—'}
          </span>{' '}
          Bs/USD
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-cliente">Cliente</Label>
            <Input
              id="edit-cliente"
              value={form.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-concepto">Concepto</Label>
            <Input
              id="edit-concepto"
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
            />
          </div>
        </div>
        {pago && (
          <p className="text-xs text-muted-foreground">
            Fecha de pago: {formatDate(pago.fechaPago)} · Cuenta: {pago.cuentaRecaudadora.banco.nombre}
          </p>
        )}
      </div>
    </Dialog>
  );
}
