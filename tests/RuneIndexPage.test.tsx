import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import RuneIndexPage from '@/RuneIndexPage'
import { server } from './msw/server'

const API = 'http://localhost:3001'

// Two runes from the Well's ring, shown in the town, and one whole sigil
// nothing shows.
const CATALOGUE = {
  sets: [
    { id: 'arc2', label: 'Arcane Circle 02', family: 'Invented cursive', where: 'The Well', count: 2 },
    { id: 'whole', label: 'Whole sigils and circles', family: 'Whole sigils', where: '', count: 1 },
  ],
  textures: {
    plc_arcirc_02w: { hak: 'cep_placeables', size: [512, 512], notes: 'A thin ring of 92 glyphs.', variants: ['plc_arcirc_02b'], file: 'plc_arcirc_02w.webp', models: [{ model: 'plc_arcirc_02wlh', hak: 'cep_placeables', texture: 'plc_arcirc_02w' }] },
    tx_blackpent: { hak: 'q_!tilesets', size: [256, 256], notes: '', variants: [], file: 'tx_blackpent.webp', models: [] },
  },
  runes: [
    { id: 'arc2-001', set: 'arc2', texture: 'plc_arcirc_02w', place: { kind: 'arc', cx: 255.5, cy: 255.5, r0: 200, r1: 258, a0: 4.5, a1: 6.9 }, thumb: 'data:image/png;base64,' },
    { id: 'arc2-002', set: 'arc2', texture: 'plc_arcirc_02w', place: { kind: 'rect', x0: 1, y0: 2, x1: 30, y1: 40 }, thumb: 'data:image/png;base64,' },
    { id: 'pent', set: 'whole', texture: 'tx_blackpent', place: null, thumb: 'data:image/png;base64,' },
  ],
}
const NONE = { rows: [], scripts: [], blueprints: [], areas: [], items: [] }
const USAGE = {
  textures: {
    plc_arcirc_02w: {
      ...NONE,
      areas: [{ resref: 'pw_ar_spawn', name: 'Risenholm, The Well of Rebirth', dev: false, placeables: 1, tiles: 0, objects: ['Rune Circle'] }],
      blueprints: [{ resref: 'pw_pl_arcircle2b', name: 'Arcane Circle 2, Blue', row: 5085, palette: true, scripts: [] }],
    },
    tx_blackpent: NONE,
  },
  areas: { PW_AR_TOWN: { resref: 'pw_ar_town', name: 'Risenholm, Town' } },
  placed: [{ resref: 'pw_pl_arcircle2b', area: 'PW_AR_TOWN', count: 2 }],
}

const named = (rune: string, fields: Partial<{ meaning: string, notes: string, shortlist: boolean }>, version = 1, by = 'Ada') =>
  ({ rune, meaning: '', notes: '', shortlist: false, version, updated_by: by, updated_at: 1794965041801, ...fields })

let polls: { since: string | null, names: unknown[] }[]
type Save = { changes: Record<string, unknown>, base: Record<string, unknown> }
let saves: { rune: string, body: Save }[]

function serve(names: unknown[] = [], editing: Record<string, string[]> = {}) {
  polls = []
  saves = []
  server.use(
    http.get(`${API}/runes/catalogue`, () => HttpResponse.json(CATALOGUE)),
    http.get(`${API}/runes/usage`, () => HttpResponse.json(USAGE)),
    http.get(`${API}/runes/images/:file`, () => new HttpResponse(new Blob(['x']), { headers: { 'Content-Type': 'image/webp' } })),
    http.get(`${API}/runes/names`, ({ request }) => {
      const since = new URL(request.url).searchParams.get('since')
      const next = polls.length ? [] : names
      polls.push({ since, names: next })
      return HttpResponse.json({ now: 1000 + polls.length, names: next, editing })
    }),
    http.post(`${API}/runes/names/:rune/editing`, () => new HttpResponse(null, { status: 204 })),
    http.delete(`${API}/runes/names/:rune/editing`, () => new HttpResponse(null, { status: 204 })),
  )
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:texture')
})

const tile = (id: string) => screen.getByRole('button', { name: new RegExp(`^Rune ${id}`) })

