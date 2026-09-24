import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CheckCircle2, Info, Upload } from 'lucide-react';
import {
  getCatalogoFormPago,
  reportarPago,
  subirEvidenciaPago,
  type ReportarPagoInput,
} from '@/api/pagos';
import { listarCobradores } from '@/api/cobradores';
import { getApiErrorMessage } from '@/api/client';
import { queryKeys, STALE_CATALOGS } from '@/lib/queryClient';
import { usePermiso } from '@/hooks/usePermiso';
import { derivedRate, formatRate, todayInputDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/spinner';
import { ErrorState } from '@/components/common/ErrorState';
import { useToast } from '@/components/ui/toast';
import type { CatalogoFormPago } from '@/types';

const decimal = z
  .string()
  .min(1, 'Requerido')
  .regex(/^\d+(?:[.,]\d{1,2})?$/, 'Use un número positivo con hasta 2 decimales')
  .refine((v) => Number(v.replace(',', '.')) > 0, 'Debe ser mayor a 0');

const baseSchema = z.object({
  bancoOrigenId: z.string(),
  cuentaRecaudadoraId: z.string().min(1, 'Seleccione la cuenta recaudadora'),
  referencia: z.string().min(1, 'La referencia es obligatoria').max(60),
  montoBs: decimal,
  montoUsd: decimal,
  fechaPago: z
    .string()
    .min(1, 'La fecha es obligatoria')
    .refine((v) => v <= todayInputDate(), 'La fecha del pago no puede ser mayor a la fecha de hoy'),
  fechaDocumento: z.string().optional(),
  cliente: z.string().max(180).optional(),
  concepto: z.string().max(255).optional(),
  tipoCobro: z.enum(['nuevo', 'viejo']),
  tipoPagoId: z.string().min(1, 'Seleccione el tipo de pago'),
  observaciones: z.string().max(2000).optional(),
  cobradorId: z.string().optional(),
});

/**
 * Builds the form schema from the `pago.banco_origen_obligatorio` rule so the
 * bank requirement is enforced by the resolver instead of the submit handler.
 */
function makeFormSchema(bancoOrigenObligatorio: boolean) {
  if (!bancoOrigenObligatorio) return baseSchema;
  return baseSchema.extend({
    bancoOrigenId: z.string().min(1, 'Seleccione el banco de origen'),
  });
}

type FormValues = z.infer<typeof baseSchema>;

const MAX_EVIDENCIA_BYTES = 5 * 1024 * 1024;

function normalizeDecimal(v: string) {
  return v.replace(',', '.');
}

function validarEvidencia(file: File): string | null {
  const esPdf = file.type === 'application/pdf';
  const esImagen = file.type.startsWith('image/');
  if (!esPdf && !esImagen) return 'Formato no permitido. Adjunte una imagen o un PDF.';
  if (file.size > MAX_EVIDENCIA_BYTES) return 'El archivo supera el tamaño máximo de 5 MB.';
  return null;
}

/**
 * Remembers, per user and per browser, the collector last chosen by an admin.
 * This is a UX convenience stored client-side: it is never business data, so it
 * lives in localStorage and degrades silently when storage is unavailable.
 * An empty string is a valid remembered value: it means "Yo mismo".
 */
function ultimoCobradorKey(userId: number) {
  return `gentioncobros:ultimoCobrador:${userId}`;
}

function leerUltimoCobrador(userId: number): string | null {
  try {
    return localStorage.getItem(ultimoCobradorKey(userId));
  } catch {
    return null;
  }
}

function guardarUltimoCobrador(userId: number, cobradorId: string): void {
  try {
    localStorage.setItem(ultimoCobradorKey(userId), cobradorId);
  } catch {
    // Storage can be unavailable (private mode, quota). The feature just degrades.
  }
}

function resolveCatalogDefaults(
  data: CatalogoFormPago | undefined,
): Pick<FormValues, 'cuentaRecaudadoraId' | 'tipoPagoId'> {
  const cuentas = data?.cuentasRecaudadoras ?? [];
  const cuentaDefault = data?.defaults.cuentaRecaudadoraId ?? null;
  const cuentaRecaudadoraId =
    cuentaDefault !== null && cuentas.some((c) => c.id === cuentaDefault)
      ? String(cuentaDefault)
      : cuentas.length === 1
        ? String(cuentas[0].id)
        : '';

  const tipos = data?.tiposPago ?? [];
  const tipoDefault = data?.defaults.tipoPagoId ?? null;
  const tipoPagoId =
    tipoDefault !== null && tipos.some((t) => t.id === tipoDefault)
      ? String(tipoDefault)
      : tipos.length === 1
        ? String(tipos[0].id)
        : '';

  return { cuentaRecaudadoraId, tipoPagoId };
}

export default function ReportarPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { tiene, user } = usePermiso();
  // Only a user with `pagos.ver_todos` may pick ANY collector. Everyone else
  // reports as themselves, so the form shows their own collector read-only.
  const puedeElegirCobrador = tiene('pagos.ver_todos');
  const miCobrador = user?.cobrador ?? null;

  const catalogo = useQuery({
    queryKey: queryKeys.catalogoFormPago(),
    queryFn: getCatalogoFormPago,
    staleTime: STALE_CATALOGS,
  });

  const cobradores = useQuery({
    queryKey: queryKeys.cobradores({ pageSize: 200, activo: true }),
    queryFn: () => listarCobradores({ pageSize: 200, activo: true }),
    staleTime: STALE_CATALOGS,
    enabled: puedeElegirCobrador,
  });

  const bancoOrigenObligatorio = catalogo.data?.reglas.bancoOrigenObligatorio ?? true;
  const schema = useMemo(() => makeFormSchema(bancoOrigenObligatorio), [bancoOrigenObligatorio]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      bancoOrigenId: '',
      cuentaRecaudadoraId: '',
      referencia: '',
      montoBs: '',
      montoUsd: '',
      fechaPago: todayInputDate(),
      fechaDocumento: '',
      cliente: '',
      concepto: '',
      tipoCobro: 'nuevo',
      tipoPagoId: '',
      observaciones: '',
      cobradorId: '',
    },
  });

  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [evidenciaError, setEvidenciaError] = useState<string | null>(null);
  const evidenciaInputRef = useRef<HTMLInputElement>(null);

  const montoBs = watch('montoBs');
  const montoUsd = watch('montoUsd');
  const tasaPreview = useMemo(() => derivedRate(normalizeDecimal(montoBs || '0'), normalizeDecimal(montoUsd || '0')), [montoBs, montoUsd]);

  const bancoOptions = useMemo(
    () =>
      (catalogo.data?.bancos ?? []).map((b) => ({
        value: String(b.id),
        label: `${b.codigo} — ${b.nombre}`,
      })),
    [catalogo.data],
  );

  const cobradorOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: '', label: 'Yo mismo' },
      ...(cobradores.data?.data ?? []).map((c) => ({
        value: String(c.id),
        label: `${c.codigo} — ${c.nombre}`,
      })),
    ],
    [cobradores.data],
  );

  useEffect(() => {
    const defaults = resolveCatalogDefaults(catalogo.data);
    setValue('cuentaRecaudadoraId', defaults.cuentaRecaudadoraId);
    setValue('tipoPagoId', defaults.tipoPagoId);
  }, [catalogo.data, setValue]);

  // Restores the last collector used by this admin, once the catalog is loaded.
  // It runs only once per mount so a background refetch never overrides a
  // selection the user already made. A remembered collector is ignored if it is
  // no longer selectable (e.g. it was deactivated).
  const restaurado = useRef(false);
  useEffect(() => {
    if (restaurado.current) return;
    if (!puedeElegirCobrador || !user || !cobradores.data) return;
    restaurado.current = true;
    const recordado = leerUltimoCobrador(user.id);
    if (recordado === null) return;
    if (recordado !== '' && !cobradores.data.data.some((c) => String(c.id) === recordado)) return;
    setValue('cobradorId', recordado);
  }, [puedeElegirCobrador, user, cobradores.data, setValue]);

  const handleEvidenciaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setEvidenciaFile(null);
      setEvidenciaError(null);
      return;
    }
    const error = validarEvidencia(file);
    if (error) {
      setEvidenciaFile(null);
      setEvidenciaError(error);
    } else {
      setEvidenciaFile(file);
      setEvidenciaError(null);
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: ReportarPagoInput = {
        fechaPago: values.fechaPago,
        fechaDocumento: values.fechaDocumento || undefined,
        referencia: values.referencia.trim(),
        ...(values.bancoOrigenId ? { bancoOrigenId: Number(values.bancoOrigenId) } : {}),
        cuentaRecaudadoraId: Number(values.cuentaRecaudadoraId),
        montoBs: normalizeDecimal(values.montoBs),
        montoUsd: normalizeDecimal(values.montoUsd),
        cliente: values.cliente || undefined,
        concepto: values.concepto || undefined,
        tipoCobro: values.tipoCobro,
        tipoPagoId: Number(values.tipoPagoId),
        observaciones: values.observaciones || undefined,
        cobradorId: values.cobradorId ? Number(values.cobradorId) : undefined,
      };
      const pago = await reportarPago(payload);
      if (!evidenciaFile) return { pago, evidenciaError: null as string | null };
      try {
        await subirEvidenciaPago(pago.id, evidenciaFile);
        return { pago, evidenciaError: null as string | null };
      } catch (error) {
        return { pago, evidenciaError: getApiErrorMessage(error) };
      }
    },
    onSuccess: ({ evidenciaError }, variables) => {
      if (evidenciaError) {
        toast.toast({
          variant: 'warning',
          title: 'Pago guardado, pero el comprobante no se subió',
          description: `El pago fue registrado correctamente; solo falló el comprobante. ${evidenciaError}`,
        });
      } else {
        toast.success('Pago reportado', 'El pago quedó pendiente por validar.');
      }
      setEvidenciaFile(null);
      setEvidenciaError(null);
      if (evidenciaInputRef.current) evidenciaInputRef.current.value = '';
      // The next registration starts pre-selected with the collector just used.
      const cobradorElegido = puedeElegirCobrador ? variables.cobradorId ?? '' : '';
      if (puedeElegirCobrador && user) guardarUltimoCobrador(user.id, cobradorElegido);
      const defaults = resolveCatalogDefaults(catalogo.data);
      reset({
        bancoOrigenId: '',
        cuentaRecaudadoraId: defaults.cuentaRecaudadoraId,
        tipoPagoId: defaults.tipoPagoId,
        referencia: '',
        montoBs: '',
        montoUsd: '',
        fechaPago: todayInputDate(),
        fechaDocumento: '',
        cliente: '',
        concepto: '',
        tipoCobro: 'nuevo',
        observaciones: '',
        cobradorId: cobradorElegido,
      });
      queryClient.invalidateQueries({ queryKey: ['pagos'] });
    },
    onError: (error) => toast.error('No se pudo reportar el pago', getApiErrorMessage(error)),
  });

  if (catalogo.isLoading) return <LoadingState label="Cargando catálogos…" />;
  if (catalogo.isError) return <ErrorState error={catalogo.error} onRetry={() => catalogo.refetch()} />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Reportar pago"
        description="Registre el pago recibido. La tasa se calcula automáticamente: Bs ÷ USD."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Datos del pago
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bancoOrigenId">
                  Banco de origen{' '}
                  {bancoOrigenObligatorio ? (
                    '*'
                  ) : (
                    <span className="font-normal text-muted-foreground">(opcional)</span>
                  )}
                </Label>
                <Controller
                  name="bancoOrigenId"
                  control={control}
                  render={({ field }) => (
                    <Combobox
                      id="bancoOrigenId"
                      value={field.value}
                      onChange={field.onChange}
                      options={bancoOptions}
                      placeholder="Seleccione…"
                      className="h-11 [&>button]:h-11"
                    />
                  )}
                />
                {errors.bancoOrigenId && (
                  <p className="text-xs text-destructive">{errors.bancoOrigenId.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cuentaRecaudadoraId">Cuenta recaudadora *</Label>
                <Select id="cuentaRecaudadoraId" className="h-11" {...register('cuentaRecaudadoraId')}>
                  <option value="">Seleccione…</option>
                  {catalogo.data?.cuentasRecaudadoras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.banco.nombre} — {c.numeroCuenta}
                    </option>
                  ))}
                </Select>
                {errors.cuentaRecaudadoraId && (
                  <p className="text-xs text-destructive">{errors.cuentaRecaudadoraId.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="referencia">Referencia *</Label>
              <Input
                id="referencia"
                inputMode="numeric"
                className="h-11"
                placeholder="Ej. 123456789"
                {...register('referencia')}
              />
              {errors.referencia && <p className="text-xs text-destructive">{errors.referencia.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="montoBs">Monto recibido (Bs) *</Label>
                <Input
                  id="montoBs"
                  inputMode="decimal"
                  className="h-11"
                  placeholder="0.00"
                  {...register('montoBs')}
                />
                {errors.montoBs && <p className="text-xs text-destructive">{errors.montoBs.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="montoUsd">Monto en dólares (USD) *</Label>
                <Input
                  id="montoUsd"
                  inputMode="decimal"
                  className="h-11"
                  placeholder="0.00"
                  {...register('montoUsd')}
                />
                {errors.montoUsd && <p className="text-xs text-destructive">{errors.montoUsd.message}</p>}
              </div>
            </div>

            <div className="rounded-lg border bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tasa calculada (solo lectura)
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {tasaPreview !== null ? `${formatRate(tasaPreview)} Bs/USD` : '—'}
                  </p>
                </div>
                <Calculator className="h-6 w-6 text-primary" />
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                La tasa es un valor derivado (Bs ÷ USD). No es editable y se confirma al guardar.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fechaPago">Fecha de pago *</Label>
                <Input id="fechaPago" type="date" className="h-11" max={todayInputDate()} {...register('fechaPago')} />
                {errors.fechaPago && <p className="text-xs text-destructive">{errors.fechaPago.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fechaDocumento">Fecha del documento (opcional)</Label>
                <Input id="fechaDocumento" type="date" className="h-11" {...register('fechaDocumento')} />
                <p className="text-xs text-muted-foreground">
                  Permite clasificar automáticamente nuevo/viejo.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cliente">Cliente</Label>
                <Input id="cliente" className="h-11" {...register('cliente')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="concepto">Concepto</Label>
                <Input id="concepto" className="h-11" {...register('concepto')} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tipoCobro">Tipo de cobro *</Label>
                <Select id="tipoCobro" className="h-11" {...register('tipoCobro')}>
                  <option value="nuevo">Nuevo</option>
                  <option value="viejo">Viejo</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tipoPagoId">Tipo de pago *</Label>
                <Select id="tipoPagoId" className="h-11" {...register('tipoPagoId')}>
                  <option value="">Seleccione…</option>
                  {catalogo.data?.tiposPago.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>
                {errors.tipoPagoId && (
                  <p className="text-xs text-destructive">{errors.tipoPagoId.message}</p>
                )}
              </div>
              {puedeElegirCobrador ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cobradorId">Cobrador (reportar a nombre de)</Label>
                  <Controller
                    name="cobradorId"
                    control={control}
                    render={({ field }) => (
                      <Combobox
                        id="cobradorId"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        options={cobradorOptions}
                        placeholder="Yo mismo"
                        emptyMessage="Sin cobradores que coincidan"
                        className="h-11 [&>button]:h-11"
                      />
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use el buscador para filtrar por código o nombre. Se preselecciona el último
                    cobrador que usó.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="cobradorAsignado">Cobrador (a su nombre)</Label>
                  <Input
                    id="cobradorAsignado"
                    className="h-11 bg-muted"
                    value={miCobrador ? `${miCobrador.codigo} — ${miCobrador.nombre}` : ''}
                    placeholder="Sin cobrador asignado"
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    {miCobrador
                      ? 'Los pagos que reporte quedan registrados a su nombre. No es editable.'
                      : 'Su usuario no tiene un cobrador asignado. Contacte al administrador.'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Textarea id="observaciones" rows={3} {...register('observaciones')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="evidencia">Comprobante del banco (imagen o PDF, opcional)</Label>
              <input
                ref={evidenciaInputRef}
                id="evidencia"
                type="file"
                accept="image/*,application/pdf"
                onChange={handleEvidenciaChange}
                className="block w-full cursor-pointer rounded-md border border-input bg-background text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
              />
              {evidenciaError ? (
                <p className="text-xs text-destructive">{evidenciaError}</p>
              ) : evidenciaFile ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Upload className="h-3 w-3" />
                  {evidenciaFile.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Tamaño máximo 5 MB.</p>
              )}
            </div>

            <Button type="submit" size="lg" className="h-12 w-full" loading={mutation.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Guardar pago
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
