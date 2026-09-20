import {
  BadgeDollarSign,
  Banknote,
  BarChart3,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Send,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** El usuario debe tener AL MENOS uno de estos permisos. Vacío = siempre visible. */
  permisos: string[];
  /** Coincidencia exacta vs prefijo (para rutas anidadas). */
  end?: boolean;
}

export interface NavSection {
  titulo: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    titulo: 'Operación',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permisos: ['dashboard.ver'] },
      { to: '/reportar', label: 'Reportar pago', icon: Send, permisos: ['pagos.reportar'] },
      {
        to: '/mis-pagos',
        label: 'Mis pagos',
        icon: Wallet,
        permisos: ['pagos.ver_propios'],
      },
      {
        to: '/validacion',
        label: 'Bandeja de validación',
        icon: ClipboardCheck,
        permisos: ['pagos.validar'],
      },
      {
        to: '/movimientos',
        label: 'Movimientos bancarios',
        icon: Banknote,
        permisos: ['movimientos.ver'],
      },
      {
        to: '/importacion',
        label: 'Importación bancaria',
        icon: FileSpreadsheet,
        permisos: ['movimientos.importar'],
      },
      { to: '/gastos', label: 'Gastos', icon: Receipt, permisos: ['gastos.ver'] },
    ],
  },
  {
    titulo: 'Análisis',
    items: [
      { to: '/reportes', label: 'Reportes', icon: BarChart3, permisos: ['reportes.ver'] },
      {
        to: '/auditoria',
        label: 'Auditoría',
        icon: ScrollText,
        permisos: ['auditoria.ver'],
      },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      {
        to: '/configuracion',
        label: 'Configuración',
        icon: Settings,
        permisos: [
          'config.ver',
          'usuarios.ver',
          'roles.ver',
          'cobradores.ver',
          'bancos.ver',
          'cuentas.ver',
          'tipos_pago.ver',
          'tasas.ver',
        ],
      },
    ],
  },
];

export const BRAND_ICON = BadgeDollarSign;
