import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import LocationModal from '@/LocationModal'
import { server } from './msw/server'

const API = 'http://localhost:3001'

const TOWN  = { id: '2',  resref: 'pw_ar_town',   name: 'Risenholm, Town', tag: 'PW_AR_TOWN',   width: 20, height: 15, instance: 0, players: 2, map: 'pw_ar_town.webp' }
const LAKE  = { id: 'a7', resref: 'pw_ar_lake',   name: 'West Lake',       tag: 'PW_AR_LAKE',   width: 10, height: 10, instance: 0, players: 0, map: 'pw_ar_lake.webp' }
const SCAR3 = { id: 'f1', resref: 'pw_ar_scar',   name: 'Scar: Mine',      tag: 'PW_AR_SCAR_3', width: 8,  height: 8,  instance: 3, players: 1, map: null }

const HERE = { online: true, name: 'Ada', dead: false, driving: null, area: TOWN, x: 100, y: 75, z: 0, facing: 90,
  others: [{ name: 'Brom', dm: false, x: 50, y: 30 }] }

// What each test's server has been asked, in order.
let mapsAsked: { file: string, auth: string | null }[]
let teleports: unknown[]

function mockGame({ location = HERE as unknown, teleport = { ok: true, walkable: true } as unknown, teleportStatus = 200 } = {}) {
  server.use(
    http.get(`${API}/characters/:pcid/location`, () => HttpResponse.json(location as object)),
    http.get(`${API}/areas`, () => HttpResponse.json({ areas: [TOWN, LAKE, SCAR3] })),
    http.get(`${API}/maps/:file`, ({ params, request }) => {
      mapsAsked.push({ file: params.file as string, auth: request.headers.get('authorization') })
      return new HttpResponse(new Blob(['img']), { headers: { 'Content-Type': 'image/webp' } })
    }),
    http.post(`${API}/characters/:pcid/teleport`, async ({ request }) => {
      teleports.push(await request.json())
      return HttpResponse.json(teleport as object, { status: teleportStatus })
    }),
  )
}

const open = (onClose = vi.fn()) =>
  render(<LocationModal view={{ pcid: 'pc-1', name: 'Ada' }} authToken="t" onClose={onClose} />)

const map = () => screen.getByRole('application')

