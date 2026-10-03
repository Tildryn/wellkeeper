import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import NotesModal from '@/NotesModal'
import { server } from './msw/server'

const API = 'http://localhost:3001'

const view = { pcid: 'pc-1', name: 'Ada', cdKey: 'PLAYERK1' }

describe('NotesModal', () => {
  it('lists the character\'s notes and the account\'s, asking for the right account', async () => {
    let asked: string | null = null
    server.use(http.get(`${API}/characters/:pcid/notes`, ({ request, params }) => {
      asked = `${params.pcid} ${new URL(request.url).searchParams.get('cd_key')}`
      return HttpResponse.json({
        character: [
          { id: 2, author: 'Other Gm', body: 'Second line\nof a note', created: '2026-10-01T12:00:00.000Z', updated: '2026-10-02T09:30:00.000Z' },
          { id: 1, author: 'Gm', body: 'First note', created: '2026-09-30T12:00:00.000Z', updated: null },
        ],
        account: [],
      })
    }))
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} />)

    expect(await screen.findByText('First note')).toBeInTheDocument()
    expect(asked).toBe('pc-1 PLAYERK1')
    expect(screen.getByText(/Second line/)).toBeInTheDocument()
    expect(screen.getByText('Other Gm')).toBeInTheDocument()
    expect(screen.getAllByText(/^edited /)).toHaveLength(1)
    expect(screen.getByText('No DM has written a note on this player\'s account.')).toBeInTheDocument()
  })

  it('says when the server has no notes table yet', async () => {
    server.use(http.get(`${API}/characters/:pcid/notes`, () => new HttpResponse(null, { status: 404 })))
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('This server has no DM notes yet.')
  })

  it('closes on Escape and on Close', async () => {
    server.use(http.get(`${API}/characters/:pcid/notes`, () => HttpResponse.json({ character: [], account: [] })))
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NotesModal view={view} authToken="t" onClose={onClose} />)
    expect(await screen.findByText('No DM has written a note on Ada.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
