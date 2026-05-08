import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSmartOutputName(originalName: string, action: string): string {
  const nameWithoutExt = originalName.replace(/\.pdf$/i, '');
  const timestamp = Date.now();
  return `${nameWithoutExt}-${action}-${timestamp}.pdf`;
}
