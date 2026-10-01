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

const INVADED = {
  scar: 'pw_ar_scarforge', party_size: 2, threat: 10, intruder_level: 9, intruder_hp: 240, intruders: 1,
  downs: 0, defender_deaths: 0, defenders_killed: 0, killing_blows: 0, respawns: 0,
  dealt: 0, taken: 0, xp: 0, seeds: 0, seed_value: 0,
}

// Five Intruders. One wiped a lone defender and was left on half health; one
// was killed by a pair, having killed one of them twice; one fled a pair it
// landed beside a second Intruder to fight; one outlasted a party of three
// who left the Scar; and one never ended, more than two hours ago.
const INVASIONS = {
  invasions: [
    { ...INVADED, landed: NOW - 10000, ended: null, outcome: null, hp_left: null, defenders: 1, defender_levels: [7], scar: null, party_size: null },
    { ...INVADED, landed: NOW - 5000, ended: NOW - 4800, outcome: 'defeated', hp_left: 120, defenders: 1, defender_levels: [8],
      downs: 1, defender_deaths: 1, defenders_killed: 1, killing_blows: 1, respawns: 1, dealt: 400, taken: 120, xp: 900, seeds: 2, seed_value: 3 },
    { ...INVADED, landed: NOW - 4000, ended: NOW - 3700, outcome: 'killed', hp_left: 1, defenders: 2, defender_levels: [8, 9],
      downs: 2, defender_deaths: 2, defenders_killed: 1, killing_blows: 2, dealt: 600, taken: 239, xp: 900 },
    { ...INVADED, scar: 'pw_ar_scardog', landed: NOW - 3000, ended: NOW - 2990, outcome: 'forfeited', hp_left: 200, defenders: 2,
      defender_levels: [4, 4], intruders: 2 },
    { ...INVADED, scar: null, party_size: null, landed: NOW - 2000, ended: NOW - 1400, outcome: 'abandoned', hp_left: 240, defenders: 3,
      defender_levels: [5, 6, 7] },
  ],
  scars: { pw_ar_scarforge: 'The Forge', pw_ar_scardog: 'Dog Scar' },
  runs: { total: 10, open: 6, invaded: 3 },
  first: NOW - 10000,
  now: NOW,
  lifespan: 7200,
}

function mockMetrics(requested: string[] = [], body: object = METRICS, letters: object = LETTERS, invasions: object = INVASIONS) {
  server.use(
    http.get(`${API}/metrics/scars`, ({ request }) => {
      requested.push(new URL(request.url).search)
      return HttpResponse.json(body)
    }),
    http.get(`${API}/metrics/letters`, () => HttpResponse.json(letters)),
    http.get(`${API}/metrics/invasions`, () => HttpResponse.json(invasions))
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
// The bars of the card headed `title`, for a section with more than one card.
const cardBars = (title: string) => within(screen.getByRole('heading', { name: title }).closest('.economy__card') as HTMLElement)
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

  it('says how Intruders fare against the parties they find', async () => {
    mockMetrics()
    await renderPage()
    await screen.findByRole('region', { name: 'Intrusions' })
    expect(within(stat('Intrusions')).getByText('5')).toBeInTheDocument()
    expect(within(stat('Intrusions')).getByText('Into 50% of the 6 runs open to Intruders')).toBeInTheDocument()
    // The wipe and the party driven out are wins; the kill and the flight are
    // losses; the one cut short is neither.
    expect(within(stat('Intruder Win Rate')).getByText('50%')).toBeInTheDocument()
    expect(within(stat('Intruder Win Rate')).getByText('2 won, 2 lost, 1 undecided')).toBeInTheDocument()
    // Two defenders killed, one of them twice, over five intrusions.
    expect(within(stat('Defenders Killed')).getByText('0.40')).toBeInTheDocument()
    expect(within(stat('Defenders Killed')).getByText(/0\.60 counting the same one dying again/)).toBeInTheDocument()
    expect(within(stat('Intruders Killed')).getByText('20%')).toBeInTheDocument()
    expect(within(stat('Intruders Killed')).getByText('Median 4m from landing to the end')).toBeInTheDocument()
    expect(within(stat('Defenders Respawned')).getByText('0.20')).toBeInTheDocument()
    expect(within(stat('Health Left on a Win')).getByText('75%')).toBeInTheDocument()
    expect(within(stat("Intruder's Reward")).getByText('360 XP')).toBeInTheDocument()

    expect(cardBars('How Intrusions End'))
      .toEqual(['Wiped the Party 1', 'Drove the Party Out 1', 'Killed 1', 'Fled 1', 'Cut Short 1'])
  })

  it('breaks the Intruder win rate down by party size, Intruders, or Scar', async () => {
    mockMetrics()
    await renderPage()
    const region = within(await screen.findByRole('region', { name: 'Intrusions' }))
    expect(cardBars('Intruder Win Rate by Party Size')).toEqual(['1 defender 100%', '2 defenders 0%', '3 defenders 100%'])

    await userEvent.click(region.getByRole('button', { name: 'Intruders' }))
    expect(cardBars('Intruder Win Rate by Intruders')).toEqual(['Alone 67%', '2 at once 0%'])

    await userEvent.click(region.getByRole('button', { name: 'Scar' }))
    expect(cardBars('Intruder Win Rate by Scar')).toEqual(['Unknown Scar 100%', 'The Forge 50%', 'Dog Scar 0%'])
  })

  it('says when no Intruder has landed', async () => {
    mockMetrics([], METRICS, LETTERS, { ...INVASIONS, invasions: [], scars: {}, runs: { total: 0, open: 0, invaded: 0 }, first: null })
    await renderPage()
    const region = within(await screen.findByRole('region', { name: 'Intrusions' }))
    expect(region.getByText(/None has been recorded yet\./)).toBeInTheDocument()
    expect(region.getByText('No Intruder has landed in this range.')).toBeInTheDocument()
  })

  it('still shows the Scars when the intrusions cannot be loaded', async () => {
    mockMetrics()
    server.use(http.get(`${API}/metrics/invasions`, () => HttpResponse.json({}, { status: 500 })))
    await renderPage()
    expect(within(stat('Runs Started')).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Intrusions' })).getByRole('alert'))
      .toHaveTextContent('Error: Server error (500).')
  })

  it('says nothing about bounces when there were none', async () => {
    mockMetrics([], { ...METRICS, bounces: { runs: 0, players: 0 } })
    await renderPage()
    expect(screen.queryByText(/walked straight back out/)).not.toBeInTheDocument()
  })
})
