import { Boxes } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type PublicShellProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function PublicShell({
  title,
  description,
  children,
  footer,
}: PublicShellProps) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-8 sm:py-12">
      <div className="flex items-center justify-center gap-2 font-semibold">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md">
          <Boxes className="size-5" aria-hidden />
        </span>
        Inventory &amp; IT Assets
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{title}</h1>
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer ? (
        <div className="text-center text-sm text-neutral-600">{footer}</div>
      ) : null}
    </main>
  );
}

/** Link styling for text links on the public pages, with a touch-sized hit area. */
export const TEXT_LINK =
  'inline-flex items-center rounded-sm font-medium text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';
