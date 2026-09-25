import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import App from '@/App'
import { server } from './msw/server'

// Shared fixture — a single active ban
const activeBan = {
  ban_id: 1,
  ban_reason: 'Griefing',
  ban_start: '2026-01-01 12:00:00',
  ban_end: null,
  ban_temporary: false,
  creator_display_name: 'AdminDM',
  ban_creator: 'uuid-admin',
  ban_lifter: null,
  lifter_display_name: null,
}
const activeBanDetails = {
  ban_id: 1,
  cd_keys: ['BAN-KEY-1'],
  player_names: ['Troublemaker'],
  ip_addresses: ['10.0.0.2'],
}

// Logs in as a DM and waits for the navbar to appear
async function loginAsDM(user: ReturnType<typeof userEvent.setup>) {
  render(<App />)
  await user.type(screen.getByLabelText(/^email$/i), 'dm@example.com')
  await user.type(screen.getByLabelText(/^password$/i), 'password123')
  await user.click(screen.getByRole('button', { name: /sign in/i }))
  await screen.findByRole('navigation')
}

// ─── Bans page ───────────────────────────────────────────────────────────────

describe('App — bans page', () => {
  it('loads and displays active bans', async () => {
    server.use(
      http.get('http://localhost:3001/active_bans', () => HttpResponse.json([activeBan])),
      http.get('http://localhost:3001/bans/:id', () => HttpResponse.json(activeBanDetails)),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    expect(await screen.findByText('#1')).toBeInTheDocument()
    expect(screen.getByText('Troublemaker')).toBeInTheDocument()
  })

  it('shows "No active bans" when the list is empty', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    expect(await screen.findByText(/no active bans/i)).toBeInTheDocument()
  })

  it('shows the result count', async () => {
    server.use(
      http.get('http://localhost:3001/active_bans', () => HttpResponse.json([activeBan])),
      http.get('http://localhost:3001/bans/:id', () => HttpResponse.json(activeBanDetails)),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    await screen.findByText('#1')
    expect(screen.getByText(/1 of 1 active ban/)).toBeInTheDocument()
  })

  it('filters active bans via the search input', async () => {
    server.use(
      http.get('http://localhost:3001/active_bans', () => HttpResponse.json([activeBan])),
      http.get('http://localhost:3001/bans/:id', () => HttpResponse.json(activeBanDetails)),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    await screen.findByText('#1')
    await user.type(screen.getByRole('textbox', { name: /search bans/i }), 'XYZNonExistent')
    expect(screen.getByText(/0 of 1 active ban/)).toBeInTheDocument()
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
  })

  it('switches to the Old bans filter and shows "No old bans"', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    await screen.findByText(/no active bans/i)
    await user.click(screen.getByRole('button', { name: /^old$/i }))
    expect(await screen.findByText(/no old bans/i)).toBeInTheDocument()
  })

  it('calls PATCH /unban with the correct ban ID', async () => {
    server.use(
      http.get('http://localhost:3001/active_bans', () => HttpResponse.json([activeBan])),
      http.get('http://localhost:3001/bans/:id', () => HttpResponse.json(activeBanDetails)),
    )
    let unbanPayload: unknown = null
    server.use(
      http.patch('http://localhost:3001/unban', async ({ request }) => {
        unbanPayload = await request.json()
        return HttpResponse.json({})
      })
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    await screen.findByText('#1')
    await user.click(screen.getByRole('button', { name: /^unban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm unban/i }))
    await vi.waitFor(() => expect(unbanPayload).toEqual({ ban_id: 1 }))
  })

  it('calls DELETE /expunge with the correct ban ID', async () => {
    server.use(
      http.get('http://localhost:3001/active_bans', () => HttpResponse.json([activeBan])),
      http.get('http://localhost:3001/bans/:id', () => HttpResponse.json(activeBanDetails)),
    )
    let expungePayload: unknown = null
    server.use(
      http.delete('http://localhost:3001/expunge', async ({ request }) => {
        expungePayload = await request.json()
        return HttpResponse.json({})
      })
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    await screen.findByText('#1')
    await user.click(screen.getByRole('button', { name: /^expunge$/i }))
    await user.click(screen.getByRole('button', { name: /confirm expunge/i }))
    await vi.waitFor(() => expect(expungePayload).toEqual({ ban_id: 1 }))
  })
})

// ─── All Players page ─────────────────────────────────────────────────────────

describe('App — all players page', () => {
  it('loads and displays player data', async () => {
    server.use(
      http.get('http://localhost:3001/player_data', () =>
        HttpResponse.json([{
          public_cd_key: 'SEARCH-KEY-1',
          player_names: ['SeasonedAdventurer'],
          ip_addresses: ['192.168.1.50'],
          characters: [{ pcid: 'pcid-1', character_name: 'Aragorn' }],
        }])
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    expect(await screen.findByText('SeasonedAdventurer')).toBeInTheDocument()
    expect(screen.getByText('Aragorn')).toBeInTheDocument()
  })

  it('shows the result count', async () => {
    server.use(
      http.get('http://localhost:3001/player_data', () =>
        HttpResponse.json([{
          public_cd_key: 'SEARCH-KEY-1',
          player_names: ['SeasonedAdventurer'],
          ip_addresses: ['192.168.1.50'],
          characters: [],
        }])
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    await screen.findByText('SeasonedAdventurer')
    expect(screen.getByText(/1 of 1 result/)).toBeInTheDocument()
  })

  it('filters the player list via the search input', async () => {
    server.use(
      http.get('http://localhost:3001/player_data', () =>
        HttpResponse.json([{
          public_cd_key: 'SEARCH-KEY-1',
          player_names: ['SeasonedAdventurer'],
          ip_addresses: ['192.168.1.50'],
          characters: [],
        }])
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    await screen.findByText('SeasonedAdventurer')
    await user.type(screen.getByRole('textbox', { name: /search players/i }), 'XYZNonExistent')
    expect(screen.getByText(/0 of 1 result/)).toBeInTheDocument()
    expect(screen.queryByText('SeasonedAdventurer')).not.toBeInTheDocument()
  })

  it('searching by CD key shows the matching player', async () => {
    server.use(
      http.get('http://localhost:3001/player_data', () =>
        HttpResponse.json([{
          public_cd_key: 'SEARCH-KEY-1',
          player_names: ['SeasonedAdventurer'],
          ip_addresses: ['192.168.1.50'],
          characters: [],
        }])
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    await screen.findByText('SeasonedAdventurer')
    await user.type(screen.getByRole('textbox', { name: /search players/i }), 'SEARCH-KEY')
    expect(screen.getByText('SeasonedAdventurer')).toBeInTheDocument()
    expect(screen.getByText(/1 of 1 result/)).toBeInTheDocument()
  })
})

// ─── Ban action from Online Players ──────────────────────────────────────────

describe('App — ban action from online players', () => {
  it('opens the ban modal when Ban is confirmed on a player card', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await screen.findByText('Adventurer')
    // Step 1: click the Ban button on the card
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    // Step 2: confirm the inline "Ban?" dialog within PlayerListItem
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    // BanModal should now be open, showing the player's name in the target
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Adventurer')).toBeInTheDocument()
  })

  it('calls POST /bans with the correct payload when the modal is confirmed', async () => {
    let banPayload: unknown = null
    server.use(
      http.post('http://localhost:3001/bans', async ({ request }) => {
        banPayload = await request.json()
        return HttpResponse.json({})
      })
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await screen.findByText('Adventurer')
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    await screen.findByRole('dialog')
    await user.type(screen.getByLabelText(/reason/i), 'Breaking server rules')
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    await vi.waitFor(() =>
      expect(banPayload).toMatchObject({
        public_cd_keys: ['PLAYER-KEY-1'],
        ban_reason: 'Breaking server rules',
        ban_temporary: false,
      })
    )
  })

  it('closes the ban modal when Cancel is clicked', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await screen.findByText('Adventurer')
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// ─── Settings page ────────────────────────────────────────────────────────────

describe('App — settings page', () => {
  it('navigates to the settings page from the navbar', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^settings$/i }))
    expect(screen.getByRole('heading', { name: /^settings$/i })).toBeInTheDocument()
  })

  it('shows the account UUID on the settings page', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^settings$/i }))
    expect(await screen.findByText('test-uuid-1234')).toBeInTheDocument()
  })
})

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('App — logout', () => {
  it('returns to the login page after clicking Logout', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /logout/i }))
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('clears the navbar and page content after logout', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await screen.findByText('Adventurer')
    await user.click(screen.getByRole('button', { name: /logout/i }))
    await screen.findByRole('button', { name: /sign in/i })
    expect(screen.queryByText('Adventurer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /online players/i })).not.toBeInTheDocument()
  })
})

// ─── Online Players page states ───────────────────────────────────────────────

describe('App — online players page states', () => {
  it('shows "No players are currently online" when the list is empty', async () => {
    server.use(
      http.get('http://localhost:3001/online_players', () => HttpResponse.json([])),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    expect(await screen.findByText(/no players are currently online/i)).toBeInTheDocument()
  })

  it('shows how many players are online', async () => {
    server.use(
      http.get('http://localhost:3001/online_players', () =>
        HttpResponse.json([
          { public_cd_key: 'KEY-ZORRO', online_player_name: 'Zorro', character_name: 'El Zorro', ip_address: '10.0.0.3', logged_on_at: '2026-07-12 09:00:00' },
          { public_cd_key: 'KEY-ALICE', online_player_name: 'Alice', character_name: 'Lady Alice', ip_address: '10.0.0.4', logged_on_at: '2026-07-11 09:00:00' },
        ])
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    expect(await screen.findByText('2 players online')).toBeInTheDocument()
  })

  it('uses the singular when one player is online', async () => {
    server.use(
      http.get('http://localhost:3001/online_players', () =>
        HttpResponse.json([
          { public_cd_key: 'KEY-ALICE', online_player_name: 'Alice', character_name: 'Lady Alice', ip_address: '10.0.0.4', logged_on_at: '2026-07-11 09:00:00' },
        ])
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    expect(await screen.findByText('1 player online')).toBeInTheDocument()
  })

  it('shows an error alert when the online players fetch fails', async () => {
    server.use(
      http.get('http://localhost:3001/online_players', () =>
        HttpResponse.json({}, { status: 500 })
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/error/i)
  })

  it('sorts the player list by name when the Name sort button is clicked', async () => {
    server.use(
      http.get('http://localhost:3001/online_players', () =>
        HttpResponse.json([
          { public_cd_key: 'KEY-ZORRO', online_player_name: 'Zorro', character_name: 'El Zorro', ip_address: '10.0.0.3', logged_on_at: '2026-07-12 09:00:00' },
          { public_cd_key: 'KEY-ALICE', online_player_name: 'Alice', character_name: 'Lady Alice', ip_address: '10.0.0.4', logged_on_at: '2026-07-11 09:00:00' },
        ])
      ),
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await screen.findByText('Zorro')

    // Default: logged_on_at desc → Zorro (more recent) first
    let names = Array.from(document.querySelectorAll('.player-card__username')).map(el => el.textContent)
    expect(names).toEqual(['Zorro', 'Alice'])

    // Click Name sort → alphabetical asc
    await user.click(screen.getByRole('button', { name: /sort by name/i }))
    names = Array.from(document.querySelectorAll('.player-card__username')).map(el => el.textContent)
    expect(names).toEqual(['Alice', 'Zorro'])
  })

  it('expands all player cards when Expand All is clicked', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await screen.findByText('Adventurer')
    await user.click(screen.getByRole('button', { name: /expand all/i }))
    const hideBtn = await screen.findByRole('button', { name: /hide details/i })
    expect(hideBtn).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses all player cards when Collapse All is clicked', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await screen.findByText('Adventurer')
    await user.click(screen.getByRole('button', { name: /expand all/i }))
    await screen.findByRole('button', { name: /hide details/i })
    await user.click(screen.getByRole('button', { name: /collapse all/i }))
    const showBtn = await screen.findByRole('button', { name: /show details/i })
    expect(showBtn).toHaveAttribute('aria-expanded', 'false')
  })
})

// ─── Bans page — edit ban reason ─────────────────────────────────────────────

describe('App — bans page edit ban reason', () => {
  it('calls PATCH /bans/:id with the updated reason', async () => {
    server.use(
      http.get('http://localhost:3001/active_bans', () => HttpResponse.json([activeBan])),
      http.get('http://localhost:3001/bans/:id', () => HttpResponse.json(activeBanDetails)),
    )
    let editPayload: unknown = null
    server.use(
      http.patch('http://localhost:3001/bans/:id', async ({ request }) => {
        editPayload = await request.json()
        return HttpResponse.json({})
      })
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /^bans$/i }))
    await screen.findByText('#1')
    await user.click(screen.getByRole('button', { name: /edit ban reason/i }))
    const reasonInput = screen.getByRole('textbox', { name: /ban reason/i })
    await user.clear(reasonInput)
    await user.type(reasonInput, 'Updated reason')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    await vi.waitFor(() => expect(editPayload).toEqual({ ban_reason: 'Updated reason' }))
  })
})

// ─── Ban from All Players page ────────────────────────────────────────────────

describe('App — ban from all players page', () => {
  beforeEach(() => {
    server.use(
      http.get('http://localhost:3001/player_data', () =>
        HttpResponse.json([{
          public_cd_key: 'SEARCH-KEY-1',
          player_names: ['SeasonedAdventurer'],
          ip_addresses: ['192.168.1.50'],
          characters: [],
        }])
      ),
    )
  })

  it('opens the ban modal when Ban is confirmed on a player search card', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    await screen.findByText('SeasonedAdventurer')
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('SeasonedAdventurer')).toBeInTheDocument()
  })

  it('calls POST /bans with the correct CD key', async () => {
    let banPayload: unknown = null
    server.use(
      http.post('http://localhost:3001/bans', async ({ request }) => {
        banPayload = await request.json()
        return HttpResponse.json({})
      })
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    await screen.findByText('SeasonedAdventurer')
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    await vi.waitFor(() =>
      expect(banPayload).toMatchObject({ public_cd_keys: ['SEARCH-KEY-1'] })
    )
  })
})

// ─── Reset password via URL token ─────────────────────────────────────────────

describe('App — reset password via URL token', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('renders the reset password page when ?token= is present in the URL', () => {
    window.history.pushState({}, '', '?token=reset-abc-123')
    render(<App />)
    expect(screen.getByText(/set a new password/i)).toBeInTheDocument()
  })

  it('returns to the login page after a successful password reset', async () => {
    window.history.pushState({}, '', '?token=reset-abc-123')
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: /go to login/i }))
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})

// ─── My CD Keys page ──────────────────────────────────────────────────────────

describe('App — My CD Keys page', () => {
  it('shows linked CD keys after navigating to the page', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /my cd keys/i }))
    expect(await screen.findByText('ABC-DM-KEY')).toBeInTheDocument()
  })

  it('shows the OTP code after clicking Link CD Key', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /my cd keys/i }))
    await user.click(screen.getByRole('button', { name: /^link cd key$/i }))
    expect(await screen.findByText('123456')).toBeInTheDocument()
  })

  it('calls DELETE /linked_cd_keys when a CD key is unlinked', async () => {
    let deletePayload: unknown = null
    server.use(
      http.delete('http://localhost:3001/linked_cd_keys', async ({ request }) => {
        deletePayload = await request.json()
        return HttpResponse.json({})
      })
    )
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /my cd keys/i }))
    await screen.findByText('ABC-DM-KEY')
    await user.click(screen.getByRole('button', { name: /unlink cd key/i }))
    await user.click(screen.getByRole('button', { name: /confirm unlink/i }))
    await vi.waitFor(() => expect(deletePayload).toEqual({ public_cd_key: 'ABC-DM-KEY' }))
  })

  it('removes the CD key from the list after unlinking', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /my cd keys/i }))
    await screen.findByText('ABC-DM-KEY')
    await user.click(screen.getByRole('button', { name: /unlink cd key/i }))
    await user.click(screen.getByRole('button', { name: /confirm unlink/i }))
    await vi.waitFor(() => expect(screen.queryByText('ABC-DM-KEY')).not.toBeInTheDocument())
  })
})

