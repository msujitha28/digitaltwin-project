import type { Bit, ScenarioEvent, ViewDef } from './types'
import { Bench } from './sim'

interface Pending {
  t: number
  net: string
  v: Bit
}

/** Runs one or more benches in lock-step with shared inputs, a clock generator and scripted scenarios. */
export class Session {
  benches: Bench[]
  time = 0
  pending: Pending[] = []
  clockOn = false
  clockPeriod = 40
  private clockNext = 0
  private clockLevel: Bit = 0

  constructor(
    public view: ViewDef,
    public delay: number,
  ) {
    this.benches = view.circuits.map((c) => new Bench(c, delay))
  }

  setDelay(d: number) {
    this.delay = d
    for (const b of this.benches) b.sim.setDelay(d)
  }

  inputValue(net: string): Bit {
    for (const b of this.benches) if (b.hasInput(net)) return b.inputs[net]
    return 0
  }

  /** Drive a primary input right now. */
  setInput(net: string, v: Bit) {
    this.setInputs([[net, v]])
  }

  setInputs(changes: [string, Bit][]) {
    for (const b of this.benches) b.applyInputs(changes)
  }

  toggleInput(net: string) {
    this.setInput(net, this.inputValue(net) ? 0 : 1)
  }

  schedule(events: ScenarioEvent[], offset = this.time) {
    for (const e of events) this.pending.push({ t: offset + e.t, net: e.net, v: e.v })
    this.pending.sort((a, b) => a.t - b.t)
  }

  startClock(period: number) {
    this.clockPeriod = period
    this.clockOn = true
    this.clockLevel = this.view.clock ? this.inputValue(this.view.clock) : 0
    this.clockNext = this.time + period / 2
  }

  stopClock() {
    this.clockOn = false
  }

  setClockPeriod(p: number) {
    this.clockPeriod = p
  }

  /** True while scripted events are still waiting to be applied. */
  get scripted(): boolean {
    return this.pending.length > 0
  }

  advance(dt: number) {
    const target = this.time + dt
    for (;;) {
      const nextPending = this.pending.length ? this.pending[0].t : Infinity
      const nextClock = this.clockOn && this.view.clock ? this.clockNext : Infinity
      const t = Math.min(nextPending, nextClock)
      if (t > target) break
      this.runTo(t)
      if (nextPending <= nextClock) {
        const batch: [string, Bit][] = []
        while (this.pending.length && this.pending[0].t === nextPending) {
          const p = this.pending.shift()!
          batch.push([p.net, p.v])
        }
        this.setInputs(batch)
      } else {
        this.clockLevel = this.clockLevel ? 0 : 1
        this.setInput(this.view.clock!, this.clockLevel)
        this.clockNext += this.clockPeriod / 2
      }
    }
    this.runTo(target)
    for (const b of this.benches) b.check()
  }

  private runTo(t: number) {
    this.time = t
    for (const b of this.benches) b.sim.runUntil(t)
  }

  get settled(): boolean {
    return this.benches.every((b) => b.sim.pending === 0)
  }
}
