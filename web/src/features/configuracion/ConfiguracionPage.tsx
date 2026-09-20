import { useMemo, useState, type ReactNode } from 'react';
import { usePermiso } from '@/hooks/usePermiso';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import UsuariosTab from './UsuariosTab';
import RolesTab from './RolesTab';
import CobradoresTab from './CobradoresTab';
import BancosTab from './BancosTab';
import CuentasTab from './CuentasTab';
import TiposPagoTab from './TiposPagoTab';
import TasasTab from './TasasTab';
import TasaBcvTab from './TasaBcvTab';
import ParametrosTab from './ParametrosTab';

interface TabDef {
  value: string;
  label: string;
  permiso: string;
  element: ReactNode;
}

export default function ConfiguracionPage() {
  const { tiene } = usePermiso();

  const tabs = useMemo<TabDef[]>(
    () =>
      [
        { value: 'usuarios', label: 'Usuarios', permiso: 'usuarios.ver', element: <UsuariosTab /> },
        { value: 'roles', label: 'Roles y permisos', permiso: 'roles.ver', element: <RolesTab /> },
        { value: 'cobradores', label: 'Cobradores', permiso: 'cobradores.ver', element: <CobradoresTab /> },
        { value: 'bancos', label: 'Bancos', permiso: 'bancos.ver', element: <BancosTab /> },
        { value: 'cuentas', label: 'Cuentas recaudadoras', permiso: 'cuentas.ver', element: <CuentasTab /> },
        { value: 'tipos-pago', label: 'Tipos de pago', permiso: 'tipos_pago.ver', element: <TiposPagoTab /> },
        { value: 'tasas', label: 'Tasas de referencia', permiso: 'tasas.ver', element: <TasasTab /> },
        { value: 'tasa-bcv', label: 'Tasa BCV', permiso: 'config.ver', element: <TasaBcvTab /> },
        { value: 'parametros', label: 'Parámetros', permiso: 'config.ver', element: <ParametrosTab /> },
      ].filter((t) => tiene(t.permiso)),
    [tiene],
  );

  const [tab, setTab] = useState<string>('');

  if (tabs.length === 0) {
    return (
      <EmptyState
        title="Sin secciones disponibles"
        description="No cuentas con permisos para administrar la configuración."
      />
    );
  }

  const activo = tab && tabs.some((t) => t.value === tab) ? tab : tabs[0].value;

  return (
    <div>
      <Tabs value={activo} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={activo}>
          {tabs.find((t) => t.value === activo)?.element}
        </TabsContent>
      </Tabs>
    </div>
  );
}
