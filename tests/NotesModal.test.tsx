import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import NotesModal from '@/NotesModal'
import { server } from './msw/server'

const API = 'http://localhost:3001'

const view = { pcid: 'pc-1', name: 'Ada', cdKey: 'PLAYERK1' }

const NOTES = {
  character: [
    { id: 2, author: 'Other Gm', body: 'Second line\nof a note', created: '2026-10-01T12:00:00.000Z', updated: '2026-10-02T09:30:00.000Z', mine: false },
    { id: 1, author: 'Me', body: 'First note', created: '2026-09-30T12:00:00.000Z', updated: null, mine: true },
  ],
  account: [],
  fingerprints: { character: '2:3:1790000000', account: null },
}

// The notes route and its /seen, recording what is sent.
function mockNotes(sent: { method: string, path: string, body?: unknown }[], notes: object = NOTES) {
  const record = async (request: Request) => {
    const url = new URL(request.url)
    sent.push({ method: request.method, path: url.pathname + url.search, body: request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.json() })
  }
  server.use(
    http.get(`${API}/characters/:pcid/notes`, async ({ request }) => { await record(request); return HttpResponse.json(notes) }),
    http.post(`${API}/characters/:pcid/notes/seen`, async ({ request }) => {
      await record(request)
      return HttpResponse.json({ character: 2, account: 0, state: 'seen' })
    }),
    http.post(`${API}/characters/:pcid/notes`, async ({ request }) => { await record(request); return HttpResponse.json({ id: 3 }, { status: 201 }) }),
    http.patch(`${API}/notes/:id`, async ({ request }) => { await record(request); return new HttpResponse(null, { status: 204 }) }),
    http.delete(`${API}/notes/:id`, async ({ request }) => { await record(request); return new HttpResponse(null, { status: 204 }) }),
  )
}

describe('NotesModal', () => {
  it('lists the notes, asks for the right account, and marks them read with what it showed', async () => {
    const sent: { method: string, path: string, body?: unknown }[] = []
    mockNotes(sent)
    const onState = vi.fn()
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} onNotesState={onState} />)

    expect(await screen.findByText('First note')).toBeInTheDocument()
    expect(screen.getByText(/Second line/)).toBeInTheDocument()
    expect(screen.getByText('Other Gm')).toBeInTheDocument()
    expect(screen.getAllByText(/^edited /)).toHaveLength(1)
    expect(screen.getByText('No DM has written a note on this player\'s account yet.')).toBeInTheDocument()

    await waitFor(() => expect(onState).toHaveBeenCalledWith('pc-1', 'PLAYERK1', { character: 2, account: 0, state: 'seen' }))
    expect(sent.slice(0, 2)).toEqual([
      { method: 'GET', path: '/characters/pc-1/notes?cd_key=PLAYERK1' },
      { method: 'POST', path: '/characters/pc-1/notes/seen', body: { cd_key: 'PLAYERK1', character: '2:3:1790000000', account: null } },
    ])
  })

  it('offers Edit and Delete on this DM\'s own notes only', async () => {
    mockNotes([])
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} />)
    await screen.findByText('First note')
    expect(screen.getAllByRole('button', { name: 'Edit this note' })).toHaveLength(1)
    expect(within(screen.getByText('First note').closest('li')!).getByRole('button', { name: 'Edit this note' })).toBeInTheDocument()
  })

  it('writes a new account note, then re-reads the lists', async () => {
    const sent: { method: string, path: string, body?: unknown }[] = []
    mockNotes(sent)
    const user = userEvent.setup()
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} />)
    await screen.findByText('First note')

    const account = screen.getByRole('region', { name: 'Account notes' })
    await user.click(within(account).getByRole('button', { name: 'New Note' }))
    const save = within(account).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.type(within(account).getByRole('textbox', { name: 'New account note' }), 'Plays evenings.')
    await user.click(save)

    await waitFor(() => expect(sent.filter(s => s.method === 'GET')).toHaveLength(2))
    expect(sent).toContainEqual({ method: 'POST', path: '/characters/pc-1/notes', body: { cd_key: 'PLAYERK1', account: true, body: 'Plays evenings.' } })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('edits and deletes this DM\'s note', async () => {
    const sent: { method: string, path: string, body?: unknown }[] = []
    mockNotes(sent)
    const user = userEvent.setup()
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} />)
    await screen.findByText('First note')

    await user.click(screen.getByRole('button', { name: 'Edit this note' }))
    const box = screen.getByRole('textbox', { name: 'Edit your note' })
    expect(box).toHaveValue('First note')
    await user.type(box, ', edited')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sent).toContainEqual({ method: 'PATCH', path: '/notes/1', body: { body: 'First note, edited' } }))

    await user.click(await screen.findByRole('button', { name: 'Delete this note' }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(sent).toContainEqual({ method: 'DELETE', path: '/notes/1', body: undefined }))
  })

  it('shows why a save was refused', async () => {
    mockNotes([])
    server.use(http.patch(`${API}/notes/:id`, () => HttpResponse.json({ error: 'Only the DM who wrote a note can change it.' }, { status: 403 })))
    const user = userEvent.setup()
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} />)
    await screen.findByText('First note')
    await user.click(screen.getByRole('button', { name: 'Edit this note' }))
    await user.type(screen.getByRole('textbox'), '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the DM who wrote a note can change it.')
  })

  it('does not close on Escape over an unsaved note', async () => {
    mockNotes([])
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NotesModal view={view} authToken="t" onClose={onClose} />)
    await screen.findByText('First note')
    await user.click(within(screen.getByRole('region', { name: 'Character notes' })).getByRole('button', { name: 'New Note' }))
    await user.type(screen.getByRole('textbox'), 'Half a thought')
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Save or cancel the note you are writing first.')
    expect(screen.getByRole('textbox')).toHaveValue('Half a thought')
  })

  it('says when the server has no notes table yet', async () => {
    server.use(http.get(`${API}/characters/:pcid/notes`, () => new HttpResponse(null, { status: 404 })))
    render(<NotesModal view={view} authToken="t" onClose={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('This server has no DM notes yet.')
  })

  it('closes on Escape and on Close', async () => {
    mockNotes([], { character: [], account: [], fingerprints: { character: null, account: null } })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NotesModal view={view} authToken="t" onClose={onClose} />)
    expect(await screen.findByText('No DM has written a note on Ada yet.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
