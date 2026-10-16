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
          labourers: { people: 72, ration: 13, baseline: 18, fed: 0.722, loss: 0.161, morale: 40, output: 0.48 },
          elders:    { people: 77, ration: 11, baseline: 11, fed: 1, loss: 0, morale: 90, output: 1 },
        },
        work: { fishing: [30, 32, 'labourers'], blight: [10, 10, 'tradespeople'] },
        shares: { dredgers: 60, millers: 100 },
      },
    },
  },
}

// What came with version 2 of the food model, as a wkserver sampling one
// sends it: the Grey Soup pots, the Millers' fragments and their brewing,
// the Millers' quiet withdrawals from the granary, and the villagers in
// eleven groups, the Dredgers' and the Millers' own workers among them.
const now = () => Math.floor(Date.now() / 1000)
const group = (people: number, feeder: string, ration: number, baseline: number, extra = {}) => ({
  people, feeder, ration, baseline, fed: 1, soup: 0, loss: 0, morale: 100, moraleFood: 100, moraleTarget: 100, output: 1, ...extra,
})
const SOUP = {
  grey_soup: {
    resource: 'grey_soup', levels: [[T, 412]],
    flows: [[T - 3600, 'from_millers', 300, 5], [T - 3600, 'sold', -40, 8], [T - 3600, 'rations', -20, 1]],
    latest: { t: T, value: 412, detail: null },
  },
  grey_soup_millers: {
    resource: 'grey_soup_millers', levels: [[T, 96]], flows: [[T - 3600, 'brewed', 96, 2], [T - 3600, 'to_town', -10, 1]],
    latest: { t: T, value: 96, detail: { made: 2250 } },
  },
  fragments_millers: {
    resource: 'fragments_millers', levels: [[T, 5100]], flows: [[T - 3600, 'handin', 60, 2], [T - 3600, 'brewed', -500, 9]],
    // Set brewing 60, ten minutes ago: ten bowls should be done.
    latest: { t: T, value: 5100, detail: { brewing: 60, brewSince: now() - 600 } },
  },
  granary_taken: { resource: 'granary_taken', levels: [], flows: [[T - 3600, 'millers', 250, 2]], latest: null },
}
const MODEL_V2 = {
  ...MODEL,
  ...SOUP,
  food_millers: {
    resource: 'food_millers', levels: [[T, 100]], flows: [[T - 3600, 'granary', 250, 2], [T - 3600, 'ration_labourers', -15, 1]],
    latest: { t: T, value: 100, detail: { stock: { potatoes: 100 }, share: 0, fragments: 1000, soup: 50 } },
  },
  villagers: {
    resource: 'villagers', levels: [[T, 407]],
    flows: [[T - 3600, 'died_millers_labourers', -2, 1]],
    latest: {
      t: T, value: 407,
      detail: {
        groups: {
          labourers: group(0, 'council', 18, 18),
          elders: group(80, 'council', 8, 11, { soup: 0.273, morale: 90, moraleFood: 72.7, moraleTarget: 68.7 }),
          dredgers_labourers: group(32, 'dredgers', 18, 18),
          millers_labourers: group(30, 'millers', 12, 18, { fed: 0.8, soup: 0.133, morale: 61.3, moraleFood: 66.7, moraleTarget: 62.6, output: 0.87 }),
          millers_tradespeople: group(23, 'millers', 14, 14),
        },
        work: { fishing: [32, 32, 'dredgers_labourers'], blight: [10, 10, 'millers_labourers'] },
        shares: { dredgers: 70, millers: 0 },
      },
    },
  },
}

