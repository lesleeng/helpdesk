import { formatNumber } from './scale'

export interface BarItem {
  label: string
  value: number | null
  detail?: string
}

interface Props {
  items: BarItem[]
  ariaLabel: string
  format?: (value: number) => string
}

export default function BarChart({ items, ariaLabel, format = formatNumber }: Props) {
  const max = Math.max(0, ...items.map((i) => i.value ?? 0))
  return (
    <ul className="bars" aria-label={ariaLabel}>
      {items.map((item) => {
        const text = item.value == null ? 'No data' : format(item.value)
        const pct = item.value && max ? Math.max((item.value / max) * 100, 1) : 0
        return (
          <li
            key={item.label}
            className="bar-row"
            tabIndex={0}
            title={`${item.label}: ${text}${item.detail ? ` (${item.detail})` : ''}`}
          >
            <span className="bar-label">{item.label}</span>
            <span className="bar-track">
              <span className="bar-fill series-accent" style={{ width: `${pct}%` }} />
            </span>
            <span className="bar-value">{text}</span>
          </li>
        )
      })}
    </ul>
  )
}
