import { type ReactNode } from 'react'
import './TodoScaffold.css'

type Props = {
  title: string
  label?: string
  items?: ReadonlyArray<string>
  children?: ReactNode
}

export function TodoScaffold({ title, label = 'Scaffold', items, children }: Props) {
  return (
    <section className="scaffold" aria-label={`${title} — work in progress`}>
      <span className="scaffold-tag">🚧 {label}</span>
      <h2 className="scaffold-title">{title}</h2>
      {children ? <div className="scaffold-body">{children}</div> : null}
      {items && items.length > 0 ? (
        <ul className="scaffold-list">
          {items.map((item) => (
            <li key={item} className="scaffold-item">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
