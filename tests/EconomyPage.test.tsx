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

// The food model's resources, as a wkserver sampling a running model sends
// them: each larder's stock and share, food lost to full stores, and the
// villagers by ration group, with deaths as their flows.
const MODEL = {
  food_dredgers: {
    resource: 'food_dredgers', levels: [[T, 420]], flows: [[T - 3600, 'kept', 420, 9]],
    latest: { t: T, value: 420, detail: { stock: { fish: 420 }, share: 60 } },
  },
  food_millers: {
    resource: 'food_millers', levels: [[T, 0]], flows: [],
    latest: { t: T, value: 0, detail: { stock: {}, share: 100 } },
  },
  food_lost: { resource: 'food_lost', levels: [], flows: [[T - 3600, 'fishing', -70, 2]], latest: null },
  villagers: {
    resource: 'villagers',
    levels: [[T - 86400, 407], [T, 403]],
    flows: [[T - 3600, 'died_elders', -3, 1], [T - 3600, 'died_infants', -1, 1]],
    latest: {
      t: T, value: 403,
      detail: {
        groups: {
          labourers: { people: 72, ration: 13, fed: 0.722, loss: 0.161, morale: 40, output: 0.48 },
          elders:    { people: 77, ration: 11, fed: 1, loss: 0, morale: 90, output: 1 },
        },
        work: { fishing: [30, 32] },
        shares: { dredgers: 60, millers: 100 },
      },
    },
  },
}

// Without `contributors`, the contributors answer 404, as a wkserver from
// before them does, and so do the food model's resources without `model`.
function mockEconomy(requested: string[] = [], contributors: object | null = null, model: Record<string, object> = {}) {
  server.use(
    http.get(`${API}/economy/food/contributors`, () =>
      contributors ? HttpResponse.json(contributors) : new HttpResponse(null, { status: 404 })),
    http.get(`${API}/economy/:resource`, ({ params, request }) => {
      requested.push(new URL(request.url).search)
      const resource = String(params.resource)
      if (resource in MODEL) return model[resource] ? HttpResponse.json(model[resource]) : new HttpResponse(null, { status: 404 })
      return HttpResponse.json(resource === 'food' ? FOOD : GOLD)
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
    expect(within(table).getByRole('columnheader', { name: 'DM changes' })).toBeInTheDocument()
  })

  it('shows a retired series in the legend only while the range has some of it', async () => {
    mockEconomy()
    render(<EconomyPage authToken="test-token" />)
    const food = await screen.findByRole('region', { name: 'Food Stores' })
    expect(within(food).getByText('Passive decay (200 a day, before the baselines)', { selector: 'span' })).toBeInTheDocument()
    expect(within(food).queryByText('Grey Soup (retired)')).not.toBeInTheDocument()
    expect(within(food).getByText('Rations: Labourers', { selector: 'span' })).toBeInTheDocument()
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

  it('shows the larders, food lost, and the villagers once the food model is running', async () => {
    mockEconomy([], null, MODEL)
    render(<EconomyPage authToken="test-token" />)

    const food = await screen.findByRole('region', { name: 'Food Stores' })
    expect(within(food).getByText('Lost to Full Stores')).toBeInTheDocument()

    const dredgers = screen.getByRole('region', { name: "The Dredgers' Larder" })
    expect(within(dredgers).getByText('60%')).toBeInTheDocument()
    expect(within(dredgers).getByText('420 / 4,000')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: "The Millers' Larder" })).toBeInTheDocument()

    const villagers = screen.getByRole('region', { name: 'Villagers' })
    expect(within(villagers).getByText('403')).toBeInTheDocument()
    expect(within(villagers).getByText('Over the range shown, 1 of them infants')).toBeInTheDocument()
    const groups = within(villagers).getAllByRole('table')[0]
    const labourers = within(groups).getByRole('row', { name: /^Labourers/ })
    expect(within(labourers).getByText('Underweight')).toBeInTheDocument()
    expect(within(labourers).getByText('16.1%')).toBeInTheDocument()
  })

  it('leaves the larders and villagers out until the food model is running', async () => {
    mockEconomy()
    render(<EconomyPage authToken="test-token" />)
    const food = await screen.findByRole('region', { name: 'Food Stores' })
    expect(within(food).queryByText('Lost to Full Stores')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Villagers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: "The Dredgers' Larder" })).not.toBeInTheDocument()
  })

  it('shows an error when the server refuses', async () => {
    server.use(http.get(`${API}/economy/:resource`, () => new HttpResponse(null, { status: 403 })))
    render(<EconomyPage authToken="test-token" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/403/)
  })
})
