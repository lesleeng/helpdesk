import type { ExtraFieldDef } from '../../types'

interface Props {
  fields: ExtraFieldDef[]
  values: Record<string, string>
  onChange: (name: string, value: string) => void
}

export default function DynamicFields({ fields, values, onChange }: Props) {
  return (
    <>
      {fields.map((f) => {
        const id = `extra-${f.name}`
        const value = values[f.name] ?? ''
        return (
          <div className="field" key={f.name}>
            <label htmlFor={id}>{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea id={id} value={value} onChange={(e) => onChange(f.name, e.target.value)} />
            ) : f.type === 'select' ? (
              <select id={id} value={value} onChange={(e) => onChange(f.name, e.target.value)}>
                <option value="">--</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={f.type}
                value={value}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
