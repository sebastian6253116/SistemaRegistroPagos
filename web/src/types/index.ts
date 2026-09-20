// Tipos del dominio, alineados con las respuestas reales de la API.

export type EstadoPago = 'pendiente' | 'validado' | 'rechazado' | 'duplicado';
export type TipoCobro = 'nuevo' | 'viejo';
export type EstadoConciliacion = 'no_conciliado' | 'conciliado';

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthUser {
  id: number;
  usuario: string;
  nombreCompleto: string;
  rolId: number;
  rol: string;
  permisos: string[];
  cobradorId?: number | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface Banco {
  id: number;
  nombre: string;
  codigo: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CuentaRecaudadora {
  id: number;
  bancoId?: number;
  numeroCuenta: string;
  alias: string | null;
  activo?: boolean;
  banco: { id: number; nombre: string; codigo?: string };
}

export interface Cobrador {
  id: number;
  nombre: string;
  codigo: string;
  usuarioId: number | null;
  activo: boolean;
  usuario?: { id: number; usuario: string } | null;
}

export interface Rol {
  id: number;
  nombre: string;
  descripcion: string | null;
  permisos: string[];
  usuarioCount: number;
}

export interface PermisoItem {
  clave: string;
  descripcion: string | null;
}

export interface PermisoGrupo {
  modulo: string;
  permisos: PermisoItem[];
}

export interface Usuario {
  id: number;
  nombreCompleto: string;
  usuario: string;
  email: string;
  rolId: number;
  activo: boolean;
  ultimoAcceso: string | null;
  rol: { id: number; nombre: string };
}

export interface TipoPago {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  orden: number;
}

export interface TipoPagoInput {
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
  orden?: number;
}

export interface PagoReportado {
  id: number;
  fechaPago: string;
  referencia: string;
  montoBs: string;
  montoUsd: string;
  tasa: string;
  cliente: string | null;
  concepto: string | null;
  tipoCobro: TipoCobro;
  tipoCobroDerivado: TipoCobro | null;
  revisarClasificacion: boolean;
  observaciones: string | null;
  soporteUrl: string | null;
  tipoPagoId: number | null;
  tipoPago?: { id: number; nombre: string } | null;
  estado: EstadoPago;
  motivoRechazo: string | null;
  validadoAt: string | null;
  createdAt: string;
  cobradorId: number;
  bancoOrigenId: number | null;
  cuentaRecaudadoraId: number;
  movimientoBancoId: number | null;
  cobrador: { id: number; nombre: string; codigo: string };
  bancoOrigen: { id: number | null; nombre: string; codigo: string } | null;
  cuentaRecaudadora: {
    id: number;
    numeroCuenta: string;
    alias: string | null;
    banco: { id: number; nombre: string };
  };
  movimientoBanco: {
    id: number;
    referencia: string;
    montoBs: string;
    fechaEjecucion: string;
  } | null;
  validador: { id: number; nombreCompleto: string } | null;
}

export type RevertirPagoEstado = 'pendiente' | 'rechazado';

export interface RevertirPagoInput {
  estado: RevertirPagoEstado;
  motivoRechazo?: string;
}

export interface Coincidencia {
  movimiento: {
    id: number;
    referencia: string;
    montoBs: string;
    fechaEjecucion: string;
  };
  puntaje: number;
  referenciaExacta: boolean;
  coincidenciaSufijo: boolean;
  diferenciaMontoBs: string;
  diferenciaDias: number;
}

/**
 * CR-001 R3: explains why a payment cannot be validated automatically. It
 * points to an already-reconciled bank movement matched by the payment and to
 * the payment it is already reconciled with.
 */
export interface DuplicadoInfo {
  movimientoBancoId: number;
  referencia: string;
  montoBs: string;
  pagoReportadoId: number;
}

/**
 * Reconciliation response. `data` keeps the original coincidences array shape;
 * `duplicado` is an additive, nullable duplicate signal.
 */
export interface CoincidenciasResultado {
  data: Coincidencia[];
  duplicado: DuplicadoInfo | null;
}

export interface MovimientoBanco {
  id: number;
  referencia: string;
  montoBs: string;
  fechaEjecucion: string;
  estadoConciliacion: EstadoConciliacion;
  createdAt: string;
  cuentaRecaudadoraId: number;
  loteImportacionId: number | null;
  cuentaRecaudadora: {
    id: number;
    numeroCuenta: string;
    alias: string | null;
    banco: { id: number; nombre: string; codigo: string };
  };
  lote: { id: number; nombreArchivo: string; createdAt: string } | null;
  pago: {
    id: number;
    referencia: string;
    estado: EstadoPago;
    cobrador: { id: number; nombre: string; codigo: string };
  } | null;
}

export interface LoteImportacion {
  id: number;
  usuarioId: number;
  nombreArchivo: string;
  filasTotales: number;
  insertadas: number;
  duplicadas: number;
  conError: number;
  detalleErrores: RowError[] | null;
  createdAt: string;
  usuario: { id: number; usuario: string; nombreCompleto: string };
  _count?: { movimientos: number };
}

export interface RowError {
  fila: number;
  motivo: string;
  raw?: unknown[];
}

export interface PreviewImportacion {
  filasTotales: number;
  erroresDeteccion: number;
  filas: { fila: number; referencia: string; montoBs: string; fechaEjecucion: string }[];
  errores: RowError[];
}

export interface ImportacionResultado {
  loteId: number;
  nombreArchivo: string;
  filasTotales: number;
  insertadas: number;
  duplicadas: number;
  conError: number;
  detalleErrores: RowError[];
}

export interface Gasto {
  id: number;
  fecha: string;
  montoBs: string;
  montoUsd: string;
  tasa: string;
  movimientoBancoId: number | null;
  referencia: string | null;
  descripcion: string;
  categoria: string;
  autorizadoPor: string;
  registradoPor: number;
  soporteUrl: string | null;
  createdAt: string;
  updatedAt: string;
  registrador?: { id: number; nombreCompleto: string; usuario: string };
}

export interface TasaReferencia {
  id: number;
  fecha: string;
  valor: string;
  fuente: string | null;
}

export interface Parametro {
  id: number;
  clave: string;
  valor: string;
  descripcion: string | null;
}

export interface AuditoriaItem {
  id: number;
  usuarioId: number | null;
  entidad: string;
  entidadId: number | null;
  accion: string;
  datosAntes: unknown;
  datosDespues: unknown;
  ip: string | null;
  createdAt: string;
  usuario: { id: number; usuario: string; nombreCompleto: string } | null;
}

export interface CatalogoFormPago {
  bancos: { id: number; nombre: string; codigo: string }[];
  cuentasRecaudadoras: {
    id: number;
    numeroCuenta: string;
    alias: string | null;
    banco: { id: number; nombre: string; codigo: string };
  }[];
  tiposPago: TipoPago[];
  defaults: {
    cuentaRecaudadoraId: number | null;
    tipoPagoId: number | null;
  };
  reglas: {
    bancoOrigenObligatorio: boolean;
  };
}

// ---- Dashboard ----

export interface DashboardResumen {
  fecha: string;
  cobrosDelDia: {
    totalUsd: string;
    totalBs: string;
    cantidad: number;
    tasaPromedioPonderada: number | null;
  };
  comparativo: {
    vsDiaAnterior: { totalUsd: string; variacionPct: number | null };
    vsPromedio7Dias: { promedioUsd: string; variacionPct: number | null };
  };
  pendientes: {
    cantidad: number;
    montoUsd: string;
    antiguedadMaxHoras: number;
    antiguedadPromedioHoras: number;
  };
  rankingCobradores: { cobradorId: number; nombre: string; cantidad: number; totalUsd: string }[];
  movimientosSinConciliar: { cantidad: number; montoBs: string };
}

export interface DashboardSerie {
  data: { fecha: string; totalUsd: string; cantidad: number }[];
}

export interface DashboardNuevoViejo {
  desde: string;
  hasta: string;
  nuevo: { cantidad: number; totalUsd: string };
  viejo: { cantidad: number; totalUsd: string };
}

// ---- Reportes ----

export type TipoReporte =
  | 'cobros'
  | 'por-cobrador'
  | 'nuevo-viejo'
  | 'tasas'
  | 'pendientes'
  | 'movimientos-no-conciliados'
  | 'pagos-sin-respaldo'
  | 'flujo-caja'
  | 'gastos';

export interface ReporteCobros {
  data: PagoReportado[];
  meta: Paginated<unknown>['meta'];
  consolidado: { totalUsd: string; totalBs: string; cantidad: number };
}

export interface ReportePorCobrador {
  data: {
    cobradorId: number;
    cobrador: string;
    cantidad: number;
    montoUsd: string;
    montoBs: string;
    ticketPromedioUsd: string;
    tasaPromedioPonderada: number | null;
    pctValidado: number | null;
    pctRechazado: number | null;
  }[];
  meta: Paginated<unknown>['meta'];
}

export interface ReporteNuevoViejo {
  data: {
    fecha: string;
    nuevoUsd: string;
    viejoUsd: string;
    nuevoCantidad: number;
    viejoCantidad: number;
  }[];
  meta: Paginated<unknown>['meta'];
  resumen: {
    nuevo: { cantidad: number; montoUsd: string; montoBs: string; participacionPct: number };
    viejo: { cantidad: number; montoUsd: string; montoBs: string; participacionPct: number };
  };
}

export interface ReporteTasas {
  data: {
    fecha: string;
    cantidad: number;
    montoUsd: string;
    montoBs: string;
    tasaImplicita: number | null;
    tasaReferencia: number | null;
    desviacionPct: number | null;
    atipico: boolean;
  }[];
  meta: Paginated<unknown>['meta'];
  resumen: {
    tasaImplicitaGlobal: number | null;
    tasaReferenciaPromedio: number | null;
    diasAtipicos: number;
  };
  porCobrador: {
    cobradorId: number;
    cobrador: string;
    cantidad: number;
    montoUsd: string;
    tasaImplicita: number | null;
    desviacionPct: number | null;
    atipico: boolean;
  }[];
}

export interface ReportePendientes {
  data: {
    id: number;
    fechaPago: string;
    referencia: string;
    cobrador: string;
    banco: string;
    montoBs: string;
    montoUsd: string;
    tasa: string;
    antiguedadHoras: number;
    antiguedadDias: number;
  }[];
  meta: Paginated<unknown>['meta'];
}

export interface ReporteFlujoCaja {
  data: {
    fecha: string;
    ingresosUsd: string;
    ingresosBs: string;
    gastosUsd: string;
    gastosBs: string;
    flujoUsd: string;
    flujoBs: string;
    acumuladoUsd: string;
    acumuladoBs: string;
  }[];
  meta: Paginated<unknown>['meta'];
  totales: {
    ingresosUsd: string;
    ingresosBs: string;
    gastosUsd: string;
    gastosBs: string;
    flujoUsd: string;
    flujoBs: string;
  };
}

export interface ReporteGastos {
  data: { categoria: string; cantidad: number; totalUsd: string; totalBs: string }[];
  meta: Paginated<unknown>['meta'];
  porAutorizadoPor: { autorizadoPor: string; cantidad: number; totalUsd: string; totalBs: string }[];
}

export interface ReporteMovimientos {
  data: {
    id: number;
    referencia: string;
    montoBs: string;
    fechaEjecucion: string;
    estadoConciliacion: EstadoConciliacion;
    cuentaRecaudadora: {
      id: number;
      numeroCuenta: string;
      alias: string | null;
      banco: { id: number; nombre: string; codigo: string };
    };
    lote: { id: number; nombreArchivo: string } | null;
  }[];
  meta: Paginated<unknown>['meta'];
}

export interface Notificacion {
  id: number;
  usuarioId: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad: string | null;
  entidadId: number | null;
  leida: boolean;
  createdAt: string;
}

export type NotificacionPage = Paginated<Notificacion> & { noLeidas: number };

export interface TasaBcv {
  id: number;
  apiId: number;
  fecha: string;
  usd: string;
  fuente: string | null;
  fechaApi: string;
  createdAt: string;
}

export interface BcvJobEstado {
  habilitado: boolean;
  intervaloMinutos: number;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
