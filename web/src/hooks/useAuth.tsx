import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loginApi, logoutApi, meApi } from '@/api/auth';
import { session } from '@/lib/session';
import type { AuthUser } from '@/types';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: AuthUser | null;
  status: Status;
  login: (usuario: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermiso: (permiso: string) => boolean;
  hasAlguno: (permisos: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(session.getUser());
  const [status, setStatus] = useState<Status>(session.getAccessToken() ? 'loading' : 'unauthenticated');
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    if (!session.getAccessToken()) {
      setStatus('unauthenticated');
      return;
    }
    meApi()
      .then((data) => {
        if (!active) return;
        session.setUser(data);
        setUser(data);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        session.clear();
        setUser(null);
        setStatus('unauthenticated');
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (usuario: string, password: string) => {
    const result = await loginApi(usuario, password);
    session.set(result);
    setUser(result.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = session.getRefreshToken();
    if (refreshToken) {
      try {
        await logoutApi(refreshToken);
      } catch {
        // logout best-effort
      }
    }
    session.clear();
    setUser(null);
    setStatus('unauthenticated');
    queryClient.clear();
  }, [queryClient]);

  const hasPermiso = useCallback(
    (permiso: string) => Boolean(user?.permisos?.includes(permiso)),
    [user],
  );

  const hasAlguno = useCallback(
    (permisos: string[]) => permisos.some((p) => Boolean(user?.permisos?.includes(p))),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, hasPermiso, hasAlguno }),
    [user, status, login, logout, hasPermiso, hasAlguno],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
