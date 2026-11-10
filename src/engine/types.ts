export type Bit = 0 | 1
/** Reference-model value: 2 means undefined (forbidden input, race-around, metastable). */
export type ModelBit = 0 | 1 | 2
export type GateType = 'NAND' | 'NOR' | 'AND' | 'OR' | 'NOT'

export interface GateDef {
  id: string
  type: GateType
  inputs: string[]
  out: string
  /** left edge and vertical centre of the symbol in schematic units */
  x: number
  y: number
}

export interface WireDef {
  net: string
  pts: [number, number][]
}

export interface DotDef {
  net: string
  x: number
  y: number
}

export interface Terminal {
  net: string
  label: string
  x: number
  y: number
}

export interface BoxDef {
  x: number
  y: number
  w: number
  h: number
  label: string
}

export interface ScenarioEvent {
  t: number
  net: string
  v: Bit
}

export interface TableRow {
  /** one cell per column in `columns`; use '↑' for a rising clock edge */
  cells: string[]
  /** matcher: receives current inputs and whether a rising edge just happened */
  match: (inp: Record<string, Bit>, risen: Record<string, boolean>) => boolean
}

export interface TableDef {
  title: string
  columns: string[]
  rows: TableRow[]
}

export interface CircuitDef {
  id: string
  name: string
  tag: string
  blurb: string
  notes: string[]
  viewBox: [number, number]
  inputs: Terminal[]
  outputs: Terminal[]
  /** net driven by the clock generator, if any */
  clock?: string
  gates: GateDef[]
  wires: WireDef[]
  dots: DotDef[]
  boxes?: BoxDef[]
  init: Record<string, Bit>
  /** reference model: next stored value from inputs, previous inputs and current stored value */
  next: (inp: Record<string, Bit>, prev: Record<string, Bit>, q: ModelBit) => ModelBit
  qNet: string
  qnNet: string
  columns: string[]
  rows: TableRow[]
  tableTitle?: string
  equation?: string
  extraTables?: TableDef[]
  scenario: ScenarioEvent[]
  scenarioLength: number
  scenarioCaption: string
}

export interface TraceDef {
  label: string
  bench: number
  net: string
  kind: 'in' | 'clk' | 'out' | 'ref'
}

export interface ViewDef {
  id: string
  name: string
  tag: string
  blurb: string
  notes: string[]
  circuits: CircuitDef[]
  traces: TraceDef[]
  clock?: string
  scenario: ScenarioEvent[]
  scenarioLength: number
  scenarioCaption: string
  columns: string[]
  rows: TableRow[]
  tableTitle?: string
  equation?: string
  extraTables?: TableDef[]
}
