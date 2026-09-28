import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import DemographicsPage from '@/DemographicsPage'
import { server } from './msw/server'

const API = 'http://localhost:3001'

// Three fresh level 3 Rogues on one account, and two level 6 characters on
// another: a Fighter who chose Vanquisher and a Fighter/Rogue who has not
// chosen yet.
const SNAPSHOT = {
  date: '2026-09-28',
  t: 1790553600,
  levels: {
    3: {
      characters: 3, multiclassed: 0,
      classes: { 8: [3, 9] }, primary: { 8: 3 }, feats: {},
      skills: { 5: [0, 0, 0, 3], 17: [3] },
    },
    6: {
      characters: 2, multiclassed: 1,
      classes: { 4: [2, 11], 8: [1, 1] }, primary: { 4: 2 }, feats: { 1175: 1, 1174: 1 },
      skills: { 5: [1, 1], 17: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2] },
    },
  },
  account_levels: { 3: 1, 6: 1 },
}

const LABELS = {
  classes: { 4: 'Fighter', 8: 'Rogue' },
  skills: { 5: 'Stealth', 17: 'Perception' },
  archetypes: [
    { cls: 4, selection: 1174, options: [[1175, 'Vanquisher'], [1179, 'Juggernaut'], [1183, 'Marshal']] },
    { cls: 8, selection: 1151, options: [[1150, 'Thrillseeker'], [1227, 'Silhouette'], [1308, 'Gadgeteer']] },
  ],
}

type Counts = { date: string; characters: Record<string, number>; accounts: Record<string, number> }

function mockDemographics(requested: string[] = [], history: Counts[] = [
  { date: '2026-09-28', characters: { 3: 3, 6: 2 }, accounts: { 3: 1, 6: 1 } },
]) {
  server.use(
    http.get(`${API}/demographics`, ({ request }) => {
      requested.push(new URL(request.url).search)
      return HttpResponse.json({ history, snapshot: SNAPSHOT, labels: LABELS })
    })
  )
}

const stat = (label: string) => screen.getByText(label, { selector: '.economy__stat-label' }).parentElement!

describe('DemographicsPage', () => {
  it('leaves out characters under level 4 by default', async () => {
    mockDemographics()
    render(<DemographicsPage authToken="test-token" />)
    await screen.findByRole('region', { name: 'Characters' })
    expect(within(stat('Characters')).getByText('2')).toBeInTheDocument()
    expect(within(stat('Characters')).getByText('Of 5 at any level')).toBeInTheDocument()
    expect(within(stat('Accounts')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Multiclassed')).getByText('50%')).toBeInTheDocument()
  })

  it('counts every level when asked', async () => {
    mockDemographics()
    render(<DemographicsPage authToken="test-token" />)
    await screen.findByRole('region', { name: 'Characters' })
    await userEvent.click(screen.getByRole('button', { name: 'All Levels' }))
    expect(within(stat('Characters')).getByText('5')).toBeInTheDocument()
    expect(within(stat('Accounts')).getByText('2')).toBeInTheDocument()
    expect(within(stat('Median Level')).getByText('3')).toBeInTheDocument()
  })

  it('shows archetypes as shares of the characters who reached them', async () => {
    mockDemographics()
    render(<DemographicsPage authToken="test-token" />)
    const fighter = await screen.findByRole('region', { name: 'Fighter archetypes' })
    const rows = within(fighter).getAllByText(/Vanquisher|Not chosen yet|Juggernaut/)
    expect(rows.map((r) => r.textContent)).toEqual(['Vanquisher', 'Juggernaut', 'Not chosen yet'])
    expect(within(fighter).getAllByText('50%')).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Rogue archetypes' })).getByText('None yet.')).toBeInTheDocument()
  })

  it('lists classes with main and multiclass counts in the table', async () => {
    mockDemographics()
    render(<DemographicsPage authToken="test-token" />)
    const section = await screen.findByRole('region', { name: 'Classes and Archetypes' })
    const rogue = within(within(section).getAllByRole('table')[0]).getByRole('row', { name: /Rogue/ })
    expect(within(rogue).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Rogue', '1', '0', '1', '1'])
  })

  it('switches the skills between trained and share of ranks', async () => {
    mockDemographics()
    render(<DemographicsPage authToken="test-token" />)
    const skills = await screen.findByRole('region', { name: 'Skills' })
    // Level 6 only: Perception trained by both, Stealth by one.
    const values = () => within(skills).getAllByText(/%$/, { selector: '.demo-bar__value' }).map((v) => v.textContent)
    expect(values()).toEqual(['100%', '50%'])
    await userEvent.click(within(skills).getByRole('button', { name: 'Share of Ranks' }))
    // 18 Perception ranks and 1 Stealth rank.
    expect(values()).toEqual(['95%', '5%'])
  })

  it('says when there is not yet enough history for a chart', async () => {
    mockDemographics()
    render(<DemographicsPage authToken="test-token" />)
    const history = await screen.findByRole('region', { name: 'Over Time' })
    expect(within(history).getByText(/first snapshot was taken on Sep 28, 2026/)).toBeInTheDocument()
  })

  it('fetches an earlier snapshot when one is picked', async () => {
    const requested: string[] = []
    mockDemographics(requested, [
      { date: '2026-09-27', characters: { 3: 3 }, accounts: { 3: 1 } },
      { date: '2026-09-28', characters: { 3: 3, 6: 2 }, accounts: { 3: 1, 6: 1 } },
    ])
    render(<DemographicsPage authToken="test-token" />)
    await screen.findByRole('region', { name: 'Characters' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Snapshot' }), '2026-09-27')
    await screen.findByRole('region', { name: 'Characters' })
    expect(requested).toEqual(['', '?date=2026-09-27'])
  })

  it('explains an empty page before the first snapshot', async () => {
    server.use(http.get(`${API}/demographics`, () => HttpResponse.json({ history: [], snapshot: null, labels: LABELS })))
    render(<DemographicsPage authToken="test-token" />)
    expect(await screen.findByText(/No snapshot has been taken yet/)).toBeInTheDocument()
  })

  it('shows an error when the server refuses', async () => {
    server.use(http.get(`${API}/demographics`, () => new HttpResponse(null, { status: 403 })))
    render(<DemographicsPage authToken="test-token" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error (403).')
  })
})
