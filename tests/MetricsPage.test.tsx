import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import MetricsPage from '@/MetricsPage'
import { server } from './msw/server'

const API = 'http://localhost:3001'
const NOW = 1790640000

const ZERO = {
  dealt: 0, overkill: 0, taken: 0, heal: 0, overheal: 0, thp: 0, dr_absorb: 0,
  kills_minion: 0, kills_normal: 0, kills_elite: 0, kills_solo: 0, deaths: 0, short_rests: 0,
  xp: 0, xp_quest: 0, gold: 0, ichor: 0, scrap: 0, seed_minor: 0, seed_medium: 0, seed_major: 0, looted: 0,
}

// The Forge completed in 30 minutes by a level 8 Vanquisher and a level 8
// Rogue with no archetype; a second Forge run given up on by a level 5
// Vanquisher after 10 minutes; and a Dog Scar run still going.
const METRICS = {
  runs: [
    { scar: 'pw_ar_scarforge', threat: 10, bonus_xp: 20, party_size: 2, started: NOW - 3000, completed: NOW - 1200, completion: 90, respawns: 1 },
    { scar: 'pw_ar_scarforge', threat: 8, bonus_xp: 0, party_size: 1, started: NOW - 10000, completed: null, completion: null, respawns: null },
    { scar: 'pw_ar_scardog', threat: 6, bonus_xp: 0, party_size: 3, started: NOW - 600, completed: null, completion: null, respawns: null },
  ],
  participants: [
    { ...ZERO, run: 0, success: true, level: 8, classes: [[4, 8, 1175]], active: 1800, dealt: 9000, xp: 600, xp_quest: 400, gold: 300, seed_minor: 3 },
    { ...ZERO, run: 0, success: true, level: 8, classes: [[8, 8, -1]], active: 1800, dealt: 3600, xp: 600, xp_quest: 400, gold: 300 },
    { ...ZERO, run: 1, success: false, level: 5, classes: [[4, 5, 1175]], active: 600, dealt: 1000, xp: 50 },
  ],
  scars: { pw_ar_scarforge: 'The Forge', pw_ar_scardog: 'Dog Scar' },
  now: NOW,
  lifespan: 7200,
  labels: {
    classes: { 4: 'Fighter', 8: 'Rogue' },
    archetypes: [
      { cls: 4, selection: 1174, options: [[1175, 'Vanquisher'], [1179, 'Juggernaut'], [1183, 'Marshal']] },
      { cls: 8, selection: 1151, options: [[1150, 'Thrillseeker'], [1227, 'Silhouette'], [1308, 'Gadgeteer']] },
    ],
  },
}

function mockMetrics(requested: string[] = [], body: object = METRICS) {
  server.use(
    http.get(`${API}/metrics/scars`, ({ request }) => {
      requested.push(new URL(request.url).search)
      return HttpResponse.json(body)
    })
  )
}

async function renderPage() {
  render(<MetricsPage authToken="test-token" />)
  await screen.findByRole('region', { name: 'Runs' })
}

const stat = (label: string) => screen.getByText(label, { selector: '.economy__stat-label' }).parentElement!
const bars = (region: string) => within(screen.getByRole('region', { name: region }))
  .getAllByText(/./, { selector: '.demo-bar__label' })
  .map((l) => `${l.textContent} ${l.parentElement!.querySelector('.demo-bar__value')!.textContent}`)

describe('MetricsPage', () => {
  it('asks for the last 30 days by default', async () => {
    const requested: string[] = []
    mockMetrics(requested)
    await renderPage()
    expect(requested).toEqual(['?days=30'])
  })

  it('counts runs and how they ended', async () => {
    mockMetrics()
    await renderPage()
    expect(within(stat('Runs Started')).getByText('3')).toBeInTheDocument()
    // One completed of the two that are over; the Dog Scar run is still going.
    expect(within(stat('Completed')).getByText('50%')).toBeInTheDocument()
    expect(within(stat('Median Time')).getByText('30m')).toBeInTheDocument()
    expect(bars('Runs')).toEqual(['The Forge 2', 'Dog Scar 1'])
  })

  it('gives rewards per player-minute, for finished runs by default', async () => {
    mockMetrics()
    await renderPage()
    expect(within(stat('XP per Minute')).getByText('20.0')).toBeInTheDocument()
    expect(within(stat('Gold per Minute')).getByText('10.0')).toBeInTheDocument()
    expect(within(stat('Seeds per Minute')).getByText('0.05')).toBeInTheDocument()
    expect(bars('Rewards')).toEqual(['The Forge 20.0'])

    await userEvent.click(screen.getByRole('button', { name: 'Every Attempt' }))
    // 1,250 XP over 70 player-minutes.
    expect(within(stat('XP per Minute')).getByText('17.9')).toBeInTheDocument()
  })

  it('ranks damage per minute by archetype, or by class', async () => {
    mockMetrics()
    await renderPage()
    expect(bars('Damage by Archetype')).toEqual(['Vanquisher 300', 'Rogue (no archetype) 120'])

    await userEvent.click(screen.getByRole('button', { name: 'Per Run' }))
    expect(bars('Damage by Archetype')).toEqual(['Vanquisher 9,000', 'Rogue (no archetype) 3,600'])

    await userEvent.click(screen.getByRole('button', { name: 'Class' }))
    expect(bars('Damage by Class')).toEqual(['Fighter 9,000', 'Rogue 3,600'])
  })

  it('narrows the players by level', async () => {
    mockMetrics()
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Every Attempt' }))
    // The level 5 Vanquisher's 1,000 damage over 10 minutes joins the level 8 one's.
    expect(bars('Damage by Archetype')).toEqual(['Vanquisher 250', 'Rogue (no archetype) 120'])

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Lowest level' }), '6')
    expect(bars('Damage by Archetype')).toEqual(['Vanquisher 300', 'Rogue (no archetype) 120'])
  })

  it('says when nothing has been recorded', async () => {
    mockMetrics([], { ...METRICS, runs: [], participants: [], scars: {} })
    render(<MetricsPage authToken="test-token" />)
    expect(await screen.findByText(/No Scar runs in the last 30 days/)).toBeInTheDocument()
  })
})
