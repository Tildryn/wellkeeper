import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlayerListItem from '@/PlayerListItem'

const defaultProps = {
  online_player_name: 'Adventurer',
  character_name: 'Thorin',
  public_cd_key: 'PLAYER-KEY-1',
  ip_address: '10.0.0.1',
  logged_on_at: '2026-07-12 10:00:00',
  onBan: vi.fn(),
  onUnban: vi.fn(),
  isBanned: false,
  expandGen: null,
}

describe('PlayerListItem', () => {
  it('renders the player name and character name', () => {
    render(<PlayerListItem {...defaultProps} />)
    expect(screen.getByText('Adventurer')).toBeInTheDocument()
    expect(screen.getByText('Thorin')).toBeInTheDocument()
  })

  it('renders the CD key in the secondary section', () => {
    render(<PlayerListItem {...defaultProps} />)
    expect(screen.getByText('PLAYER-KEY-1')).toBeInTheDocument()
  })

  it('shows the expand toggle button', () => {
    render(<PlayerListItem {...defaultProps} />)
    expect(screen.getByRole('button', { name: /show details/i })).toBeInTheDocument()
  })

  it('toggles expanded state when the expand button is clicked', async () => {
    const user = userEvent.setup()
    render(<PlayerListItem {...defaultProps} />)
    const toggleBtn = screen.getByRole('button', { name: /show details/i })
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggleBtn)
    expect(screen.getByRole('button', { name: /hide details/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows the Ban button for an unbanned player', () => {
    render(<PlayerListItem {...defaultProps} isBanned={false} />)
    expect(screen.getByRole('button', { name: /^ban$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^unban$/i })).not.toBeInTheDocument()
  })

  it('shows the Unban button for a banned player', () => {
    render(<PlayerListItem {...defaultProps} isBanned={true} />)
    expect(screen.getByRole('button', { name: /^unban$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ban$/i })).not.toBeInTheDocument()
  })

  it('shows the ban confirm dialog when Ban is clicked', async () => {
    const user = userEvent.setup()
    render(<PlayerListItem {...defaultProps} isBanned={false} />)
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    expect(screen.getByText('Ban?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm ban/i })).toBeInTheDocument()
  })

  it('calls onBan when the confirm dialog is confirmed', async () => {
    const onBan = vi.fn()
    const user = userEvent.setup()
    render(<PlayerListItem {...defaultProps} isBanned={false} onBan={onBan} />)
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    expect(onBan).toHaveBeenCalled()
  })

  it('dismisses the confirm dialog without calling onBan when cancelled', async () => {
    const onBan = vi.fn()
    const user = userEvent.setup()
    render(<PlayerListItem {...defaultProps} isBanned={false} onBan={onBan} />)
    await user.click(screen.getByRole('button', { name: /^ban$/i }))
    await user.click(screen.getByRole('button', { name: /cancel ban/i }))
    expect(onBan).not.toHaveBeenCalled()
    expect(screen.queryByText('Ban?')).not.toBeInTheDocument()
  })

  it('calls onUnban when confirming an unban', async () => {
    const onUnban = vi.fn()
    const user = userEvent.setup()
    render(<PlayerListItem {...defaultProps} isBanned={true} onUnban={onUnban} />)
    await user.click(screen.getByRole('button', { name: /^unban$/i }))
    await user.click(screen.getByRole('button', { name: /confirm unban/i }))
    expect(onUnban).toHaveBeenCalled()
  })

  it('expands all cards when expandGen changes', async () => {
    const { rerender } = render(<PlayerListItem {...defaultProps} expandGen={null} />)
    expect(screen.getByRole('button', { name: /show details/i })).toHaveAttribute('aria-expanded', 'false')
    rerender(<PlayerListItem {...defaultProps} expandGen={{ v: 1, expanded: true }} />)
    expect(screen.getByRole('button', { name: /hide details/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders the IP address', () => {
    render(<PlayerListItem {...defaultProps} />)
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
  })

  it('does not call onUnban when the cancel button is clicked', async () => {
    const onUnban = vi.fn()
    const user = userEvent.setup()
    render(<PlayerListItem {...defaultProps} isBanned={true} onUnban={onUnban} />)
    await user.click(screen.getByRole('button', { name: /^unban$/i }))
    await user.click(screen.getByRole('button', { name: /cancel unban/i }))
    expect(onUnban).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /confirm unban/i })).not.toBeInTheDocument()
  })

  it('opens the description and Inner World, and says when the Inner World has changed', async () => {
    const onDescription = vi.fn()
    const onInnerWorld = vi.fn()
    const user = userEvent.setup()
    render(<PlayerListItem {...defaultProps} inner_world="changed" onDescription={onDescription} onInnerWorld={onInnerWorld} />)
    await user.click(screen.getByRole('button', { name: 'Description' }))
    expect(onDescription).toHaveBeenCalled()
    const inner = screen.getByRole('button', { name: 'Inner World, changed' })
    expect(inner).toHaveClass('player-card__action-btn--new')
    expect(inner).toHaveAttribute('title', expect.stringMatching(/changed since you last read it/))
    await user.click(inner)
    expect(onInnerWorld).toHaveBeenCalled()
  })

  it('does not glow an Inner World already read', () => {
    render(<PlayerListItem {...defaultProps} inner_world="seen" onInnerWorld={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Inner World' })).not.toHaveClass('player-card__action-btn--new')
  })

  it('opens the Location window, and has no Location button without a character to find', async () => {
    const onLocation = vi.fn()
    const user = userEvent.setup()
    const { unmount } = render(<PlayerListItem {...defaultProps} onLocation={onLocation} />)
    await user.click(screen.getByRole('button', { name: 'Location' }))
    expect(onLocation).toHaveBeenCalled()
    unmount()

    render(<PlayerListItem {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Location' })).not.toBeInTheDocument()
  })
})
