export function niceScale(max: number, count = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] }
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= rough) ?? 10) * magnitude
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { max: top, ticks }
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1)
}

export function evenlySpaced(count: number, want: number): number[] {
  if (count <= want) return Array.from({ length: count }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < want; i++) out.push(Math.round((i * (count - 1)) / (want - 1)))
  return [...new Set(out)]
}