describe('RuneIndexPage', () => {
  it('shows each rune with the meaning it has been given above it', async () => {
    serve([named('arc2-001', { meaning: 'Rebirth', shortlist: true })])
    render(<RuneIndexPage authToken="t" />)

    await screen.findByRole('button', { name: 'Rune arc2-001, Rebirth' })
    expect(within(tile('arc2-001')).getByText('Rebirth')).toBeInTheDocument()
    expect(screen.getByText(/with meanings/)).toHaveTextContent('1 with meanings · 1 shortlisted')
  })

  it('filters by meaning and by whether players can have seen it', async () => {
    serve([named('arc2-001', { meaning: 'Rebirth' })])
    const user = userEvent.setup()
    render(<RuneIndexPage authToken="t" />)
    await screen.findByRole('button', { name: 'Rune arc2-001, Rebirth' })

    await user.click(screen.getByRole('button', { name: 'Without' }))
    expect(screen.queryByRole('button', { name: /^Rune arc2-001/ })).not.toBeInTheDocument()
    expect(tile('arc2-002')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Any Meaning' }))
    await user.click(screen.getByRole('button', { name: 'Not Used' }))
    expect(tile('pent')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Rune arc2-002/ })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'rebirth')
    expect(screen.getByText(/No runes match/)).toBeInTheDocument()
  })

  it('opens a rune on its whole texture, with where the module shows it', async () => {
    serve()
    const user = userEvent.setup()
    render(<RuneIndexPage authToken="t" />)
    await user.click(await screen.findByRole('button', { name: 'Rune arc2-001' }))

    const panel = screen.getByRole('complementary', { name: 'Rune arc2-001' })
    expect(await within(panel).findByAltText('The whole texture plc_arcirc_02w')).toHaveAttribute('src', 'blob:texture')
    expect(within(panel).getByText(/Players can have seen this rune/)).toBeInTheDocument()
    expect(within(panel).getByText('Risenholm, The Well of Rebirth')).toBeInTheDocument()
    expect(within(panel).getByText('Risenholm, Town')).toBeInTheDocument()
    expect(within(panel).getByText(/in the DM Creator/)).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Show All 2 Runes From This Texture' }))
    expect(screen.queryByRole('button', { name: /^Rune pent/ })).not.toBeInTheDocument()
  })

  it('saves a meaning from what it started with, and shows it above the rune', async () => {
    serve()
    server.use(http.patch(`${API}/runes/names/:rune`, async ({ params, request }) => {
      const body = await request.json() as Save
      saves.push({ rune: String(params.rune), body })
      return HttpResponse.json({ name: named(String(params.rune), body.changes, 2, 'TestDM') })
    }))
    const user = userEvent.setup()
    render(<RuneIndexPage authToken="t" />)
    await user.click(await screen.findByRole('button', { name: 'Rune arc2-002' }))

    await user.type(screen.getByRole('textbox', { name: 'Meaning' }), 'Soul')
    await user.tab()
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]).toEqual({ rune: 'arc2-002', body: { changes: { meaning: 'Soul' }, base: { meaning: '' } } })
    expect(await screen.findByText(/last changed by TestDM/)).toBeInTheDocument()
    expect(within(tile('arc2-002')).getByText('Soul')).toBeInTheDocument()
  })

  it('shows both when someone else changed the meaning meanwhile, and keeps mine on request', async () => {
    serve()
    let first = true
    server.use(http.patch(`${API}/runes/names/:rune`, async ({ request }) => {
      const body = await request.json() as Save
      saves.push({ rune: 'arc2-002', body })
      if (first) {
        first = false
        return HttpResponse.json({ name: named('arc2-002', { meaning: 'Spirit' }, 2, 'Bram'), conflicts: ['meaning'] }, { status: 409 })
      }
      return HttpResponse.json({ name: named('arc2-002', body.changes, 3, 'TestDM') })
    }))
    const user = userEvent.setup()
    render(<RuneIndexPage authToken="t" />)
    await user.click(await screen.findByRole('button', { name: 'Rune arc2-002' }))

    await user.type(screen.getByRole('textbox', { name: 'Meaning' }), 'Soul')
    await user.tab()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Bram changed the meaning while you were typing')
    expect(alert).toHaveTextContent('Spirit')
    expect(screen.getByRole('textbox', { name: 'Meaning' })).toHaveValue('Soul')

    await user.click(within(alert).getByRole('button', { name: 'Keep Mine' }))
    await waitFor(() => expect(saves).toHaveLength(2))
    expect(saves[1].body).toEqual({ changes: { meaning: 'Soul' }, base: { meaning: 'Spirit' } })
    await waitFor(() => expect(within(tile('arc2-002')).getByText('Soul')).toBeInTheDocument())
  })

  it('says who else has a rune open', async () => {
    serve([], { 'arc2-001': ['Bram'] })
    const user = userEvent.setup()
    render(<RuneIndexPage authToken="t" />)
    await user.click(await screen.findByRole('button', { name: 'Rune arc2-001' }))
    expect(await screen.findByText('Bram has this rune open too.')).toBeInTheDocument()
  })

  it('says so when the server has no Rune Index', async () => {
    server.use(http.get(`${API}/runes/catalogue`, () => HttpResponse.json({ error: 'none' }, { status: 404 })),
      http.get(`${API}/runes/usage`, () => HttpResponse.json({ error: 'none' }, { status: 404 })),
      http.get(`${API}/runes/names`, () => HttpResponse.json({ error: 'none' }, { status: 404 })))
    render(<RuneIndexPage authToken="t" />)
    expect(await screen.findByText('This server has no Rune Index yet.')).toBeInTheDocument()
  })
})
