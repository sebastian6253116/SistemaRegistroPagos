import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { forgotPasswordApi } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  email: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  async function onSubmit(values: FormValues) {
    setError(null);
    setMessage(null);
    setDevToken(null);
    try {
      const data = await forgotPasswordApi(values.email);
      setMessage(data.message);
      if (data.token) setDevToken(data.token);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            Indique su correo registrado y le enviaremos las instrucciones de recuperación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" className="h-11" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            {message && (
              <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
                {message}
              </div>
            )}
            {devToken && (
              <div className="rounded-md border bg-muted p-3 text-xs">
                <p className="font-medium">Token de desarrollo:</p>
                <code className="mt-1 block break-all">{devToken}</code>
                <Link
                  to={`/reset-password?token=${devToken}`}
                  className="mt-2 inline-block font-medium text-primary hover:underline"
                >
                  Restablecer contraseña ahora
                </Link>
              </div>
            )}
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="h-11 w-full" loading={isSubmitting}>
              Enviar instrucciones
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
