import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .pipe(z.email('Enter a valid email address.')),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const newPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      ),
    re_new_password: z.string().min(1, 'Enter the password again.'),
  })
  .refine((values) => values.new_password === values.re_new_password, {
    path: ['re_new_password'],
    message: 'The two passwords do not match.',
  });

export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    new_password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      ),
    re_new_password: z.string().min(1, 'Enter the new password again.'),
  })
  .refine((values) => values.new_password === values.re_new_password, {
    path: ['re_new_password'],
    message: 'The two passwords do not match.',
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