beforeEach(() => {
  mapsAsked = []
  teleports = []
  // jsdom has neither: an object URL per map, and a map 200 by 150 on screen,
  // so that the town's 200m by 150m come out at a metre a pixel.
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:map-${++n}`)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { left: 0, top: 0, width: 200, height: 150, right: 200, bottom: 150, x: 0, y: 0, toJSON: () => ({}) })
})

afterEach(() => { vi.restoreAllMocks() })

describe('LocationModal', () => {
  it('shows where the character is, on the map of their area', async () => {
    mockGame()
    open()

    expect(await screen.findByText(/Risenholm, Town · 100\.0, 75\.0/)).toBeInTheDocument()

    // Half way across and half way up.
    const pin = screen.getByAltText('Ada is here')
    expect(pin).toHaveStyle({ left: '50%', top: '50%' })
    // 50m east and 30m north of the south-west corner: y is from the bottom.
    expect(screen.getByTitle('Brom')).toHaveStyle({ left: '25%', top: '80%' })

    await waitFor(() => expect(mapsAsked).toEqual([{ file: 'pw_ar_town.webp', auth: 'Bearer t' }]))
  })

  it('says so when the character is offline, or between areas', async () => {
    mockGame({ location: { online: false } })
    const { unmount } = open()
    expect(await screen.findByText('Ada is not online.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Teleport Here' })).toBeDisabled()
    unmount()

    mockGame({ location: { ...HERE, area: null } })
    open()
    expect(await screen.findByText('Ada is between areas.')).toBeInTheDocument()
  })

  it('teleports the character to a point clicked on the map, once confirmed', async () => {
    mockGame()
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    expect(screen.getByRole('button', { name: 'Teleport Here' })).toBeDisabled()

    // 50px across and half way down a 200 by 150 map of 200m by 150m: y is
    // counted from the bottom, so half way down is 75m north.
    fireEvent.click(map(), { clientX: 50, clientY: 75 })
    expect(screen.getByAltText('Teleport target')).toHaveStyle({ left: '25%', top: '50%' })
    expect(screen.getByText(/Target: Risenholm, Town · 50\.0, 75\.0/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Teleport Here' }))
    expect(teleports).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Confirm teleport' }))

    expect(await screen.findByText('Sent Ada to Risenholm, Town.')).toBeInTheDocument()
    expect(teleports).toEqual([{ area: '2', resref: 'pw_ar_town', x: 50, y: 75 }])
    expect(screen.queryByAltText('Teleport target')).not.toBeInTheDocument()
  })

  it('does not teleport when the confirmation is declined', async () => {
    mockGame()
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    fireEvent.click(map(), { clientX: 40, clientY: 30 })
    await user.click(screen.getByRole('button', { name: 'Teleport Here' }))
    await user.click(screen.getByRole('button', { name: 'Cancel teleport' }))

    expect(teleports).toEqual([])
    expect(screen.getByAltText('Teleport target')).toBeInTheDocument()
  })

  it('says when the spot could not be stood on', async () => {
    mockGame({ teleport: { ok: true, walkable: false } })
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    fireEvent.click(map(), { clientX: 40, clientY: 30 })
    await user.click(screen.getByRole('button', { name: 'Teleport Here' }))
    await user.click(screen.getByRole('button', { name: 'Confirm teleport' }))

    expect(await screen.findByText(/cannot be stood on/)).toBeInTheDocument()
  })

  it("shows the game's reason when it refuses", async () => {
    mockGame({ teleport: { error: 'That area no longer exists. Reload the area list and pick again.' }, teleportStatus: 409 })
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    fireEvent.click(map(), { clientX: 40, clientY: 30 })
    await user.click(screen.getByRole('button', { name: 'Teleport Here' }))
    await user.click(screen.getByRole('button', { name: 'Confirm teleport' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That area no longer exists.')
    // The pin stays, so the DM can try again.
    expect(screen.getByAltText('Teleport target')).toBeInTheDocument()
  })

  it('moves the target with the arrow keys, starting from the character', async () => {
    mockGame()
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    map().focus()
    await user.keyboard('{ArrowRight}{Shift>}{ArrowUp}{/Shift}')

    expect(screen.getByText(/Target: Risenholm, Town · 101\.0, 85\.0/)).toBeInTheDocument()
  })

  it('finds another area by a fuzzy search and teleports into it', async () => {
    mockGame()
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    await user.type(screen.getByRole('combobox', { name: 'Show Another Area' }), 'wstlk')
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('West Lake')

    await user.keyboard('{Enter}')

    expect(await screen.findByText(/Showing West Lake\. Ada is not here\./)).toBeInTheDocument()
    expect(screen.queryByAltText('Ada is here')).not.toBeInTheDocument()
    await waitFor(() => expect(mapsAsked.map((m) => m.file)).toContain('pw_ar_lake.webp'))

    // The lake is 100m square on the same 200 by 150 box.
    fireEvent.click(map(), { clientX: 100, clientY: 75 })
    await user.click(screen.getByRole('button', { name: 'Teleport Here' }))
    await user.click(screen.getByRole('button', { name: 'Confirm teleport' }))

    await waitFor(() => expect(teleports).toEqual([{ area: 'a7', resref: 'pw_ar_lake', x: 50, y: 50 }]))
  })

  it('lists instances apart, with who is in them, and falls back to a grid with no map', async () => {
    mockGame()
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    await user.type(screen.getByRole('combobox', { name: 'Show Another Area' }), 'scar')
    const option = await screen.findByRole('option')
    expect(option).toHaveTextContent('Scar: Mine #3')
    expect(option).toHaveTextContent('1 player')

    await user.click(option)

    expect(await screen.findByText(/no map of this area/)).toBeInTheDocument()
    expect(map()).toHaveAccessibleName(/Map of Scar: Mine #3/)
  })

  it('goes back to following the character', async () => {
    mockGame()
    const user = userEvent.setup()
    open()
    await screen.findByAltText('Ada is here')

    await user.type(screen.getByRole('combobox', { name: 'Show Another Area' }), 'west')
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Back to Ada' }))

    expect(screen.getByAltText('Ada is here')).toBeInTheDocument()
  })

  it('will not move a character who is possessing a creature', async () => {
    mockGame({ location: { ...HERE, driving: 'Shadow Intruder' } })
    open()

    expect(await screen.findByText('Possessing Shadow Intruder')).toBeInTheDocument()
    fireEvent.click(map(), { clientX: 40, clientY: 30 })
    expect(screen.getByRole('button', { name: 'Teleport Here' })).toBeDisabled()
  })

  it('reports a failed lookup', async () => {
    server.use(http.get(`${API}/characters/:pcid/location`, () =>
      HttpResponse.json({ error: 'The game server is not answering.' }, { status: 503 })))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('The game server is not answering.')
  })

  it('closes on Escape and on Close, but Escape in the open picker only closes the list', async () => {
    mockGame()
    const onClose = vi.fn()
    const user = userEvent.setup()
    open(onClose)
    await screen.findByAltText('Ada is here')

    await user.click(screen.getByRole('combobox', { name: 'Show Another Area' }))
    expect(await screen.findAllByRole('option')).toHaveLength(3)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
