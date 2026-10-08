import { useState } from 'react'
import type { ReactNode } from 'react'

export interface LegendItem {
  label: string
  tone: 'accent' | 'context'
}

interface Props {
  title: string
  note?: string
  legend?: LegendItem[]
  table: { head: string[]; rows: (string | number)[][] }
  children: ReactNode
  dim?: boolean
}

export default function ChartFrame({ title, note, legend, table, children, dim = false }: Props) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={`card${dim ? ' dim' : ''}`}>
      <h3>{title}</h3>
      {note && <p className="muted">{note}</p>}
      {legend && legend.length > 1 && !asTable && (
        <ul className="legend" aria-label="Legend">
          {legend.map((item) => (
            <li key={item.label}>
              <span className={`legend-key series-${item.tone}`} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {asTable ? (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      <button type="button" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
        {asTable ? 'Show chart' : 'Show table'}
      </button>
    </section>
  )
}
