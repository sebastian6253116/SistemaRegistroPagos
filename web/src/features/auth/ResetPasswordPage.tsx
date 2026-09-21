import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { resetPasswordApi } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

const schema = z
  .object({
    token: z.string().min(1, 'El token es obligatorio'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmar: z.string().min(1, 'Confirme la contraseña'),
  })
  .refine((v) => v.password === v.confirmar, {
    path: ['confirmar'],
    message: 'Las contraseñas no coinciden',
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token: params.get('token') ?? '', password: '', confirmar: '' },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await resetPasswordApi(values.token, values.password);
      toast.success('Contraseña restablecida', 'Ya puede iniciar sesión con su nueva contraseña.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Restablecer contraseña</CardTitle>
          <CardDescription>Defina una nueva contraseña para su cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="token">Token de recuperación</Label>
              <Input id="token" className="h-11" {...register('token')} />
              {errors.token && <p className="text-xs text-destructive">{errors.token.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Nueva contraseña</Label>
              <PasswordInput id="password" className="h-11" {...register('password')} />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar">Confirmar contraseña</Label>
              <PasswordInput id="confirmar" className="h-11" {...register('confirmar')} />
              {errors.confirmar && (
                <p className="text-xs text-destructive">{errors.confirmar.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="h-11 w-full" loading={isSubmitting}>
              Restablecer contraseña
            </Button>
          </form>

          <Link
            to="/login"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio de sesión
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
