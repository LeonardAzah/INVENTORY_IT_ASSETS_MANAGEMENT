import { z } from 'zod';

/** The same shapes the backend checks (employees/serializers.py). The backend remains the judge. */
const MATRICULE = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,31}$/;
const TELEPHONE = /^\+?[0-9][0-9 ().-]{5,30}$/;

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .max(100, 'Use at most 100 characters.');

export const employeeSchema = z.object({
  matricule: z
    .string()
    .trim()
    .regex(MATRICULE, "Use up to 32 letters, digits, '/', '-', '_' or '.'."),
  first_name: name('first name'),
  last_name: name('last name'),
  // Optional: not every employee has a work email.
  email: z
    .string()
    .trim()
    .max(254, 'Use at most 254 characters.')
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Enter a valid email address.',
    ),
  telephone: z
    .string()
    .trim()
    .regex(TELEPHONE, 'Enter a valid telephone number.'),
  department_id: z.string().min(1, 'Choose a department.'),
  work_location_id: z.string(),
});

export type EmployeeValues = z.infer<typeof employeeSchema>;
