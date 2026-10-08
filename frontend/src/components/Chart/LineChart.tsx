import { useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { evenlySpaced, formatNumber, niceScale } from './scale'
import { useWidth } from './useWidth'

export interface LineSeries {
  key: string
  label: string
  tone: 'accent' | 'context'
  values: (number | null)[]
}

interface Props {
  labels: string[]
  series: LineSeries[]
  ariaLabel: string
  format?: (value: number) => string
  domain?: [number, number]
  tickLabel?: (label: string) => string
}

const HEIGHT = 220
const M = { top: 8, right: 16, bottom: 24, left: 44 }

export default function LineChart({
  labels,
  series,
  ariaLabel,
  format = formatNumber,
  domain,
  tickLabel = (l) => l,
}: Props) {
  const [ref, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)

  const dataMax = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)))
  const scale = domain
    ? {
        max: domain[1],
        ticks: niceScale(domain[1] - domain[0])
          .ticks.map((t) => domain[0] + t)
          .filter((t) => t <= domain[1]),
      }
    : niceScale(dataMax)
  const min = domain ? domain[0] : 0
  const innerW = Math.max(width - M.left - M.right, 10)
  const innerH = HEIGHT - M.top - M.bottom
  const x = (i: number) =>
    M.left + (labels.length <= 1 ? innerW / 2 : (i * innerW) / (labels.length - 1))
  const y = (v: number) => M.top + innerH - ((v - min) / (scale.max - min || 1)) * innerH

  const nearest = (clientX: number, left: number) => {
    const rel = clientX - left - M.left
    return Math.min(
      labels.length - 1,
      Math.max(0, Math.round((rel / innerW) * (labels.length - 1))),
    )
  }
  const onMove = (e: PointerEvent<SVGRectElement>) =>
    setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect().left - M.left))
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(labels.length - 1, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? labels.length) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const paths = series.map((s) => {
    const parts: string[] = []
    let open = false
    s.values.forEach((v, i) => {
      if (v == null) {
        open = false
        return
      }
      parts.push(`${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      open = true
    })
    return parts.join(' ')
  })
  const lastIndex = (s: LineSeries) => {
    for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] != null) return i
    return -1
  }

  const tooltipLeft =
    active == null ? 0 : Math.min(Math.max(x(active) - 80, 0), Math.max(width - 170, 0))

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={HEIGHT}
        role="group"
        aria-label={`${ariaLabel}. Use the arrow keys to read values.`}
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => setActive((a) => a ?? labels.length - 1)}
        onBlur={() => setActive(null)}
      >
        {scale.ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
            <text
              className="chart-axis"
              x={M.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {format(t)}
            </text>
          </g>
        ))}
        {evenlySpaced(labels.length, Math.max(2, Math.floor(innerW / 90))).map((i) => (
          <text
            key={i}
            className="chart-axis"
            x={x(i)}
            y={HEIGHT - 6}
            textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
          >
            {tickLabel(labels[i])}
          </text>
        ))}
        {series.map((s, k) => (
          <path key={s.key} d={paths[k]} className={`chart-line series-${s.tone}`} />
        ))}
        {active != null && (
          <line
            className="chart-cross"
            x1={x(active)}
            x2={x(active)}
            y1={M.top}
            y2={M.top + innerH}
          />
        )}
        {series.map((s) => {
          const i = active ?? lastIndex(s)
          const v = i >= 0 ? s.values[i] : null
          return v == null ? null : (
            <circle
              key={s.key}
              className={`chart-dot series-${s.tone}`}
              cx={x(i)}
              cy={y(v)}
              r={4}
            />
          )
        })}
        <rect
          x={M.left}
          y={M.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {active != null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft }} role="status">
          <div className="muted">{tickLabel(labels[active])}</div>
          {series.map((s) => (
            <div key={s.key} className="chart-tooltip-row">
              <span className={`legend-key series-${s.tone}`} aria-hidden="true" />
              <strong>
                {s.values[active] != null ? format(s.values[active] as number) : '—'}
              </strong>{' '}
              <span className="muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
