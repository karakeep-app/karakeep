const storageSizeFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

export function formatStorageSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${storageSizeFormatter.format(value)} ${units[unitIndex]}`;
}

export function megabytesToBytes(megabytes: number) {
  return megabytes * 1024 * 1024;
}
