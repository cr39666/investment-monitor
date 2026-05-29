export const normalizeStockCode = (rawCode: string): string => {
  const code = rawCode.trim().toLowerCase()

  if (!/^\d{6}$/.test(code)) return code

  if (code.startsWith('6') || code.startsWith('5') || code.startsWith('7') || code.startsWith('9')) {
    return `sh${code}`
  }

  if (code.startsWith('0') || code.startsWith('1') || code.startsWith('3')) {
    return `sz${code}`
  }

  if (code.startsWith('4') || code.startsWith('8')) {
    return `bj${code}`
  }

  return `sz${code}`
}
