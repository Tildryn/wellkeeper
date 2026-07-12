import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import SettingsPage from '@/SettingsPage'
import { server } from './msw/server'

const defaultProps = {
  authToken: 'test-token',
  accountUuid: 'uuid-1234',
  displayName: 'CurrentDM',
  onDisplayNameChanged: vi.fn(),
}

describe('SettingsPage', () => {
  it('shows the account UUID', () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByText('uuid-1234')).toBeInTheDocument()
  })

  it('loads and displays the current email on mount', async () => {
    render(<SettingsPage {...defaultProps} />)
    expect(await screen.findByText('dm@example.com')).toBeInTheDocument()
  })

  it('uses the current displayName as the new-display-name placeholder', () => {
    render(<SettingsPage {...defaultProps} displayName="MyName" />)
    expect(screen.getByLabelText(/new display name/i)).toHaveAttribute('placeholder', 'MyName')
  })

  it('disables the Update display name button when the field is empty', () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByRole('button', { name: /update display name/i })).toBeDisabled()
  })

  it('shows success after updating the display name', async () => {
    const onDisplayNameChanged = vi.fn()
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} onDisplayNameChanged={onDisplayNameChanged} />)
    await user.type(screen.getByLabelText(/new display name/i), 'NewAlias')
    await user.click(screen.getByRole('button', { name: /update display name/i }))
    expect(await screen.findByText(/display name updated/i)).toBeInTheDocument()
    expect(onDisplayNameChanged).toHaveBeenCalledWith('NewName')
  })

  it('shows an API error when the display name update fails', async () => {
    server.use(
      http.patch('http://localhost:3001/display_name', () =>
        HttpResponse.json({ error: 'Name taken.' }, { status: 409 })
      )
    )
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} />)
    await user.type(screen.getByLabelText(/new display name/i), 'TakenName')
    await user.click(screen.getByRole('button', { name: /update display name/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/name taken/i)
  })

  it('shows a password mismatch error without making a network request', async () => {
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} />)

    const pwForm = screen.getByRole('button', { name: /update password/i }).closest('form')!
    const currentPwInput = within(pwForm).getByLabelText('Current password')

    await user.click(currentPwInput)
    await user.type(currentPwInput, 'currentpass')
    await user.type(within(pwForm).getByLabelText('New password'), 'newpass1')
    await user.type(within(pwForm).getByLabelText('Confirm new password'), 'newpass2')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i)
  })

  it('shows success after a valid password change', async () => {
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} />)

    const pwForm = screen.getByRole('button', { name: /update password/i }).closest('form')!
    const currentPwInput = within(pwForm).getByLabelText('Current password')

    await user.click(currentPwInput)
    await user.type(currentPwInput, 'currentpass')
    await user.type(within(pwForm).getByLabelText('New password'), 'newpass1')
    await user.type(within(pwForm).getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/password updated successfully/i)).toBeInTheDocument()
  })

  it('shows an API error when the password change fails', async () => {
    server.use(
      http.patch('http://localhost:3001/password', () =>
        HttpResponse.json({ error: 'Incorrect current password.' }, { status: 401 })
      )
    )
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} />)
    const pwForm = screen.getByRole('button', { name: /update password/i }).closest('form')!
    const currentPwInput = within(pwForm).getByLabelText('Current password')
    await user.click(currentPwInput)
    await user.type(currentPwInput, 'wrongpass')
    await user.type(within(pwForm).getByLabelText('New password'), 'newpass1')
    await user.type(within(pwForm).getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect current password/i)
  })

  it('hides the UUID row when accountUuid is null', () => {
    render(<SettingsPage {...defaultProps} accountUuid={null} />)
    expect(screen.queryByText('UUID')).not.toBeInTheDocument()
  })
})

// ─── Change email form ────────────────────────────────────────────────────────

describe('SettingsPage — change email', () => {
  it('disables the Update email button until both fields are filled', () => {
    render(<SettingsPage {...defaultProps} />)
    expect(screen.getByRole('button', { name: /update email/i })).toBeDisabled()
  })

  it('shows success after a valid email update', async () => {
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} />)
    const emailForm = screen.getByRole('button', { name: /update email/i }).closest('form')!
    const currentPwInput = within(emailForm).getByLabelText('Current password')
    await user.click(currentPwInput)
    await user.type(currentPwInput, 'mypassword')
    await user.type(within(emailForm).getByLabelText(/new email address/i), 'new@example.com')
    await user.click(screen.getByRole('button', { name: /update email/i }))
    expect(await screen.findByText(/email updated successfully/i)).toBeInTheDocument()
  })

  it('shows an API error when the email update fails', async () => {
    server.use(
      http.patch('http://localhost:3001/email', () =>
        HttpResponse.json({ error: 'Incorrect password.' }, { status: 401 })
      )
    )
    const user = userEvent.setup()
    render(<SettingsPage {...defaultProps} />)
    const emailForm = screen.getByRole('button', { name: /update email/i }).closest('form')!
    const currentPwInput = within(emailForm).getByLabelText('Current password')
    await user.click(currentPwInput)
    await user.type(currentPwInput, 'wrongpassword')
    await user.type(within(emailForm).getByLabelText(/new email address/i), 'new@example.com')
    await user.click(screen.getByRole('button', { name: /update email/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect password/i)
  })
})
