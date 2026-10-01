import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlayerSearchItem from '@/PlayerSearchItem'
import type { Ban } from '@/types'

const mockBan: Ban = {
  ban_id: 99,
  ban_reason: 'Griefing heavily',
  ban_start: '2026-01-01 12:00:00',
  ban_end: null,
  ban_temporary: false,
  creator_display_name: 'AdminDM',
  ban_creator: 'uuid-admin',
  ban_lifter: null,
  lifter_display_name: null,
  cd_keys: ['KEY-1'],
  player_names: ['EvildoerX'],
  ip_addresses: ['10.0.0.1'],
}

const defaultProps = {
  public_cd_key: 'SEARCH-KEY-1',
  player_names: ['PlayerOne', 'AltName'],
  ip_addresses: ['192.168.1.1'],
  characters: [{ pcid: 'pcid-1', character_name: 'Gandalf', inner_world: 'unread' as const }],
  onBan: vi.fn(),
  onUnban: vi.fn(),
  isBanned: false,
  session: null,
  playerBans: [],
  onUnbanById: vi.fn(),
  onExpungeById: vi.fn(),
  onEditBanById: vi.fn().mockResolvedValue(undefined),
  onView: vi.fn(),
  expandGen: null,
}

describe('PlayerSearchItem', () => {
  it('renders the CD key', () => {
    render(<PlayerSearchItem {...defaultProps} />)
    expect(screen.getByText('SEARCH-KEY-1')).toBeInTheDocument()
  })

  it('renders all player names as tags', () => {
    render(<PlayerSearchItem {...defaultProps} />)
    expect(screen.getByText('PlayerOne')).toBeInTheDocument()
    expect(screen.getByText('AltName')).toBeInTheDocument()
  })

  it('renders the IP address', () => {
    render(<PlayerSearchItem {...defaultProps} />)
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument()
  })

  it('renders the character name', () => {
    render(<PlayerSearchItem {...defaultProps} />)
    expect(screen.getByText('Gandalf')).toBeInTheDocument()
  })

  it('shows the Ban button for an unbanned player', () => {
    render(<PlayerSearchItem {...defaultProps} isBanned={false} />)
    expect(screen.getByRole('button', { name: /^ban$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^unban$/i })).not.toBeInTheDocument()
  })

  it('shows the Unban button for a banned player', () => {
    render(<PlayerSearchItem {...defaultProps} isBanned={true} />)
    expect(screen.getByRole('button', { name: /^unban$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ban$/i })).not.toBeInTheDocument()
  })

  it('shows the ban confirm dialog when Ban is clicked', async () => {
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} isBanned={false} />)
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    expect(screen.getByText('Ban?')).toBeInTheDocument()
  })

  it('calls onBan when the ban is confirmed', async () => {
    const onBan = vi.fn()
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} isBanned={false} onBan={onBan} />)
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    expect(onBan).toHaveBeenCalled()
  })

  it('dismisses the confirm dialog without calling onBan when cancelled', async () => {
    const onBan = vi.fn()
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} isBanned={false} onBan={onBan} />)
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /cancel ban/i }))
    expect(onBan).not.toHaveBeenCalled()
  })

  it('shows ban summary rows when playerBans are provided', () => {
    render(<PlayerSearchItem {...defaultProps} playerBans={[mockBan]} />)
    expect(screen.getByRole('button', { name: /view ban #99 details/i })).toBeInTheDocument()
  })

  it('opens the ban detail modal when a ban row is clicked', async () => {
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} playerBans={[mockBan]} />)
    await user.click(screen.getByRole('button', { name: /view ban #99 details/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Griefing heavily')).toBeInTheDocument()
  })

  it('closes the ban detail modal when Close is clicked', async () => {
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} playerBans={[mockBan]} />)
    await user.click(screen.getByRole('button', { name: /view ban #99 details/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /^close$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the ban detail modal when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} playerBans={[mockBan]} />)
    await user.click(screen.getByRole('button', { name: /view ban #99 details/i }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a dash for last login when session is null', () => {
    render(<PlayerSearchItem {...defaultProps} session={null} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('toggles the characters section', async () => {
    const user = userEvent.setup()
    // Use expandGen to force a known initial state (collapsed) regardless of window.innerWidth
    render(<PlayerSearchItem {...defaultProps} expandGen={{ v: 1, expanded: false }} />)
    const charsToggle = screen.getByRole('button', { name: /characters/i })
    expect(charsToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(charsToggle)
    expect(charsToggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles the bans section', async () => {
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} playerBans={[mockBan]} expandGen={{ v: 1, expanded: false }} />)
    const bansToggle = screen.getByRole('button', { name: /^bans/i })
    expect(bansToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(bansToggle)
    expect(bansToggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('expandGen propagates to the bans section', () => {
    const { rerender } = render(
      <PlayerSearchItem {...defaultProps} playerBans={[mockBan]} expandGen={{ v: 1, expanded: false }} />
    )
    expect(screen.getByRole('button', { name: /^bans/i })).toHaveAttribute('aria-expanded', 'false')
    rerender(<PlayerSearchItem {...defaultProps} playerBans={[mockBan]} expandGen={{ v: 2, expanded: true }} />)
    expect(screen.getByRole('button', { name: /^bans/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows the unban confirm dialog when Unban is clicked', async () => {
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} isBanned={true} />)
    await user.click(screen.getByRole('button', { name: /^unban$/i }))
    expect(screen.getByText('Unban?')).toBeInTheDocument()
  })

  it('calls onUnban when the unban is confirmed', async () => {
    const onUnban = vi.fn()
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} isBanned={true} onUnban={onUnban} />)
    await user.click(screen.getByRole('button', { name: /^unban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm unban/i }))
    expect(onUnban).toHaveBeenCalled()
  })

  it('dismisses the unban dialog without calling onUnban when cancelled', async () => {
    const onUnban = vi.fn()
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} isBanned={true} onUnban={onUnban} />)
    await user.click(screen.getByRole('button', { name: /^unban$/i }))
    await user.click(screen.getByRole('button', { name: /cancel unban/i }))
    expect(onUnban).not.toHaveBeenCalled()
    expect(screen.queryByText('Unban?')).not.toBeInTheDocument()
  })

  it('opens a character\'s description and Inner World', async () => {
    const onView = vi.fn()
    const user = userEvent.setup()
    render(<PlayerSearchItem {...defaultProps} onView={onView} />)
    await user.click(screen.getByRole('button', { name: /description/i }))
    expect(onView).toHaveBeenLastCalledWith({ kind: 'description', pcid: 'pcid-1', name: 'Gandalf' })
    await user.click(screen.getByRole('button', { name: /inner world/i }))
    expect(onView).toHaveBeenLastCalledWith({ kind: 'inner_world', pcid: 'pcid-1', name: 'Gandalf' })
  })

  it('makes an unread Inner World glow, and greys an empty one', async () => {
    const onView = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<PlayerSearchItem {...defaultProps} onView={onView} />)
    const button = screen.getByRole('button', { name: /inner world/i })
    expect(button).toHaveClass('player-card__action-btn--new')
    expect(button).toHaveAttribute('title', expect.stringMatching(/not read it yet/))

    rerender(<PlayerSearchItem {...defaultProps} onView={onView}
      characters={[{ pcid: 'pcid-1', character_name: 'Gandalf', inner_world: 'empty' }]} />)
    const empty = screen.getByRole('button', { name: /inner world/i })
    expect(empty).toHaveAttribute('aria-disabled', 'true')
    expect(empty).not.toHaveClass('player-card__action-btn--new')
    expect(empty).toHaveAttribute('title', 'Gandalf has not written anything in their Inner World')
    await user.click(empty)
    expect(onView).not.toHaveBeenCalled()
  })
})
