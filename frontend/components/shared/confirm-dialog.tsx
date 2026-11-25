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

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  isSubmitting: boolean;
  error?: string | null;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isSubmitting,
  error,
}: ConfirmDialogProps) {
  const once = useSubmitLock(isSubmitting);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (isSubmitting ? undefined : onOpenChange(next))}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertTitle>Not done</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={once(onConfirm)}>
            {isSubmitting ? (
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : null}
            {isSubmitting ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
