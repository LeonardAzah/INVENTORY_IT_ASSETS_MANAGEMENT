'use client';

import { useId } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type SwitchFieldProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function SwitchField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: SwitchFieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div className="flex items-start gap-3 pointer-coarse:min-h-11">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5 pointer-coarse:mt-0 pointer-coarse:h-11! pointer-coarse:w-11! pointer-coarse:[border-radius:15px/22px] pointer-coarse:border-x-[6px] pointer-coarse:border-y-[13px] pointer-coarse:bg-clip-padding pointer-coarse:shadow-none"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        {description ? (
          <p id={descriptionId} className="text-muted-foreground text-sm">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
