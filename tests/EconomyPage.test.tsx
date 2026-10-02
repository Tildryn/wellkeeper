import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import EconomyPage from '@/EconomyPage'
import { server } from './msw/server'

const API = 'http://localhost:3001'
const T = 1790467200 // Sep 27 2026, 00:00 UTC

const FOOD = {
  resource: 'food',
  levels: [[T - 86400, 4700], [T - 3600, 4400], [T, 4303]],
  flows: [
    [T - 86400, 'handin', 120, 10],
    [T - 86400, 'meal', -300, 100],
    [T - 3600, 'dm', 5, 1],
    [T, 'decay', -6, 1],
  ],
  latest: { t: T, value: 4303, detail: null },
}

const GOLD = {
  resource: 'gold',
  levels: [[T, 4800000]],
  flows: [],
  latest: { t: T, value: 4800000, detail: { characters: 2400, median: 900, top10pct_share: 0.61 } },
}

// Foodstock hand-ins as wkserver sends them: [unix seconds, character,
// amount, kinds], oldest first.
const CONTRIBUTORS = {
  contributions: [
    [T - 7200, 0, 12, { fish: 10, berries: 2 }],
    [T - 3600, 1, 30, { meat: 30 }],
    [T - 60, 0, 3, { mushrooms: 3 }],
  ],
  characters: [{ pcid: 'pc-a', name: 'Ada Fenwick' }, { pcid: 'pc-b', name: 'Bram Stoker' }],
  total: 3,
  first: T - 7200,
  now: T,
}

// Without `contributors`, the contributors answer 404, as a wkserver from
// before them does.
function mockEconomy(requested: string[] = [], contributors: object | null = null) {
  server.use(
    http.get(`${API}/economy/food/contributors`, () =>
      contributors ? HttpResponse.json(contributors) : new HttpResponse(null, { status: 404 })),
    http.get(`${API}/economy/:resource`, ({ params, request }) => {
      requested.push(new URL(request.url).search)
      return HttpResponse.json(params.resource === 'food' ? FOOD : GOLD)
    })
  )
}

describe('EconomyPage', () => {
  it('shows each resource with its current level', async () => {
    mockEconomy()
    render(<EconomyPage authToken="test-token" />)
    const food = await screen.findByRole('region', { name: 'Food Stores' })
    expect(within(food).getByText('4,303')).toBeInTheDocument()
    expect(within(food).getByText('−397')).toBeInTheDocument()
    const gold = screen.getByRole('region', { name: 'Gold Held by Characters' })
    expect(within(gold).getByText('4,800,000')).toBeInTheDocument()
    expect(within(gold).getByText(/top 10% hold 61%/)).toBeInTheDocument()
  })

  it('lists every reason in the table, including ones the chart folds into Other', async () => {
    mockEconomy()
    render(<EconomyPage authToken="test-token" />)
    const food = await screen.findByRole('region', { name: 'Food Stores' })
    const table = within(food).getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Meals bought (3 each)' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'dm' })).toBeInTheDocument()
  })

  it('shows an empty state for a resource with no flows yet', async () => {
    mockEconomy()
    render(<EconomyPage authToken="test-token" />)
    const gold = await screen.findByRole('region', { name: 'Gold Held by Characters' })
    expect(within(gold).getByText("No flows recorded yet.")).toBeInTheDocument()
    expect(within(gold).getAllByText("No flows recorded yet")).toHaveLength(2)
  })

  it('refetches with the chosen range', async () => {
    const requested: string[] = []
    mockEconomy(requested)
    render(<EconomyPage authToken="test-token" />)
    await screen.findByRole('region', { name: 'Food Stores' })
    await userEvent.click(screen.getByRole('button', { name: '7 Days' }))
    await screen.findByRole('region', { name: 'Food Stores' })
    expect(requested).toContain('?days=30')
    expect(requested).toContain('?days=7')
  })

  it('ranks the Foodstock contributors by how much they handed in', async () => {
    mockEconomy([], CONTRIBUTORS)
    render(<EconomyPage authToken="test-token" />)
    const section = await screen.findByRole('region', { name: 'Foodstock Contributors' })
    // The bars, then the same ranking again in the table under them.
    expect(within(section).getAllByText(/^\d+\. /).map((e) => e.textContent))
      .toEqual(['1. Bram Stoker', '2. Ada Fenwick', '1. Bram Stoker', '2. Ada Fenwick'])
    // Bram's 30 of the 45 handed in, as the top contributor and in the table.
    expect(within(section).getByText('45')).toBeInTheDocument()
    expect(within(section).getAllByText('67%')).toHaveLength(2)
  })

  it('leaves the contributors out for a wkserver without them', async () => {
    mockEconomy()
    render(<EconomyPage authToken="test-token" />)
    await screen.findByRole('region', { name: 'Food Stores' })
    expect(screen.queryByRole('region', { name: 'Foodstock Contributors' })).not.toBeInTheDocument()
  })

  it('shows an error when the server refuses', async () => {
    server.use(http.get(`${API}/economy/:resource`, () => new HttpResponse(null, { status: 403 })))
    render(<EconomyPage authToken="test-token" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/403/)
  })
})
