import { z } from 'zod';

const REGION_CODE = /^[A-Za-z0-9]{2,8}$/;
const CODE = /^[A-Za-z0-9_-]{2,16}$/;

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .max(max, `Use at most ${max} characters.`);

const code = z
  .string()
  .trim()
  .regex(CODE, 'Use 2 to 16 letters, digits, hyphens or underscores.');
const required = (message: string) => z.string().min(1, message);

export const regionSchema = z.object({
  code: z.string().trim().regex(REGION_CODE, 'Use 2 to 8 letters or digits.'),
  name: text('name', 100),
  is_active: z.boolean(),
});
export type RegionValues = z.infer<typeof regionSchema>;

export const officeSchema = z.object({
  region_id: required('Choose a region.'),
  kind: required('Choose a kind.'),
  parent_id: z.string(),
  code,
  name: text('name', 150),
  town: text('town', 100),
  is_active: z.boolean(),
});
export type OfficeValues = z.infer<typeof officeSchema>;

export const departmentSchema = z.object({
  office_id: required('Choose an office.'),
  kind: required('Choose a kind.'),
  code,
  name: text('name', 150),
  is_active: z.boolean(),
});
export type DepartmentValues = z.infer<typeof departmentSchema>;

export const locationSchema = z.object({
  office_id: required('Choose an office.'),
  department_id: z.string(),
  name: text('name', 150),
  is_default: z.boolean(),
  is_active: z.boolean(),
});
export type LocationValues = z.infer<typeof locationSchema>;
