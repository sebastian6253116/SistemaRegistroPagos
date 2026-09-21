import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeDollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  usuario: z.string().min(1, 'El usuario es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { usuario: '', password: '' } });

  if (status === 'authenticated') {
    navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.usuario, values.password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BadgeDollarSign className="h-6 w-6" aria-hidden />
          </div>
          <CardTitle className="text-xl">Sistema de Gestión de Cobros</CardTitle>
          <CardDescription>Ingrese con su usuario o correo electrónico</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="usuario">Usuario o correo</Label>
              <Input
                id="usuario"
                autoComplete="username"
                autoFocus
                placeholder="admin"
                className="h-11"
                {...register('usuario')}
              />
              {errors.usuario && <p className="text-xs text-destructive">{errors.usuario.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  ¿Olvidó su contraseña?
                </Link>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                className="h-11"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <Button type="submit" className="h-11 w-full" loading={isSubmitting}>
              Iniciar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
