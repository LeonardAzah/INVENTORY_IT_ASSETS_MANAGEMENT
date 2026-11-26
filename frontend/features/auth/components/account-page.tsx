'use client';

import { PageHeader } from '@/components/shared/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { useCurrentUser } from '../session';
import { AccessSummary } from './access-summary';
import { ChangePasswordForm } from './change-password-form';

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-neutral-600">{term}</dt>
      <dd className="text-sm wrap-break-word">{children}</dd>
    </div>
  );
}

export function AccountPage() {
  const user = useCurrentUser();
  const employee = user.employee;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account"
        description="Your details, what you have access to, and your password."
      />

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>
            These come from your employee record. Ask an administrator to
            correct them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail term="Name">{user.name}</Detail>
            <Detail term="Email address">{user.email}</Detail>
            {employee ? (
              <>
                <Detail term="Matricule">{employee.matricule}</Detail>
                <Detail term="Region">{employee.region.name}</Detail>
                <Detail term="Office">{employee.office.name}</Detail>
                <Detail term="Department">{employee.department.name}</Detail>
              </>
            ) : (
              <Detail term="Employee record">None (system account)</Detail>
            )}
          </dl>
        </CardContent>
      </Card>

      <AccessSummary />

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            You will get an email confirming the change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
