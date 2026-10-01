import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import CharacterTextModal from '@/CharacterTextModal'
import { server } from './msw/server'

const API = 'http://localhost:3001'

const PAGE = {
  text: 'She was raised by <c\xff\x00\x00>wolves</c>.',
  bonds: [
    { type: 5, type_name: 'Oath', description: '' },
    { type: 1, type_name: 'Goal', description: 'Find her brother' },
  ],
  fingerprint: -12345,
}

function mockInnerWorld(state: string, posted: unknown[]) {
  server.use(
    http.get(`${API}/characters/:pcid/inner_world`, () => HttpResponse.json({ ...PAGE, state })),
    http.post(`${API}/characters/:pcid/inner_world/seen`, async ({ request }) => {
      posted.push(await request.json())
      return HttpResponse.json({ state: 'seen' })
    }),
  )
}

const view = (kind: 'description' | 'inner_world') => ({ kind, pcid: 'pc-1', name: 'Ada' })

describe('CharacterTextModal', () => {
  it('shows an unread Inner World and marks it read with the fingerprint it was shown', async () => {
    const posted: unknown[] = []
    mockInnerWorld('unread', posted)
    const onState = vi.fn()
    render(<CharacterTextModal view={view('inner_world')} authToken="t" onClose={vi.fn()} onInnerWorldState={onState} />)

    expect(await screen.findByText('Find her brother')).toBeInTheDocument()
    expect(screen.getByText('Unread')).toBeInTheDocument()
    expect(screen.getByText('Not answered yet.')).toBeInTheDocument()
    expect(screen.getByText('wolves')).toHaveStyle({ color: 'rgb(255, 0, 0)' })
    expect(screen.queryByText(/<c/)).not.toBeInTheDocument()

    await waitFor(() => expect(onState).toHaveBeenCalledWith('pc-1', 'seen'))
    expect(posted).toEqual([{ fingerprint: -12345 }])
  })

  it('does not mark a page already read', async () => {
    const posted: unknown[] = []
    mockInnerWorld('seen', posted)
    const onState = vi.fn()
    render(<CharacterTextModal view={view('inner_world')} authToken="t" onClose={vi.fn()} onInnerWorldState={onState} />)
    await waitFor(() => expect(onState).toHaveBeenCalledWith('pc-1', 'seen'))
    expect(posted).toEqual([])
    expect(screen.queryByText('Unread')).not.toBeInTheDocument()
  })

  it('shows a description', async () => {
    server.use(http.get(`${API}/characters/:pcid/description`, () =>
      HttpResponse.json({ description: 'A tall, robust orc.', source: 'custom', vault: true })))
    render(<CharacterTextModal view={view('description')} authToken="t" onClose={vi.fn()} onInnerWorldState={vi.fn()} />)
    expect(await screen.findByText('A tall, robust orc.')).toBeInTheDocument()
  })

  it('says when there is no description, and when the vault could not be checked', async () => {
    server.use(http.get(`${API}/characters/:pcid/description`, () =>
      HttpResponse.json({ description: null, source: null, vault: false })))
    render(<CharacterTextModal view={view('description')} authToken="t" onClose={vi.fn()} onInnerWorldState={vi.fn()} />)
    expect(await screen.findByText('Ada has not written a description.')).toBeInTheDocument()
    expect(screen.getByText(/cannot read the servervault/)).toBeInTheDocument()
  })

  it('reports a failed fetch', async () => {
    server.use(http.get(`${API}/characters/:pcid/description`, () => new HttpResponse(null, { status: 403 })))
    render(<CharacterTextModal view={view('description')} authToken="t" onClose={vi.fn()} onInnerWorldState={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error (403).')
  })

  it('closes on Escape and on Close', async () => {
    server.use(http.get(`${API}/characters/:pcid/description`, () =>
      HttpResponse.json({ description: 'x', source: 'custom', vault: true })))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CharacterTextModal view={view('description')} authToken="t" onClose={onClose} onInnerWorldState={vi.fn()} />)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