// The Treasury's resources, as a wkserver sampling an open Treasury sends
// them, with the payroll and the journal.
const TREASURY = {
  treasury: {
    resource: 'treasury', levels: [[T - 3600, 100000], [T, 99411]],
    flows: [[T - 3600, 'hearth_tax', 78, 1], [T - 3600, 'npc_wages', -238, 1], [T - 3600, 'alloc_reeves', -97, 1], [T - 3600, 'adjust', 50, 1]],
    latest: { t: T, value: 99411, detail: null },
  },
  treasury_purse: {
    resource: 'treasury_purse', levels: [[T, 41000]], flows: [[T - 3600, 'dredgers_alloc', 166, 1], [T - 3600, 'dredgers_members', -40, 1]],
    latest: { t: T, value: 41000, detail: { purses: { dredgers: -1000, millers: 18000, reeves: 24000 }, morale: { dredgers: 82, millers: 100 } } },
  },
  treasury_merchants: {
    resource: 'treasury_merchants', levels: [[T, 151234]], flows: [[T - 3600, 'trades', 9000, 40], [T - 3600, 'wages', -195, 1]],
    latest: { t: T, value: 151234, detail: null },
  },
  treasury_villagers: {
    resource: 'treasury_villagers', levels: [[T, 704]], flows: [[T - 3600, 'wages', 782, 4], [T - 3600, 'hearth', -78, 1]],
    latest: { t: T, value: 704, detail: null },
  },
  treasury_tax: {
    resource: 'treasury_tax', levels: [[T, 52]], flows: [[T - 3600, 'ephedra', 40, 2], [T - 3600, 'kelosnack', 12, 3]],
    latest: { t: T, value: 52, detail: { boxes: { ephedra: 40, kelosnack: 12 } } },
  },
  treasury_fines: { resource: 'treasury_fines', levels: [[T, 0]], flows: [], latest: { t: T, value: 0, detail: null } },
  gold_paid: {
    resource: 'gold_paid', levels: [], latest: null,
    flows: [[T - 3600, 'store_scrap', 900, 12], [T - 3600, 'fragments', 300, 3], [T - 3600, 'wages_dredgers', 40, 1]],
  },
}

const PAYROLL = {
  members: [
    { pcid: 'pc-a', name: 'Ada Fenwick', faction: 'council', badge: 'PW_IT_BDGEMPLOY', active: true, wage: 25, owed: 0, joined: T - 86400, seen: T },
    { pcid: 'pc-c', name: 'Cole', faction: 'dredgers', badge: 'PW_IT_BDGDREDGE', active: false, wage: 40, owed: 79, joined: T - 86400, seen: T - 3600 },
    { pcid: 'pc-b', name: 'Bram Stoker', faction: 'reeves', badge: 'PW_IT_BDGREEVSGT', active: true, wage: 120, owed: 240, joined: T - 86400, seen: T },
  ],
  now: T,
}

const JOURNAL = {
  entries: [
    [T - 60, 'Bram Stoker', 'member_paid', 'purse_reeves', 240, 'collected 240 in wages'],
    [T - 3600, 'Ada Fenwick', 'withdraw', 'ephedra', 40, 'took 40 from the Tax Box at Ephedra'],
  ],
  now: T,
}

