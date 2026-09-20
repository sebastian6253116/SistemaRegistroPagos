import { z } from 'zod';

export const loginSchema = z.object({
  // Accepts either the username or the email.
  usuario: z.string().min(1, 'El usuario es obligatorio').max(150),
  password: z.string().min(1, 'La contrasena es obligatoria').max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken es obligatorio'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalido'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token es obligatorio'),
  password: z
    .string()
    .min(8, 'La contrasena debe tener al menos 8 caracteres')
    .max(200),
});

export const changePasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres').max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
