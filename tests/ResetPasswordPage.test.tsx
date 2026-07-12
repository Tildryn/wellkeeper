import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import ResetPasswordPage from '@/ResetPasswordPage'
import { server } from './msw/server'

const defaultProps = {
  token: 'reset-token-abc',
  onSuccess: vi.fn(),
}

describe('ResetPasswordPage', () => {
  it('renders new password and confirm password fields', () => {
    render(<ResetPasswordPage {...defaultProps} />)
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
  })

  it('shows "Set a new password" subtitle', () => {
    render(<ResetPasswordPage {...defaultProps} />)
    expect(screen.getByText(/set a new password/i)).toBeInTheDocument()
  })

  it('disables the submit button when fields are empty', () => {
    render(<ResetPasswordPage {...defaultProps} />)
    expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled()
  })

  it('shows a client-side error when passwords do not match', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordPage {...defaultProps} />)
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass2')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i)
  })

  it('shows a success message after a valid reset', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordPage {...defaultProps} />)
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/password reset successfully/i)
  })

  it('calls onSuccess when Go to login is clicked after a successful reset', async () => {
    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<ResetPasswordPage {...defaultProps} onSuccess={onSuccess} />)
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    await screen.findByRole('status')
    await user.click(screen.getByRole('button', { name: /go to login/i }))
    expect(onSuccess).toHaveBeenCalled()
  })

  it('shows an API error on failure', async () => {
    server.use(
      http.post('http://localhost:3001/reset_password', () =>
        HttpResponse.json({ error: 'Token expired.' }, { status: 400 })
      )
    )
    const user = userEvent.setup()
    render(<ResetPasswordPage {...defaultProps} />)
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/token expired/i)
  })

  it('disables the submit button when only one field is filled', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordPage {...defaultProps} />)
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled()
  })

  it('toggles new password visibility', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordPage {...defaultProps} />)
    const input = screen.getByLabelText('New password')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show new password/i }))
    expect(input).toHaveAttribute('type', 'text')
  })

  it('toggles confirm new password visibility', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordPage {...defaultProps} />)
    const input = screen.getByLabelText('Confirm new password')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show confirm new password/i }))
    expect(input).toHaveAttribute('type', 'text')
  })
})
