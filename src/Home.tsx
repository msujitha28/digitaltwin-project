import { useEffect, useState } from 'react'
import { VIEWS } from './engine/circuits'
import { Simulator } from './App'

interface Category {
  id: string
  name: string
  blurb: string
  views: string[]
  intro?: string[]
}

const CATEGORIES: Category[] = [
  {
    id: 'latches',
    name: 'Latches',
    blurb: 'Level-sensitive storage: SR (NOR and NAND), gated SR, D and JK latches.',
    views: ['sr-nor', 'sr-nand', 'gated-sr', 'd-latch', 'jk-latch'],
  },
  {
    id: 'flip-flops',
    name: 'Flip-flops',
    blurb: 'Edge-triggered storage: SR, JK, D and T flip-flops, plus a latch vs flip-flop comparison.',
    views: ['sr-ff', 'jk-ff', 'd-ff', 't-ff', 'compare'],
    intro: [
      'Flip-flops are widely used for storing binary information in electronic systems.',
      'They are edge-triggered: a clock signal controls exactly when the state may change.',
      'Types: SR, JK, D and T flip-flops. Each simulator shows the gates, a timing diagram, the truth, characteristic and excitation tables, and the characteristic equation.',
    ],
  },
]

const useHash = () => {
  const [h, setH] = useState(() => location.hash.slice(1))
  useEffect(() => {
    const f = () => setH(location.hash.slice(1))
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return h
}

export default function Home() {
  const hash = useHash()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [hash])

  const view = VIEWS.find((v) => v.id === hash)
  if (view) {
    const cat = CATEGORIES.find((c) => c.views.includes(view.id)) ?? CATEGORIES[0]
    return <Simulator key={view.id} viewId={view.id} backHref={`#${cat.id}`} backLabel={cat.name} />
  }

  const cat = CATEGORIES.find((c) => c.id === hash)
  if (cat) {
    return (
      <div className="app">
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="#">Home</a>
          <span aria-hidden="true">/</span>
          <span>{cat.name}</span>
        </nav>
        <header className="top">
          <div>
            <h1>{cat.name}</h1>
            <p className="sub">{cat.blurb} Pick a circuit to open its simulator.</p>
          </div>
        </header>
        {cat.intro && (
          <ul className="intro panel">
            {cat.intro.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <div className="cards">
          {cat.views.map((id) => {
            const v = VIEWS.find((x) => x.id === id)!
            return (
              <a key={id} className="card" href={`#${id}`}>
                <span className="tab-name">{v.name}</span>
                <span className="tab-tag">{v.tag}</span>
                <span className="card-blurb">{v.blurb}</span>
              </a>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Sequential Circuit Twin</h1>
          <p className="sub">
            A gate-level digital twin of latches and flip-flops. Choose a topic to explore its simulators.
          </p>
        </div>
      </header>
      <div className="cards">
        {CATEGORIES.map((c) => (
          <a key={c.id} className="card big" href={`#${c.id}`}>
            <span className="tab-name">{c.name}</span>
            <span className="tab-tag">{c.views.length} simulators</span>
            <span className="card-blurb">{c.blurb}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
