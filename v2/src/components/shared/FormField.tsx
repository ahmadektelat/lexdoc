// CREATED: 2026-03-17
// UPDATED: 2026-03-17 14:30 IST (Jerusalem)

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function FormField({ label, error, required, hint, children, htmlFor }: FormFieldProps) {

  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ms-1">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
