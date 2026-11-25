'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSubmitLock } from '@/lib/forms/submit-lock';

type FormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** The fields. */
  children: React.ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  submittingLabel?: string;
  isSubmitting: boolean;
  error?: string | null;
};

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  submittingLabel = 'Saving…',
  isSubmitting,
  error,
}: FormDialogProps) {
  const once = useSubmitLock(isSubmitting);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={once(onSubmit)}
          className="flex flex-col gap-4"
        >
          {error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {children}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              {isSubmitting ? submittingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
