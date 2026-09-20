import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { usePermiso } from '@/hooks/usePermiso';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/ui/spinner';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ReportarPage = lazy(() => import('@/features/pagos/ReportarPage'));
const MisPagosPage = lazy(() => import('@/features/pagos/MisPagosPage'));
const ValidacionPage = lazy(() => import('@/features/validacion/ValidacionPage'));
const MovimientosPage = lazy(() => import('@/features/movimientos/MovimientosPage'));
const ImportacionPage = lazy(() => import('@/features/importacion/ImportacionPage'));
const GastosPage = lazy(() => import('@/features/gastos/GastosPage'));
const ReportesPage = lazy(() => import('@/features/reportes/ReportesPage'));
const ConfiguracionPage = lazy(() => import('@/features/configuracion/ConfiguracionPage'));
const AuditoriaPage = lazy(() => import('@/features/auditoria/AuditoriaPage'));

function HomeRedirect() {
  const { tiene, status } = usePermiso();
  if (status === 'loading') return <LoadingState label="Cargando…" />;
  if (tiene('dashboard.ver')) return <Navigate to="/dashboard" replace />;
  if (tiene('pagos.reportar')) return <Navigate to="/reportar" replace />;
  if (tiene('pagos.validar')) return <Navigate to="/validacion" replace />;
  return <Navigate to="/login" replace />;
}

function Guard({
  permiso,
  alguno,
  children,
}: {
  permiso?: string;
  alguno?: string[];
  children: ReactNode;
}) {
  return (
    <ProtectedRoute permiso={permiso} alguno={alguno}>
      {children}
    </ProtectedRoute>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingState label="Cargando módulo…" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomeRedirect />} />
            <Route
              path="/dashboard"
              element={
                <Guard permiso="dashboard.ver">
                  <DashboardPage />
                </Guard>
              }
            />
            <Route
              path="/reportar"
              element={
                <Guard permiso="pagos.reportar">
                  <ReportarPage />
                </Guard>
              }
            />
            <Route
              path="/mis-pagos"
              element={
                <Guard permiso="pagos.ver_propios">
                  <MisPagosPage />
                </Guard>
              }
            />
            <Route
              path="/validacion"
              element={
                <Guard permiso="pagos.validar">
                  <ValidacionPage />
                </Guard>
              }
            />
            <Route
              path="/movimientos"
              element={
                <Guard permiso="movimientos.ver">
                  <MovimientosPage />
                </Guard>
              }
            />
            <Route
              path="/importacion"
              element={
                <Guard permiso="movimientos.importar">
                  <ImportacionPage />
                </Guard>
              }
            />
            <Route
              path="/gastos"
              element={
                <Guard permiso="gastos.ver">
                  <GastosPage />
                </Guard>
              }
            />
            <Route
              path="/reportes"
              element={
                <Guard permiso="reportes.ver">
                  <ReportesPage />
                </Guard>
              }
            />
            <Route
              path="/auditoria"
              element={
                <Guard permiso="auditoria.ver">
                  <AuditoriaPage />
                </Guard>
              }
            />
            <Route
              path="/configuracion"
              element={
                <Guard
                  alguno={[
                    'config.ver',
                    'usuarios.ver',
                    'roles.ver',
                    'cobradores.ver',
                    'bancos.ver',
                    'cuentas.ver',
                    'tipos_pago.ver',
                    'tasas.ver',
                  ]}
                >
                  <ConfiguracionPage />
                </Guard>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