// Without `contributors`, the contributors answer 404, as a wkserver from
// before them does, and so do the food model's resources without `model`
// and the Treasury's without `treasury`.
function mockEconomy(requested: string[] = [], contributors: object | null = null, model: Record<string, object> = {}, treasury = false) {
  server.use(
    http.get(`${API}/economy/food/contributors`, () =>
      contributors ? HttpResponse.json(contributors) : new HttpResponse(null, { status: 404 })),
    http.get(`${API}/economy/treasury/members`, () =>
      treasury ? HttpResponse.json(PAYROLL) : new HttpResponse(null, { status: 404 })),
    http.get(`${API}/economy/treasury/journal`, () =>
      treasury ? HttpResponse.json(JOURNAL) : new HttpResponse(null, { status: 404 })),
    http.get(`${API}/economy/:resource`, ({ params, request }) => {
      requested.push(new URL(request.url).search)
      const resource = String(params.resource)
      if (resource in MODEL || resource in SOUP) return model[resource] ? HttpResponse.json(model[resource]) : new HttpResponse(null, { status: 404 })
      if (resource in TREASURY) return treasury ? HttpResponse.json(TREASURY[resource as keyof typeof TREASURY]) : new HttpResponse(null, { status: 404 })
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
    await userEvent.click(screen.getByRole('tab', { name: 'Treasuries' }))
    const gold = screen.getByRole('region', { name: 'Gold Held by Characters' })
    expect(within(gold).getByText('4,800,000')).toBeInTheDocument()
    expect(within(gold).getByText(/top 10% hold 61%/)).toBeInTheDocument()
  })

  it('shows food on the Granaries tab and gold on the Treasuries tab', async () => {
    mockEconomy([], null, {}, true)
    render(<EconomyPage authToken="test-token" />)
    await screen.findByRole('region', { name: 'Food Stores' })
    expect(screen.getByRole('tab', { name: 'Granaries' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('region', { name: "The Council's Treasury" })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Gold Held by Characters' })).not.toBeInTheDocument()

    // The arrow keys move between the tabs, as the ARIA practices have it.
    screen.getByRole('tab', { name: 'Granaries' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Treasuries' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Treasuries' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: "The Council's Treasury" })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Gold Held by Characters' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Food Stores' })).not.toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('tab', { name: 'Treasuries' }))
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
    // 420 fish at 0.15 litres each, in a larder of 8 m³.
    expect(within(dredgers).getByText('63 L / 8 m³')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: "The Millers' Larder" })).toBeInTheDocument()

    const villagers = screen.getByRole('region', { name: 'Villagers' })
    expect(within(villagers).getByText('403')).toBeInTheDocument()
    expect(within(villagers).getByText('Over the range shown, 1 of them infants')).toBeInTheDocument()
    const groups = within(villagers).getAllByRole('table')[0]
    const labourers = within(groups).getByRole('row', { name: /^Labourers/ })
    expect(within(labourers).getByText('Underweight')).toBeInTheDocument()
    expect(within(labourers).getByText('16.1%')).toBeInTheDocument()
    expect(within(labourers).getByText('18')).toBeInTheDocument()
    // Each workplace's group is the game's, sent with the sample.
    const workplaces = within(villagers).getAllByRole('table')[1]
    expect(within(within(workplaces).getByRole('row', { name: /^Blight Control/ })).getByText('Tradespeople')).toBeInTheDocument()
    expect(within(within(workplaces).getByRole('row', { name: /^Farmland/ })).getByText('–')).toBeInTheDocument()
  })

  it('shows the Grey Soup, the fragments, the granary, and the factions\' workers from version 2 of the model', async () => {
    mockEconomy([], null, MODEL_V2)
    server.use(http.get(`${API}/economy/food`, () => HttpResponse.json({
      ...FOOD, latest: { t: T, value: 400, detail: { stock: { fish: 400 }, soup: 100 } },
    })))
    render(<EconomyPage authToken="test-token" />)

    // 400 fish at 0.15 litres and 100 bowls at 0.4; and the withdrawals the
    // stores' own history leaves out.
    const food = await screen.findByRole('region', { name: 'Food Stores' })
    expect(within(food).getByText('100 L / 60 m³')).toBeInTheDocument()
    expect(within(food).getByText('Taken by the Millers', { selector: '.economy__stat-label' })).toBeInTheDocument()
    expect(within(food).getByText('250 Foodstock taken over the range shown, in 2 withdrawals.')).toBeInTheDocument()

    // 100 potatoes, 1,000 fragments, and 50 bowls: 42 + 50 + 20 litres. The
    // Millers' 30 Labourers at 12 and 23 Tradespeople at 14.
    const millers = screen.getByRole('region', { name: "The Millers' Larder" })
    expect(within(millers).getByText('112 L / 12 m³')).toBeInTheDocument()
    expect(within(millers).getByText("Workers' Rations").parentElement!)
      .toHaveTextContent("682A day, for the Millers' 53 workers; 862 at the baselines")
    expect(within(within(millers).getByRole('table')).getByRole('columnheader', { name: 'Taken from the town\'s granary' })).toBeInTheDocument()

    const town = screen.getByRole('region', { name: "The Town's Grey Soup" })
    expect(within(town).getByText('412')).toBeInTheDocument()
    expect(within(town).getByText('165 L')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: "The Millers' Grey Soup" })).getByText('2,250')).toBeInTheDocument()
    const fragments = screen.getByRole('region', { name: "The Millers' Scar Fragments" })
    expect(within(fragments).getByText('Brewing').parentElement!).toHaveTextContent('50Fragments still to brew, about 50 minutes')

    // The groups by who feeds them, with the soup and both morale targets.
    const villagers = screen.getByRole('region', { name: 'Villagers' })
    const groups = within(villagers).getAllByRole('table')[0]
    expect(within(groups).getByRole('row', { name: /^The Millers, from their larder · 53 people, 682 a day at these rations, 862 at the baselines/ })).toBeInTheDocument()
    const millersLabourers = within(groups).getByRole('row', { name: /^Millers' Labourers/ })
    expect(within(millersLabourers).getByText('13%')).toBeInTheDocument()
    expect(within(millersLabourers).getByText('63')).toBeInTheDocument()
    expect(within(millersLabourers).getByText('67')).toBeInTheDocument()
    expect(within(villagers).getByText("Farm Hands' Output").parentElement!).toHaveTextContent('87%')
    expect(within(villagers).getByRole('columnheader', { name: "Millers' Labourers" })).toBeInTheDocument()
  })

  it('counts stock saved as wheat with the potatoes', async () => {
    mockEconomy()
    server.use(http.get(`${API}/economy/food`, () => HttpResponse.json({
      ...FOOD, latest: { t: T, value: 1100, detail: { stock: { wheat: 1000, potatoes: 100 } } },
    })))
    render(<EconomyPage authToken="test-token" />)
    const food = await screen.findByRole('region', { name: 'Food Stores' })
    const potatoes = within(food).getByText('Potatoes', { selector: '.demo-bar__label' }).parentElement!
    expect(within(potatoes).getByText('1,100')).toBeInTheDocument()
    expect(within(food).getByText('462 L / 60 m³')).toBeInTheDocument()
  })

  it('shows the Treasury once the game has opened it', async () => {
    mockEconomy([], null, {}, true)
    render(<EconomyPage authToken="test-token" />)
    await userEvent.click(screen.getByRole('tab', { name: 'Treasuries' }))

    const council = await screen.findByRole('region', { name: "The Council's Treasury" })
    expect(within(council).getByText('99,411')).toBeInTheDocument()
    const table = within(council).getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Allocation: the Reeves' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'DM adjustments' })).toBeInTheDocument()

    const purses = screen.getByRole('region', { name: "The Factions' Treasuries" })
    const dredgers = within(purses).getByText('The Dredgers', { selector: '.economy__stat-label' }).parentElement!
    expect(dredgers).toHaveTextContent('−1,000')
    expect(dredgers).toHaveTextContent('Morale 82 out of 100 · in debt')
    expect(within(purses).getByText('The Reeves', { selector: '.economy__stat-label' }).parentElement!).toHaveTextContent('Morale not set yet')

    expect(screen.getByRole('region', { name: "The Villagers' Purse" })).toHaveTextContent('704')
    expect(screen.getByRole('region', { name: "The Merchants' Purse" })).toHaveTextContent('151,234')
    const tax = screen.getByRole('region', { name: 'Sales Tax' })
    expect(within(tax).getByText('Ephedra, Alchemist')).toBeInTheDocument()
    expect(within(tax).getByText('Kelo, Snacks')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'The Fines Chest' })).toBeInTheDocument()

    const payroll = screen.getByRole('region', { name: "Members' Wages" })
    expect(within(payroll).getByText('The Reeves', { selector: '.economy__stat-label' }).parentElement!)
      .toHaveTextContent('A day, to 1 member · 240 waiting with the Reeve Provisioner')
    const bram = within(payroll).getByRole('row', { name: /^Bram Stoker/ })
    expect(within(bram).getByText("Reeve Sergeant's Badge")).toBeInTheDocument()
    expect(within(payroll).getByRole('row', { name: /^Cole \(left\)/ })).toBeInTheDocument()

    const journal = screen.getByRole('region', { name: 'Treasury Journal' })
    expect(within(journal).getByText('took 40 from the Tax Box at Ephedra')).toBeInTheDocument()

    const paid = screen.getByRole('region', { name: 'Gold Paid to Characters' })
    expect(within(paid).getByText('Sold to store scrap')).toBeInTheDocument()
  })

  it('leaves the Treasury out until the game has opened it', async () => {
    mockEconomy()
    render(<EconomyPage authToken="test-token" />)
    await screen.findByRole('region', { name: 'Food Stores' })
    await userEvent.click(screen.getByRole('tab', { name: 'Treasuries' }))
    await screen.findByRole('region', { name: 'Gold Held by Characters' })
    expect(screen.queryByRole('region', { name: "The Council's Treasury" })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: "Members' Wages" })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Gold Paid to Characters' })).not.toBeInTheDocument()
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