// ─── Navigation flows ─────────────────────────────────────────────────────────

describe('App — navigation flows', () => {
  it('navigates to ForgotPasswordPage and back to login', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByText(/reset your password/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back to login/i }))
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('navigates to RegisterPage and back to login', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /register/i }))
    expect(screen.getByText(/create an account/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('pre-populates email and password when navigating from LoginPage to RegisterPage', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText(/^email$/i), 'test@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'mypassword')
    await user.click(screen.getByRole('button', { name: /register/i }))
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('test@example.com')
  })
})

// ─── All Players page expand / collapse ──────────────────────────────────────

describe('App — all players expand / collapse', () => {
  beforeEach(() => {
    server.use(
      http.get('http://localhost:3001/player_data', () =>
        HttpResponse.json([{
          public_cd_key: 'KEY-EXPAND',
          player_names: ['ExpandUser'],
          ip_addresses: ['10.1.1.1'],
          characters: [{ pcid: 'pc1', character_name: 'Warrior' }],
        }])
      )
    )
  })

  it('expands all player search cards when Expand All is clicked', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    await screen.findByText('ExpandUser')
    await user.click(screen.getByRole('button', { name: /expand all/i }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /characters/i })).toHaveAttribute('aria-expanded', 'true')
    )
  })

  it('collapses all player search cards when Collapse All is clicked', async () => {
    const user = userEvent.setup()
    await loginAsDM(user)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    await screen.findByText('ExpandUser')
    await user.click(screen.getByRole('button', { name: /expand all/i }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /characters/i })).toHaveAttribute('aria-expanded', 'true')
    )
    await user.click(screen.getByRole('button', { name: /collapse all/i }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /characters/i })).toHaveAttribute('aria-expanded', 'false')
    )
  })
})
