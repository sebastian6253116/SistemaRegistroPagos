/**
 * Seed script.
 *
 * Creates the baseline security model (roles + granular permissions), the
 * business catalogs (banks, collection accounts, parameters), an initial
 * administrator and a set of test users for every role.
 *
 * The script is idempotent: every write is an upsert keyed on a natural field,
 * so it can be re-run safely.
 *
 * Run with:  npm run seed
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from './admin-shared';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Permission catalog
// ---------------------------------------------------------------------------
type PermisoDef = { clave: string; descripcion: string };

const PERMISOS: PermisoDef[] = [
  // Users & security
  { clave: 'usuarios.ver', descripcion: 'Ver usuarios' },
  { clave: 'usuarios.crear', descripcion: 'Crear usuarios' },
  { clave: 'usuarios.editar', descripcion: 'Editar usuarios' },
  { clave: 'usuarios.eliminar', descripcion: 'Desactivar/eliminar usuarios' },
  { clave: 'usuarios.eliminar_definitivo', descripcion: 'Eliminar definitivamente usuarios sin historial' },
  { clave: 'roles.ver', descripcion: 'Ver roles y permisos' },
  { clave: 'roles.gestionar', descripcion: 'Crear/editar roles y asignar permisos' },
  // Catalogs
  { clave: 'cobradores.ver', descripcion: 'Ver cobradores' },
  { clave: 'cobradores.gestionar', descripcion: 'Crear/editar cobradores' },
  { clave: 'cobradores.eliminar_definitivo', descripcion: 'Eliminar definitivamente cobradores sin pagos' },
  { clave: 'bancos.ver', descripcion: 'Ver bancos' },
  { clave: 'bancos.gestionar', descripcion: 'Crear/editar bancos' },
  { clave: 'tipos_pago.ver', descripcion: 'Ver tipos de pago' },
  { clave: 'tipos_pago.gestionar', descripcion: 'Crear/editar tipos de pago' },
  { clave: 'cuentas.ver', descripcion: 'Ver cuentas recaudadoras' },
  { clave: 'cuentas.gestionar', descripcion: 'Crear/editar cuentas recaudadoras' },
  { clave: 'tasas.ver', descripcion: 'Ver tasas de referencia' },
  { clave: 'tasas.gestionar', descripcion: 'Cargar/editar tasas de referencia' },
  // Payments
  { clave: 'pagos.reportar', descripcion: 'Reportar pagos (cobrador)' },
  { clave: 'pagos.ver_propios', descripcion: 'Ver unicamente los pagos propios' },
  { clave: 'pagos.ver_todos', descripcion: 'Ver los pagos de todos los cobradores' },
  { clave: 'pagos.validar', descripcion: 'Validar pagos contra movimientos bancarios' },
  { clave: 'pagos.ver_alerta_antiguedad', descripcion: 'Ver la alerta de documento viejo (pago viejo contra movimiento bancario)' },
  { clave: 'pagos.rechazar', descripcion: 'Rechazar pagos reportados' },
  { clave: 'pagos.marcar_duplicado', descripcion: 'Marcar pagos como duplicados' },
  { clave: 'pagos.validar_lote', descripcion: 'Validar en lote coincidencias exactas' },
  { clave: 'pagos.eliminar', descripcion: 'Eliminar pagos reportados no validados' },
  { clave: 'pagos.revertir_validacion', descripcion: 'Revertir la validacion de un pago' },
  { clave: 'pagos.editar', descripcion: 'Editar pagos, incluidos los ya validados' },
  // Bank movements & import
  { clave: 'movimientos.ver', descripcion: 'Ver movimientos bancarios' },
  { clave: 'movimientos.importar', descripcion: 'Importar el Excel/CSV del banco' },
  // Expenses
  { clave: 'gastos.ver', descripcion: 'Ver gastos' },
  { clave: 'gastos.crear', descripcion: 'Registrar gastos' },
  { clave: 'gastos.editar', descripcion: 'Editar gastos' },
  { clave: 'gastos.eliminar', descripcion: 'Eliminar gastos' },
  // Reporting & audit
  { clave: 'dashboard.ver', descripcion: 'Ver el dashboard' },
  { clave: 'reportes.ver', descripcion: 'Ver reportes' },
  { clave: 'reportes.exportar', descripcion: 'Exportar reportes a Excel/PDF' },
  { clave: 'auditoria.ver', descripcion: 'Ver la bitacora de auditoria' },
  // Configuration
  { clave: 'config.ver', descripcion: 'Ver la configuracion y parametros' },
  { clave: 'config.editar', descripcion: 'Editar parametros del sistema' },
];

// ---------------------------------------------------------------------------
// Roles and their permission grants
// ---------------------------------------------------------------------------
const ALL = PERMISOS.map((p) => p.clave);

const ROLES: { nombre: string; descripcion: string; permisos: string[] }[] = [
  {
    nombre: 'Administrador',
    descripcion: 'Acceso total al sistema, gestion de usuarios, configuracion y auditoria.',
    permisos: ALL,
  },
  {
    nombre: 'Administrativo',
    descripcion:
      'Importa la data bancaria, valida/rechaza pagos reportados y registra gastos. No gestiona usuarios.',
    permisos: [
      'cobradores.ver',
      'bancos.ver',
      'cuentas.ver',
      'tasas.ver',
      'pagos.ver_todos',
      'pagos.validar',
      'pagos.ver_alerta_antiguedad',
      'pagos.rechazar',
      'pagos.marcar_duplicado',
      'pagos.validar_lote',
      'pagos.revertir_validacion',
      'pagos.editar',
      'movimientos.ver',
      'movimientos.importar',
      'gastos.ver',
      'gastos.crear',
      'gastos.editar',
      'dashboard.ver',
      'reportes.ver',
      'reportes.exportar',
    ],
  },
  {
    nombre: 'Cobrador',
    descripcion: 'Reporta sus propios pagos y consulta unicamente su historial.',
    permisos: ['pagos.reportar', 'pagos.ver_propios', 'tasas.ver'],
  },
  {
    nombre: 'Consultor',
    descripcion: 'Solo lectura: dashboard y reportes. No modifica nada.',
    permisos: [
      'dashboard.ver',
      'reportes.ver',
      'reportes.exportar',
      'pagos.ver_todos',
      'movimientos.ver',
      'gastos.ver',
      'tasas.ver',
      'cobradores.ver',
      'bancos.ver',
      'cuentas.ver',
    ],
  },
];

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------
const BANCOS = [
  { codigo: '0134', nombre: 'Banesco' },
  { codigo: '0102', nombre: 'Banco de Venezuela' },
  { codigo: '0105', nombre: 'Mercantil' },
  { codigo: '0108', nombre: 'BBVA Provincial' },
  { codigo: '0191', nombre: 'BNC (Banco Nacional de Credito)' },
  { codigo: '0163', nombre: 'Banco del Tesoro' },
  { codigo: '0172', nombre: 'Bancamiga' },
  { codigo: '0104', nombre: 'Venezolano de Credito' },
  { codigo: '0114', nombre: 'Bancaribe' },
  { codigo: '0115', nombre: 'Exterior' },
  { codigo: '0151', nombre: 'BFC Banco Fondo Comun' },
  { codigo: '0137', nombre: 'Sofitasa' },
  { codigo: '9999', nombre: 'OTROS' },
];

// Banca Amiga is the collector account (see spec section 4).
const CUENTA_RECAUDADORA = {
  bancoCodigo: '0172',
  bancoNombre: 'Banca Amiga',
  numeroCuenta: '01720123456789012345',
  alias: 'Cuenta recaudadora principal - Banca Amiga',
};

// Payment-method catalog. Order is the display order in the UI.
const TIPOS_PAGO = [
  { nombre: 'Pago Móvil', descripcion: 'Pago móvil interbancario', activo: true, orden: 1 },
  { nombre: 'Transferencia', descripcion: 'Transferencia bancaria', activo: true, orden: 2 },
  { nombre: 'Zelle', descripcion: 'Transferencia via Zelle (USD)', activo: true, orden: 3 },
  { nombre: 'Efectivo', descripcion: 'Pago en efectivo', activo: true, orden: 4 },
  { nombre: 'Taquilla', descripcion: 'Pago en taquilla del banco', activo: true, orden: 5 },
];

// Payment method used by default when the collector does not pick one.
const TIPO_PAGO_DEFAULT = 'Pago Móvil';

const PARAMETROS = [
  { clave: 'match.amount_tolerance_bs', valor: '0.01', descripcion: 'Tolerancia en bolivares al cruzar montos' },
  { clave: 'match.date_window_days', valor: '3', descripcion: 'Ventana de dias (+/-) para la fecha de ejecucion' },
  { clave: 'match.reference_suffix', valor: '4', descripcion: 'Ultimos N digitos usados para referencia parcial' },
  { clave: 'cobro.umbral_antiguedad_dias', valor: '30', descripcion: 'Dias para clasificar un cobro como viejo' },
  { clave: 'login.max_attempts', valor: '5', descripcion: 'Intentos fallidos antes de bloquear el usuario' },
  { clave: 'login.lock_minutes', valor: '15', descripcion: 'Minutos de bloqueo tras superar los intentos' },
  { clave: 'pago.banco_origen_obligatorio', valor: '1', descripcion: 'Exige seleccionar el banco de origen al reportar un pago' },
];

// ---------------------------------------------------------------------------
// Users (credentials documented in README.md)
// ---------------------------------------------------------------------------
const PASSWORD_DEFAULT = 'Admin123!';

const USUARIOS = [
  {
    usuario: 'admin',
    email: 'admin@cobros.local',
    nombreCompleto: 'Administrador del Sistema',
    rol: 'Administrador',
    password: PASSWORD_DEFAULT,
  },
  {
    usuario: 'administrativo',
    email: 'administrativo@cobros.local',
    nombreCompleto: 'Ana Administrativa',
    rol: 'Administrativo',
    password: PASSWORD_DEFAULT,
  },
  {
    usuario: 'cobrador1',
    email: 'cobrador1@cobros.local',
    nombreCompleto: 'Carlos Cobrador',
    rol: 'Cobrador',
    password: 'Cobrador123!',
  },
  {
    usuario: 'cobrador2',
    email: 'cobrador2@cobros.local',
    nombreCompleto: 'Maria Cobradora',
    rol: 'Cobrador',
    password: 'Cobrador123!',
  },
  {
    usuario: 'consultor',
    email: 'consultor@cobros.local',
    nombreCompleto: 'Pedro Consultor',
    rol: 'Consultor',
    password: PASSWORD_DEFAULT,
  },
];

const COBRADORES = [
  { codigo: 'COB-001', nombre: 'Carlos Cobrador', usuario: 'cobrador1' },
  { codigo: 'COB-002', nombre: 'Maria Cobradora', usuario: 'cobrador2' },
];

async function main() {
  console.log('Seeding database...');

  // 1. Permissions ---------------------------------------------------------
  for (const p of PERMISOS) {
    await prisma.permiso.upsert({
      where: { clave: p.clave },
      update: { descripcion: p.descripcion },
      create: p,
    });
  }
  console.log(`  - ${PERMISOS.length} permisos`);

  const permisoByClave = new Map(
    (await prisma.permiso.findMany()).map((p) => [p.clave, p.id]),
  );

  // 2. Roles + grants ------------------------------------------------------
  for (const r of ROLES) {
    const rol = await prisma.rol.upsert({
      where: { nombre: r.nombre },
      update: { descripcion: r.descripcion },
      create: { nombre: r.nombre, descripcion: r.descripcion },
    });

    // Replace grants to make the seed authoritative.
    await prisma.rolPermiso.deleteMany({ where: { rolId: rol.id } });
    await prisma.rolPermiso.createMany({
      data: r.permisos
        .map((clave) => permisoByClave.get(clave))
        .filter((id): id is number => typeof id === 'number')
        .map((permisoId) => ({ rolId: rol.id, permisoId })),
      skipDuplicates: true,
    });
  }
  console.log(`  - ${ROLES.length} roles (+ permisos asignados)`);

  // 3. Banks ---------------------------------------------------------------
  for (const b of BANCOS) {
    await prisma.banco.upsert({
      where: { codigo: b.codigo },
      update: { nombre: b.nombre },
      create: b,
    });
  }
  // Ensure the collector bank exists even if not in the catalog above.
  const bancoAmiga = await prisma.banco.upsert({
    where: { codigo: CUENTA_RECAUDADORA.bancoCodigo },
    update: { nombre: CUENTA_RECAUDADORA.bancoNombre },
    create: {
      codigo: CUENTA_RECAUDADORA.bancoCodigo,
      nombre: CUENTA_RECAUDADORA.bancoNombre,
    },
  });
  console.log(`  - ${BANCOS.length + 1} bancos`);

  // 4. Collection account (Banca Amiga) -----------------------------------
  const cuentaAmiga = await prisma.cuentaRecaudadora.upsert({
    where: {
      bancoId_numeroCuenta: {
        bancoId: bancoAmiga.id,
        numeroCuenta: CUENTA_RECAUDADORA.numeroCuenta,
      },
    },
    update: { alias: CUENTA_RECAUDADORA.alias, activo: true },
    create: {
      bancoId: bancoAmiga.id,
      numeroCuenta: CUENTA_RECAUDADORA.numeroCuenta,
      alias: CUENTA_RECAUDADORA.alias,
      activo: true,
    },
  });
  console.log('  - cuenta recaudadora Banca Amiga');

  // 5. Payment-method catalog ----------------------------------------------
  for (const t of TIPOS_PAGO) {
    await prisma.tipoPago.upsert({
      where: { nombre: t.nombre },
      update: { descripcion: t.descripcion, activo: t.activo, orden: t.orden },
      create: t,
    });
  }
  const tipoPagoDefault = await prisma.tipoPago.findUnique({
    where: { nombre: TIPO_PAGO_DEFAULT },
  });
  if (!tipoPagoDefault) {
    throw new Error(`Tipo de pago por defecto no encontrado: ${TIPO_PAGO_DEFAULT}`);
  }
  console.log(`  - ${TIPOS_PAGO.length} tipos de pago`);

  // 6. Parameters ----------------------------------------------------------
  const parametros = [
    ...PARAMETROS,
    {
      clave: 'pago.cuenta_recaudadora_default',
      valor: String(cuentaAmiga.id),
      descripcion: 'Cuenta recaudadora por defecto para registrar pagos',
    },
    {
      clave: 'pago.tipo_pago_default',
      valor: String(tipoPagoDefault.id),
      descripcion: 'Tipo de pago por defecto para registrar pagos',
    },
    {
      clave: 'bcv.job_habilitado',
      valor: '1',
      descripcion: 'Habilita la sincronizacion horaria de la tasa BCV',
    },
  ];
  for (const p of parametros) {
    await prisma.parametro.upsert({
      where: { clave: p.clave },
      update: { valor: p.valor, descripcion: p.descripcion },
      create: p,
    });
  }
  console.log(`  - ${parametros.length} parametros`);

  // 7. Users ---------------------------------------------------------------
  const rolByName = new Map(
    (await prisma.rol.findMany()).map((r) => [r.nombre, r.id]),
  );

  for (const u of USUARIOS) {
    const rolId = rolByName.get(u.rol);
    if (!rolId) throw new Error(`Rol no encontrado: ${u.rol}`);
    const passwordHash = await hashPassword(u.password);
    await prisma.usuario.upsert({
      where: { usuario: u.usuario },
      update: { email: u.email, nombreCompleto: u.nombreCompleto, rolId, passwordHash, activo: true },
      create: {
        usuario: u.usuario,
        email: u.email,
        nombreCompleto: u.nombreCompleto,
        passwordHash,
        rolId,
        activo: true,
      },
    });
  }
  console.log(`  - ${USUARIOS.length} usuarios`);

  // 8. Cobradores (linked to their user accounts) --------------------------
  const usuarioByName = new Map(
    (await prisma.usuario.findMany()).map((u) => [u.usuario, u.id]),
  );

  for (const c of COBRADORES) {
    const usuarioId = usuarioByName.get(c.usuario) ?? null;
    await prisma.cobrador.upsert({
      where: { codigo: c.codigo },
      update: { nombre: c.nombre, usuarioId, activo: true },
      create: { codigo: c.codigo, nombre: c.nombre, usuarioId, activo: true },
    });
  }
  console.log(`  - ${COBRADORES.length} cobradores`);

  // 9. Reference rate (today) ---------------------------------------------
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  await prisma.tasaReferencia.upsert({
    where: { fecha: today },
    update: { valor: new Prisma.Decimal('180.000000'), fuente: 'manual' },
    create: { fecha: today, valor: new Prisma.Decimal('180.000000'), fuente: 'manual' },
  });
  console.log('  - tasa de referencia de hoy');

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
