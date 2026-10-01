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

// NOW is midnight UTC on Sep 29. Seven letters in the last 30 days, three on
// Sep 26 and four on Sep 28, and five more before that, back to Aug 20; two
// are still waiting on their recipients.
const LETTERS = {
  hours: [[NOW - 3 * 86400 + 7200, 2], [NOW - 3 * 86400 + 10800, 1], [NOW - 86400 + 3600, 4]],
  total: 12,
  first: NOW - 40 * 86400,
  waiting: 2,
  now: NOW,
}

function mockMetrics(requested: string[] = [], body: object = METRICS, letters: object = LETTERS) {
  server.use(
    http.get(`${API}/metrics/scars`, ({ request }) => {
      requested.push(new URL(request.url).search)
      return HttpResponse.json(body)
    }),
    http.get(`${API}/metrics/letters`, () => HttpResponse.json(letters))
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

  it('says how many players and runs were left out for bouncing', async () => {
    mockMetrics([], { ...METRICS, bounces: { runs: 1, players: 3 } })
    await renderPage()
    expect(screen.getByText(/3 players, and 1 run that was nothing else\./)).toBeInTheDocument()
  })

  it('counts the letters sent by Crow, day by day', async () => {
    mockMetrics()
    await renderPage()
    expect(within(stat('Letters Sent')).getByText('7')).toBeInTheDocument()
    expect(within(stat('Letters Sent')).getByText('12 since Aug 20')).toBeInTheDocument()
    expect(within(stat('Per Day')).getByText('0.23')).toBeInTheDocument()
    expect(within(stat('Per Day')).getByText('Average over 30 days')).toBeInTheDocument()
    expect(within(stat('Busiest Day')).getByText('4')).toBeInTheDocument()
    expect(within(stat('Busiest Day')).getByText('Sep 28 (UTC)')).toBeInTheDocument()
    expect(within(stat('Waiting for Delivery')).getByText('2')).toBeInTheDocument()

    // Every day of the range has a row, the days without a letter included.
    const rows = within(screen.getByRole('region', { name: 'Crow Letters' })).getAllByRole('row')
      .map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent).join(' '))
    expect(rows.slice(1, 5)).toEqual(['Sep 29 0', 'Sep 28 4', 'Sep 27 0', 'Sep 26 3'])
    expect(rows).toHaveLength(32)
  })

  it('averages over the days the count has been kept for, when that is less than the range', async () => {
    mockMetrics([], METRICS, { ...LETTERS, hours: [[NOW - 86400 - 43200, 3]], total: 3, first: NOW - 86400 - 43200 })
    await renderPage()
    expect(within(stat('Per Day')).getByText('2.0')).toBeInTheDocument()
    expect(within(stat('Per Day')).getByText('Average over 1.5 days')).toBeInTheDocument()
  })

  it('shows the letters when no Scar has been run', async () => {
    mockMetrics([], { ...METRICS, runs: [], participants: [], scars: {} })
    render(<MetricsPage authToken="test-token" />)
    expect(await screen.findByRole('region', { name: 'Crow Letters' })).toBeInTheDocument()
    expect(screen.getByText(/No Scar runs in the last 30 days/)).toBeInTheDocument()
  })

  it('says when no letter has been counted', async () => {
    mockMetrics([], METRICS, { hours: [], total: 0, first: null, waiting: 1, now: NOW })
    await renderPage()
    expect(within(stat('Letters Sent')).getByText('0')).toBeInTheDocument()
    expect(within(stat('Waiting for Delivery')).getByText('1')).toBeInTheDocument()
    expect(screen.getByText('No letters in the last 30 days.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Letters sent per day/ })).not.toBeInTheDocument()
  })

  it('still shows the Scars when the letters cannot be loaded', async () => {
    mockMetrics()
    server.use(http.get(`${API}/metrics/letters`, () => HttpResponse.json({}, { status: 500 })))
    await renderPage()
    expect(within(stat('Runs Started')).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Crow Letters' })).getByRole('alert'))
      .toHaveTextContent('Error: Server error (500).')
  })

  it('says nothing about bounces when there were none', async () => {
    mockMetrics([], { ...METRICS, bounces: { runs: 0, players: 0 } })
    await renderPage()
    expect(screen.queryByText(/walked straight back out/)).not.toBeInTheDocument()
  })
})
