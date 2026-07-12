import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import ForgotPasswordPage from '@/ForgotPasswordPage'
import { server } from './msw/server'

describe('ForgotPasswordPage', () => {
  it('renders the email field and submit button', () => {
    render(<ForgotPasswordPage onBack={vi.fn()} />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('shows "Reset your password" subtitle', () => {
    render(<ForgotPasswordPage onBack={vi.fn()} />)
    expect(screen.getByText(/reset your password/i)).toBeInTheDocument()
  })

  it('disables the submit button when the email field is empty', () => {
    render(<ForgotPasswordPage onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDisabled()
  })

  it('enables the submit button once an email is entered', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage onBack={vi.fn()} />)
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    expect(screen.getByRole('button', { name: /send reset link/i })).not.toBeDisabled()
  })

  it('calls onBack when Back to login is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<ForgotPasswordPage onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: /back to login/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows a success message after submitting a valid email', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage onBack={vi.fn()} />)
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/reset link sent/i)
  })

  it('hides the submit button after a successful submission', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage onBack={vi.fn()} />)
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: /send reset link/i })).not.toBeInTheDocument()
  })

  it('shows an error when the API returns a failure', async () => {
    server.use(
      http.post('http://localhost:3001/forgot_password', () =>
        HttpResponse.json({ error: 'No account found.' }, { status: 404 })
      )
    )
    const user = userEvent.setup()
    render(<ForgotPasswordPage onBack={vi.fn()} />)
    await user.type(screen.getByLabelText(/email address/i), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no account found/i)
  })
})
