import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BanModal from '@/BanModal'
import type { BanTarget } from '@/types'

const target: BanTarget = {
  cdKeys: ['ABC123'],
  playerNames: ['Villainous Player'],
  ipAddresses: ['1.2.3.4'],
}

describe('BanModal', () => {
  it('displays the player name from target', () => {
    render(<BanModal target={target} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Villainous Player')).toBeInTheDocument()
  })

  it('confirm button is enabled by default (permanent ban needs no date)', () => {
    render(<BanModal target={target} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /confirm ban/i })).not.toBeDisabled()
  })

  it('calls onCancel when the overlay is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<BanModal target={target} onConfirm={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<BanModal target={target} onConfirm={vi.fn()} onCancel={onCancel} />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onConfirm with reason and permanent defaults', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<BanModal target={target} onConfirm={onConfirm} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText(/reason/i), 'Griefing')
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    expect(onConfirm).toHaveBeenCalledWith({
      ban_reason: 'Griefing',
      ban_temporary: false,
      ban_end: undefined,
    })
  })

  it('calls onConfirm with no reason when field left blank', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<BanModal target={target} onConfirm={onConfirm} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    expect(onConfirm).toHaveBeenCalledWith({
      ban_reason: undefined,
      ban_temporary: false,
      ban_end: undefined,
    })
  })

  it('reveals date inputs when temporary checkbox is checked', async () => {
    const user = userEvent.setup()
    render(<BanModal target={target} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByLabelText(/ban ends/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /temporary ban/i }))
    expect(screen.getByLabelText(/ban ends/i)).toBeInTheDocument()
  })

  it('falls back to the CD key when no player name is present', () => {
    const noNameTarget: BanTarget = { cdKeys: ['FALLBACK-KEY'], playerNames: [], ipAddresses: [] }
    render(<BanModal target={noNameTarget} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('FALLBACK-KEY')).toBeInTheDocument()
  })

  it('disables Confirm Ban when temporary is checked but date is cleared', async () => {
    const user = userEvent.setup()
    render(<BanModal target={target} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: /temporary ban/i }))
    // Auto-fills a date — button should be enabled at this point
    expect(screen.getByRole('button', { name: /confirm ban/i })).not.toBeDisabled()
    // Clear the date field
    fireEvent.change(screen.getByLabelText(/ban ends/i), { target: { value: '' } })
    expect(screen.getByRole('button', { name: /confirm ban/i })).toBeDisabled()
  })

  it('calls onConfirm with ban_temporary and ban_end when a date is set', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<BanModal target={target} onConfirm={onConfirm} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: /temporary ban/i }))
    // Override auto-filled date with a known value
    fireEvent.change(screen.getByLabelText(/ban ends/i), { target: { value: '2027-01-01' } })
    fireEvent.change(screen.getByLabelText(/ban end time/i), { target: { value: '09:30' } })
    await user.click(screen.getByRole('button', { name: /confirm ban/i }))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ ban_temporary: true, ban_end: '2027-01-01 09:30:00' })
    )
  })
})
