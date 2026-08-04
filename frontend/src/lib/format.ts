const vndFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export function formatVnd(value: number): string {
  return `${vndFormatter.format(value)} VND`;
}

export function formatHours(value: number, unit: string): string {
  return `${value.toFixed(1)} ${unit}`;
}
