import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BannedPlayerItem from '@/BannedPlayerItem'
import type { BannedPlayerItemProps } from '@/BannedPlayerItem'

function makeProps(overrides: Partial<BannedPlayerItemProps> = {}): BannedPlayerItemProps {
  return {
    ban_id: 42,
    player_names: ['BadActor'],
    cd_keys: ['KEY-ABC'],
    ip_addresses: ['192.168.1.1'],
    ban_reason: 'Rule violation',
    ban_start: '2026-01-01 12:00:00',
    ban_end: null,
    ban_temporary: false,
    creator_display_name: 'AdminDM',
    ban_creator: 'admin-uuid-123',
    ban_lifter: null,
    lifter_display_name: null,
    onUnban: vi.fn(),
    onExpunge: vi.fn(),
    onEditBan: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('BannedPlayerItem', () => {
  it('renders the ban ID', () => {
    render(<BannedPlayerItem {...makeProps()} />)
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('shows Permanent badge for a non-temporary ban', () => {
    const { container } = render(<BannedPlayerItem {...makeProps({ ban_temporary: false })} />)
    // "Permanent" appears in both the type badge and the ban-end display for an active permanent ban
    expect(container.querySelector('.banned-card__type--permanent')).not.toBeNull()
  })

  it('shows Temporary badge for a temporary ban', () => {
    render(<BannedPlayerItem {...makeProps({ ban_temporary: true, ban_end: '2099-01-01 00:00:00' })} />)
    expect(screen.getByText('Temporary')).toBeInTheDocument()
  })

  it('shows Lifted status when ban has been lifted', () => {
    render(<BannedPlayerItem {...makeProps({ ban_lifter: 'some-uuid', ban_end: '2025-01-01 00:00:00' })} />)
    expect(screen.getByText('Lifted')).toBeInTheDocument()
  })

  it('shows Expired status when ban has passed its end date', () => {
    render(<BannedPlayerItem {...makeProps({ ban_end: '2020-01-01 00:00:00', ban_temporary: true })} />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
  })

  it('shows the ban reason', () => {
    render(<BannedPlayerItem {...makeProps()} />)
    expect(screen.getByText('Rule violation')).toBeInTheDocument()
  })

  it('shows "No reason given" when reason is null', () => {
    render(<BannedPlayerItem {...makeProps({ ban_reason: null })} />)
    expect(screen.getByText('No reason given')).toBeInTheDocument()
  })

  describe('editing the ban reason', () => {
    it('shows an input with the current reason when Edit is clicked', async () => {
      const user = userEvent.setup()
      render(<BannedPlayerItem {...makeProps()} />)
      await user.click(screen.getByRole('button', { name: /edit ban reason/i }))
      expect(screen.getByRole('textbox', { name: /ban reason/i })).toHaveValue('Rule violation')
    })

    it('calls onEditBan with the new reason on save', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn().mockResolvedValue(undefined)
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getByRole('button', { name: /edit ban reason/i }))
      const input = screen.getByRole('textbox', { name: /ban reason/i })
      await user.clear(input)
      await user.type(input, 'Updated reason')
      await user.click(screen.getByRole('button', { name: /^save$/i }))
      expect(onEditBan).toHaveBeenCalledWith({ ban_reason: 'Updated reason' })
    })

    it('cancels editing without calling onEditBan', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn()
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getByRole('button', { name: /edit ban reason/i }))
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))
      expect(onEditBan).not.toHaveBeenCalled()
      expect(screen.getByText('Rule violation')).toBeInTheDocument()
    })

    it('saves via Enter key', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn().mockResolvedValue(undefined)
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getByRole('button', { name: /edit ban reason/i }))
      const input = screen.getByRole('textbox', { name: /ban reason/i })
      await user.clear(input)
      await user.type(input, 'Via enter{Enter}')
      expect(onEditBan).toHaveBeenCalledWith({ ban_reason: 'Via enter' })
    })
  })

  describe('expunge confirm flow', () => {
    it('shows confirm dialog when Expunge is clicked', async () => {
      const user = userEvent.setup()
      render(<BannedPlayerItem {...makeProps()} />)
      await user.click(screen.getByRole('button', { name: /^expunge$/i }))
      expect(screen.getByText('Expunge?')).toBeInTheDocument()
    })

    it('calls onExpunge when confirmed', async () => {
      const user = userEvent.setup()
      const onExpunge = vi.fn()
      render(<BannedPlayerItem {...makeProps({ onExpunge })} />)
      await user.click(screen.getByRole('button', { name: /^expunge$/i }))
      await user.click(screen.getByRole('button', { name: /confirm expunge/i }))
      expect(onExpunge).toHaveBeenCalled()
    })

    it('does not call onExpunge when cancelled', async () => {
      const user = userEvent.setup()
      const onExpunge = vi.fn()
      render(<BannedPlayerItem {...makeProps({ onExpunge })} />)
      await user.click(screen.getByRole('button', { name: /^expunge$/i }))
      await user.click(screen.getByRole('button', { name: /cancel expunge/i }))
      expect(onExpunge).not.toHaveBeenCalled()
    })
  })

  describe('unban confirm flow', () => {
    it('shows Unban button only for active bans', () => {
      render(<BannedPlayerItem {...makeProps()} />)
      expect(screen.getByRole('button', { name: /^unban$/i })).toBeInTheDocument()
    })

    it('does not show Unban for expired bans', () => {
      render(<BannedPlayerItem {...makeProps({ ban_end: '2020-01-01 00:00:00', ban_temporary: true })} />)
      expect(screen.queryByRole('button', { name: /^unban$/i })).not.toBeInTheDocument()
    })

    it('calls onUnban when confirmed', async () => {
      const user = userEvent.setup()
      const onUnban = vi.fn()
      render(<BannedPlayerItem {...makeProps({ onUnban })} />)
      await user.click(screen.getByRole('button', { name: /^unban$/i }))
      await user.click(screen.getByRole('button', { name: /confirm unban/i }))
      expect(onUnban).toHaveBeenCalled()
    })

    it('does not call onUnban when the cancel button is clicked', async () => {
      const user = userEvent.setup()
      const onUnban = vi.fn()
      render(<BannedPlayerItem {...makeProps({ onUnban })} />)
      await user.click(screen.getByRole('button', { name: /^unban$/i }))
      await user.click(screen.getByRole('button', { name: /cancel unban/i }))
      expect(onUnban).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: /confirm unban/i })).not.toBeInTheDocument()
    })
  })

  describe('editing reason — keyboard and errors', () => {
    it('cancels reason editing when Escape is pressed', async () => {
      const user = userEvent.setup()
      render(<BannedPlayerItem {...makeProps()} />)
      await user.click(screen.getByRole('button', { name: /edit ban reason/i }))
      expect(screen.getByRole('textbox', { name: /ban reason/i })).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('textbox', { name: /ban reason/i })).not.toBeInTheDocument()
      expect(screen.getByText('Rule violation')).toBeInTheDocument()
    })

    it('shows an error when saving the ban reason fails', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn().mockRejectedValue(new Error('Network error'))
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getByRole('button', { name: /edit ban reason/i }))
      await user.type(screen.getByRole('textbox', { name: /ban reason/i }), ' extra')
      await user.click(screen.getByRole('button', { name: /^save$/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i)
    })
  })

  describe('adding a field', () => {
    it('shows the add input when the + button is clicked', async () => {
      const user = userEvent.setup()
      render(<BannedPlayerItem {...makeProps()} />)
      await user.click(screen.getByRole('button', { name: /add cd keys/i }))
      expect(screen.getByRole('textbox', { name: /cd keys/i })).toBeInTheDocument()
    })

    it('calls onEditBan with add_cd_keys when a CD key is added', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn().mockResolvedValue(undefined)
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getByRole('button', { name: /add cd keys/i }))
      await user.type(screen.getByRole('textbox', { name: /cd keys/i }), 'NEW-KEY-1')
      await user.click(screen.getByRole('button', { name: /^add$/i }))
      expect(onEditBan).toHaveBeenCalledWith({ add_cd_keys: ['NEW-KEY-1'] })
    })

    it('dismisses the add form without calling onEditBan when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn()
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getByRole('button', { name: /add cd keys/i }))
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))
      expect(onEditBan).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox', { name: /cd keys/i })).not.toBeInTheDocument()
    })
  })

  describe('removing a field', () => {
    it('calls onEditBan with remove_cd_keys when the remove button is clicked', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn().mockResolvedValue(undefined)
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getByRole('button', { name: /remove key-abc/i }))
      expect(onEditBan).toHaveBeenCalledWith({ remove_cd_keys: ['KEY-ABC'] })
    })
  })

  describe('convert permanent ban to temporary', () => {
    it('opens the convert dialog when the Permanent badge is clicked', async () => {
      const user = userEvent.setup()
      render(<BannedPlayerItem {...makeProps()} />)
      // Two "Permanent" buttons exist (header badge + ban-end row); click the first
      await user.click(screen.getAllByRole('button', { name: /permanent — convert to temporary ban/i })[0])
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Convert to Temporary Ban')).toBeInTheDocument()
    })

    it('calls onEditBan with ban_temporary and ban_end when confirmed', async () => {
      const user = userEvent.setup()
      const onEditBan = vi.fn().mockResolvedValue(undefined)
      render(<BannedPlayerItem {...makeProps({ onEditBan })} />)
      await user.click(screen.getAllByRole('button', { name: /permanent — convert to temporary ban/i })[0])
      fireEvent.change(screen.getByLabelText(/ban ends/i), { target: { value: '2027-06-01' } })
      await user.click(screen.getByRole('button', { name: /^confirm$/i }))
      expect(onEditBan).toHaveBeenCalledWith(
        expect.objectContaining({ ban_temporary: true, ban_end: expect.stringMatching(/^2027-06-01/) })
      )
    })

    it('closes the convert dialog when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<BannedPlayerItem {...makeProps()} />)
      await user.click(screen.getAllByRole('button', { name: /permanent — convert to temporary ban/i })[0])
      await screen.findByRole('dialog')
      await user.click(screen.getByRole('button', { name: /^cancel$/i }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
