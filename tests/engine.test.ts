import { VIEWS } from '../src/engine/circuits'
import { Session } from '../src/engine/session'

let failures = 0

function expect(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.log('  FAIL:', msg)
  }
}

for (const view of VIEWS) {
  const s = new Session(view, 2)
  s.schedule(view.scenario, 0)
  // advance in small frames like the UI does
  for (let t = 0; t < view.scenarioLength; t += 0.5) s.advance(0.5)

  console.log(`\n${view.name}`)
  s.benches.forEach((b, i) => {
    const counts: Record<string, number> = {}
    for (const e of b.log) counts[e.status] = (counts[e.status] || 0) + 1
    console.log(`  bench ${i} (${b.circuit.id}): passes=${b.passes} fails=${b.fails}`, counts)
    expect(b.fails === 0, `bench ${i} has ${b.fails} mismatches`)
    expect(b.passes > 0, `bench ${i} never verified a defined state`)
    for (const e of [...b.log].reverse()) {
      console.log(`    t=${e.t.toFixed(1).padStart(6)}  ${e.inputs.padEnd(26)} exp=${e.expected} Q=${e.q} Q'=${e.qn}  ${e.status}`)
    }
  })
}

// Specific behaviours
{
  const v = VIEWS.find((x) => x.id === 'jk-latch')!
  const s = new Session(v, 2)
  s.setInputs([['J', 1], ['K', 1]])
  s.advance(5)
  s.setInput('CLK', 1)
  s.advance(40)
  const q = s.benches[0].sim.history['Q']
  console.log(`\nJK race-around: Q toggled ${q.length - 1} times in 40 ns`)
  expect(q.length - 1 >= 6, 'JK latch should toggle repeatedly with J=K=1 and CLK high')
}
{
  const v = VIEWS.find((x) => x.id === 'compare')!
  const s = new Session(v, 2)
  s.schedule(v.scenario, 0)
  s.advance(140)
  const [latch, ff] = s.benches
  const lq = latch.sim.history['Q'].length - 1
  const fq = ff.sim.history['Q'].length - 1
  console.log(`\nCompare: latch Q changes=${lq}, flip-flop Q changes=${fq}`)
  expect(lq > fq, 'latch should change more often than the flip-flop on the same inputs')
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll engine checks passed')
if (failures) throw new Error(`${failures} engine check(s) failed`)
