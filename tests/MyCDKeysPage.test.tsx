import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import MyCDKeysPage from '@/MyCDKeysPage'
import { server } from './msw/server'

const defaultProps = {
  authToken: 'test-token',
  cdKeys: [],
  cdKeysLoading: false,
  cdKeysError: null,
  onDeleted: vi.fn(),
  onRefreshCdKeys: vi.fn(),
}

describe('MyCDKeysPage', () => {
  it('shows the empty state when no keys are linked', () => {
    render(<MyCDKeysPage {...defaultProps} />)
    expect(screen.getByText(/no cd keys linked yet/i)).toBeInTheDocument()
  })

  it('shows a loading indicator while keys are loading', () => {
    render(<MyCDKeysPage {...defaultProps} cdKeysLoading={true} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows an error when cdKeysError is set', () => {
    render(<MyCDKeysPage {...defaultProps} cdKeysError="Failed to load." />)
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i)
  })

  it('renders linked CD keys', () => {
    render(<MyCDKeysPage {...defaultProps} cdKeys={[{ public_cd_key: 'MYKEY-123', dm: false }]} />)
    expect(screen.getByText('MYKEY-123')).toBeInTheDocument()
  })

  it('shows a DM badge for DM keys', () => {
    const { container } = render(<MyCDKeysPage {...defaultProps} cdKeys={[{ public_cd_key: 'DM-KEY', dm: true }]} />)
    // "DM" also appears as a column header, so target the badge by class
    expect(container.querySelector('.cdkeys-list__dm')).not.toBeNull()
  })

  it('generates and displays an OTP when Link CD Key is clicked', async () => {
    const user = userEvent.setup()
    render(<MyCDKeysPage {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /link cd key/i }))
    expect(await screen.findByText('123456')).toBeInTheDocument()
  })

  it('shows an error when OTP generation fails', async () => {
    server.use(
      http.post('http://localhost:3001/otp', () =>
        HttpResponse.json({}, { status: 500 })
      )
    )
    const user = userEvent.setup()
    render(<MyCDKeysPage {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /link cd key/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/server error/i)
  })

  it('shows a confirm dialog when the unlink button is clicked', async () => {
    const user = userEvent.setup()
    render(<MyCDKeysPage {...defaultProps} cdKeys={[{ public_cd_key: 'KEY-1', dm: false }]} />)
    await user.click(screen.getByRole('button', { name: /unlink cd key/i }))
    expect(screen.getByText('Sure?')).toBeInTheDocument()
  })

  it('calls onDeleted after confirming the unlink', async () => {
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(<MyCDKeysPage {...defaultProps} cdKeys={[{ public_cd_key: 'KEY-1', dm: false }]} onDeleted={onDeleted} />)
    await user.click(screen.getByRole('button', { name: /unlink cd key/i }))
    await user.click(screen.getByRole('button', { name: /confirm unlink/i }))
    expect(onDeleted).toHaveBeenCalledWith('KEY-1')
  })

  it('cancels the unlink dialog without calling onDeleted', async () => {
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(<MyCDKeysPage {...defaultProps} cdKeys={[{ public_cd_key: 'KEY-1', dm: false }]} onDeleted={onDeleted} />)
    await user.click(screen.getByRole('button', { name: /unlink cd key/i }))
    await user.click(screen.getByRole('button', { name: /cancel unlink/i }))
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.queryByText('Sure?')).not.toBeInTheDocument()
  })

  it('shows an error alert when the unlink request fails', async () => {
    server.use(
      http.delete('http://localhost:3001/linked_cd_keys', () =>
        HttpResponse.json({ error: 'Cannot unlink the last key.' }, { status: 400 })
      )
    )
    const user = userEvent.setup()
    render(<MyCDKeysPage {...defaultProps} cdKeys={[{ public_cd_key: 'KEY-1', dm: false }]} />)
    await user.click(screen.getByRole('button', { name: /unlink cd key/i }))
    await user.click(screen.getByRole('button', { name: /confirm unlink/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot unlink/i)
  })

  it('disables the unlink button while an OTP is active', async () => {
    const user = userEvent.setup()
    render(<MyCDKeysPage {...defaultProps} cdKeys={[{ public_cd_key: 'KEY-1', dm: false }]} />)
    await user.click(screen.getByRole('button', { name: /^link cd key$/i }))
    await screen.findByText('123456')
    expect(screen.getByRole('button', { name: /unlink cd key/i })).toBeDisabled()
  })
})
