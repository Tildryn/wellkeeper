import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import DemographicsPage from '@/DemographicsPage'
import { server } from './msw/server'

const API = 'http://localhost:3001'

// Three fresh level 3 elf Rogues on one account, and two level 6 humans on
// another: a Fighter who chose Vanquisher and a Fighter/Rogue who has not
// chosen yet. Only one of the Rogues and the Vanquisher are V2 characters,
// and they share the level 6 account.
const FRESH_ROGUES = {
  characters: 3, multiclassed: 0, races: { 1: 3 },
  classes: { 8: [3, 9] }, primary: { 8: 3 }, feats: {},
  skills: { 5: [0, 0, 0, 3], 17: [3] },
}
const LEVEL_SIX = {
  characters: 2, multiclassed: 1, races: { 6: 2 },
  classes: { 4: [2, 11], 8: [1, 1] }, primary: { 4: 2 }, feats: { 1175: 1, 1174: 1 },
  skills: { 5: [1, 1], 17: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2] },
}
const SNAPSHOT = {
  date: '2026-09-29',
  t: 1790640000,
  levels: { 3: FRESH_ROGUES, 6: LEVEL_SIX },
  account_levels: { 3: 1, 6: 1 },
  v2: {
    levels: {
      3: { ...FRESH_ROGUES, characters: 1, races: { 1: 1 }, classes: { 8: [1, 3] }, primary: { 8: 1 }, skills: { 5: [0, 0, 0, 1], 17: [1] } },
      6: {
        characters: 1, multiclassed: 0, races: { 6: 1 },
        classes: { 4: [1, 6] }, primary: { 4: 1 }, feats: { 1175: 1 },
        skills: { 5: [1], 17: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
      },
    },
    account_levels: { 6: 1 },
  },
}

// The same day as it was recorded before races and the V2 half existed.
const withoutRaces = (b: object) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'races'))
const OLD_SNAPSHOT = {
  date: SNAPSHOT.date,
  t: SNAPSHOT.t,
  levels: { 3: withoutRaces(FRESH_ROGUES), 6: withoutRaces(LEVEL_SIX) },
  account_levels: SNAPSHOT.account_levels,
}

const LABELS = {
  classes: { 4: 'Fighter', 8: 'Rogue' },
  races: { 1: 'Elf', 6: 'Human' },
  skills: { 5: 'Stealth', 17: 'Perception' },
  archetypes: [
    { cls: 4, selection: 1174, options: [[1175, 'Vanquisher'], [1179, 'Juggernaut'], [1183, 'Marshal']] },
    { cls: 8, selection: 1151, options: [[1150, 'Thrillseeker'], [1227, 'Silhouette'], [1308, 'Gadgeteer']] },
  ],
}

type LevelCounts = { characters: Record<string, number>; accounts: Record<string, number> }
type Counts = LevelCounts & { date: string; v2?: LevelCounts }

const TODAY: Counts = {
  date: '2026-09-29', characters: { 3: 3, 6: 2 }, accounts: { 3: 1, 6: 1 },
  v2: { characters: { 3: 1, 6: 1 }, accounts: { 6: 1 } },
}

function mockDemographics(requested: string[] = [], history: Counts[] = [TODAY], snapshot: object = SNAPSHOT) {
  server.use(
    http.get(`${API}/demographics`, ({ request }) => {
      requested.push(new URL(request.url).search)
      return HttpResponse.json({ history, snapshot, labels: LABELS })
    })
  )
}

// Renders the page and waits for it, counting V1 characters as well unless
// told not to.
async function renderPage({ withV1 = true } = {}) {
  render(<DemographicsPage authToken="test-token" />)
  await screen.findByRole('region', { name: 'Characters' })
  if (withV1) await userEvent.click(screen.getByRole('button', { name: 'With V1' }))
}

const stat = (label: string) => screen.getByText(label, { selector: '.economy__stat-label' }).parentElement!

