import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Navbar from '@/Navbar'
import { PAGES } from '@/pages'

const defaultProps = {
  activePage: PAGES.ONLINE_PLAYERS,
  onNavigate: vi.fn(),
  onLogout: vi.fn(),
  isDM: true,
  displayName: 'TestDM',
}

describe('Navbar', () => {
  it('renders the brand title', () => {
    render(<Navbar {...defaultProps} />)
    expect(screen.getByText(/wellkeeper/i)).toBeInTheDocument()
  })

  it('shows the displayName when provided', () => {
    render(<Navbar {...defaultProps} displayName="HeroName" />)
    expect(screen.getByText('HeroName')).toBeInTheDocument()
  })

  it('omits the displayName section when null', () => {
    const { container } = render(<Navbar {...defaultProps} displayName={null} />)
    expect(container.querySelector('.navbar__display-name')).toBeNull()
  })

  it('shows DM nav items when isDM is true', () => {
    render(<Navbar {...defaultProps} isDM={true} />)
    expect(screen.getByRole('button', { name: /online players/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all players/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^bans$/i })).toBeInTheDocument()
  })

  it('hides DM nav items when isDM is false', () => {
    render(<Navbar {...defaultProps} isDM={false} />)
    expect(screen.queryByRole('button', { name: /online players/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /all players/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^bans$/i })).not.toBeInTheDocument()
  })

  it('marks the active page button with aria-current="page"', () => {
    render(<Navbar {...defaultProps} activePage={PAGES.ALL_PLAYERS} />)
    expect(screen.getByRole('button', { name: /all players/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /online players/i })).not.toHaveAttribute('aria-current')
  })

  it('calls onNavigate with the correct page when a nav item is clicked', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<Navbar {...defaultProps} onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: /all players/i }))
    expect(onNavigate).toHaveBeenCalledWith(PAGES.ALL_PLAYERS)
  })

  it('calls onLogout when the Logout button is clicked', async () => {
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<Navbar {...defaultProps} onLogout={onLogout} />)
    await user.click(screen.getByRole('button', { name: /logout/i }))
    expect(onLogout).toHaveBeenCalled()
  })

  it('always shows the My CD Keys button regardless of isDM', () => {
    render(<Navbar {...defaultProps} isDM={false} />)
    expect(screen.getByRole('button', { name: /my cd keys/i })).toBeInTheDocument()
  })

  it('always shows the Settings button regardless of isDM', () => {
    render(<Navbar {...defaultProps} isDM={false} />)
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('calls onNavigate with MY_CD_KEYS when My CD Keys is clicked', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<Navbar {...defaultProps} onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: /my cd keys/i }))
    expect(onNavigate).toHaveBeenCalledWith(PAGES.MY_CD_KEYS)
  })

  it('calls onNavigate with SETTINGS when the Settings button is clicked', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<Navbar {...defaultProps} onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: /settings/i }))
    expect(onNavigate).toHaveBeenCalledWith(PAGES.SETTINGS)
  })

  it('marks My CD Keys as active when activePage is MY_CD_KEYS', () => {
    render(<Navbar {...defaultProps} activePage={PAGES.MY_CD_KEYS} />)
    expect(screen.getByRole('button', { name: /my cd keys/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Settings as active when activePage is SETTINGS', () => {
    render(<Navbar {...defaultProps} activePage={PAGES.SETTINGS} />)
    expect(screen.getByRole('button', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
  })
})