describe('DemographicsPage', () => {
  it('leaves out characters under level 4 by default', async () => {
    mockDemographics()
    await renderPage()
    expect(within(stat('Characters')).getByText('2')).toBeInTheDocument()
    expect(within(stat('Characters')).getByText('Of 5 at any level')).toBeInTheDocument()
    expect(within(stat('Accounts')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Multiclassed')).getByText('50%')).toBeInTheDocument()
  })

  it('counts every level when asked', async () => {
    mockDemographics()
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'All Levels' }))
    expect(within(stat('Characters')).getByText('5')).toBeInTheDocument()
    expect(within(stat('Accounts')).getByText('2')).toBeInTheDocument()
    expect(within(stat('Median Level')).getByText('3')).toBeInTheDocument()
  })

  it('counts only V2 characters by default', async () => {
    mockDemographics()
    await renderPage({ withV1: false })
    expect(screen.getByRole('button', { name: 'V2 Only' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(stat('Characters')).getByText('1')).toBeInTheDocument()
    expect(within(stat('Characters')).getByText('Of 2 at any level')).toBeInTheDocument()
    expect(within(stat('Multiclassed')).getByText('0%')).toBeInTheDocument()
    const fighter = screen.getByRole('region', { name: 'Fighter archetypes' })
    expect(within(fighter).queryByText('Not chosen yet')).not.toBeInTheDocument()
  })

  it('counts every character in a snapshot from before V2 was told apart, and says so', async () => {
    mockDemographics([], [{ date: '2026-09-28', characters: TODAY.characters, accounts: TODAY.accounts }], OLD_SNAPSHOT)
    await renderPage({ withV1: false })
    expect(screen.getByRole('note')).toHaveTextContent(/every character is counted/)
    expect(within(stat('Characters')).getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/Races were not recorded/)).toBeInTheDocument()
  })

  it('shows races', async () => {
    mockDemographics()
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'All Levels' }))
    const values = screen.getAllByText(/^(Elf|Human)$/, { selector: '.demo-bar__label' })
      .map((l) => `${l.textContent} ${l.parentElement!.querySelector('.demo-bar__value')!.textContent}`)
    expect(values).toEqual(['Elf 3', 'Human 2'])
  })

  it('shows archetypes as shares of the characters who reached them', async () => {
    mockDemographics()
    await renderPage()
    const fighter = screen.getByRole('region', { name: 'Fighter archetypes' })
    const rows = within(fighter).getAllByText(/Vanquisher|Not chosen yet|Juggernaut/)
    expect(rows.map((r) => r.textContent)).toEqual(['Vanquisher', 'Juggernaut', 'Not chosen yet'])
    expect(within(fighter).getAllByText('50%')).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Rogue archetypes' })).getByText('None yet.')).toBeInTheDocument()
  })

  it('lists classes with main and multiclass counts in the table', async () => {
    mockDemographics()
    await renderPage()
    const section = screen.getByRole('region', { name: 'Classes and Archetypes' })
    const rogue = within(within(section).getAllByRole('table')[0]).getByRole('row', { name: /Rogue/ })
    expect(within(rogue).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Rogue', '1', '0', '1', '1'])
  })

  it('switches the skills between trained and share of ranks', async () => {
    mockDemographics()
    await renderPage()
    const skills = screen.getByRole('region', { name: 'Skills' })
    // Level 6 only: Perception trained by both, Stealth by one.
    const values = () => within(skills).getAllByText(/%$/, { selector: '.demo-bar__value' }).map((v) => v.textContent)
    expect(values()).toEqual(['100%', '50%'])
    await userEvent.click(within(skills).getByRole('button', { name: 'Share of Ranks' }))
    // 18 Perception ranks and 1 Stealth rank.
    expect(values()).toEqual(['95%', '5%'])
  })

  it('says when there is not yet enough history for a chart', async () => {
    mockDemographics()
    await renderPage({ withV1: false })
    const history = screen.getByRole('region', { name: 'Over Time' })
    expect(within(history).getByText(/first snapshot of V2 characters was taken on Sep 29, 2026/)).toBeInTheDocument()
  })

  it('fetches an earlier snapshot when one is picked', async () => {
    const requested: string[] = []
    mockDemographics(requested, [
      { date: '2026-09-28', characters: { 3: 3 }, accounts: { 3: 1 } },
      TODAY,
    ])
    await renderPage({ withV1: false })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Snapshot' }), '2026-09-28')
    await screen.findByRole('region', { name: 'Characters' })
    expect(requested).toEqual(['', '?date=2026-09-28'])
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
