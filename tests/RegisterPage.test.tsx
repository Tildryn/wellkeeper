import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import RegisterPage from '@/RegisterPage'
import { server } from './msw/server'

const defaultProps = {
  onBack: vi.fn(),
  onRegistered: vi.fn(),
  onPrivacy: vi.fn(),
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { email?: string; displayName?: string; password?: string; confirm?: string } = {}
) {
  const { email = 'new@example.com', displayName = 'New User', password = 'pass123', confirm = 'pass123' } = overrides
  await user.type(screen.getByLabelText(/^email$/i), email)
  await user.type(screen.getByLabelText(/display name/i), displayName)
  await user.type(screen.getByLabelText(/^password$/i), password)
  await user.type(screen.getByLabelText(/^confirm password$/i), confirm)
  await user.click(screen.getByRole('button', { name: /create account/i }))
}

describe('RegisterPage', () => {
  it('renders all required fields', () => {
    render(<RegisterPage {...defaultProps} />)
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
  })

  it('pre-populates email from the initialEmail prop', () => {
    render(<RegisterPage {...defaultProps} initialEmail="prefill@example.com" />)
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('prefill@example.com')
  })

  it('pre-populates password from the initialPassword prop', () => {
    render(<RegisterPage {...defaultProps} initialPassword="prefilled" />)
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('prefilled')
  })

  it('shows a client-side error when passwords do not match', async () => {
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} />)
    await fillAndSubmit(user, { password: 'pass123', confirm: 'different' })
    expect(screen.getByRole('alert')).toHaveTextContent(/passwords do not match/i)
  })

  it('calls onBack when Sign in is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('calls onPrivacy when Privacy Policy is clicked', async () => {
    const onPrivacy = vi.fn()
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} onPrivacy={onPrivacy} />)
    await user.click(screen.getByRole('button', { name: /privacy policy/i }))
    expect(onPrivacy).toHaveBeenCalled()
  })

  it('shows a success message after successful registration', async () => {
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} />)
    await fillAndSubmit(user)
    expect(await screen.findByRole('status')).toHaveTextContent(/account created/i)
  })

  it('calls onRegistered after the redirect delay', async () => {
    const user = userEvent.setup()
    const onRegistered = vi.fn()
    render(<RegisterPage {...defaultProps} onRegistered={onRegistered} />)
    await fillAndSubmit(user)
    await screen.findByRole('status')
    await vi.waitFor(() => expect(onRegistered).toHaveBeenCalled(), { timeout: 3000 })
  })

  it('shows a 409 error from the server', async () => {
    server.use(
      http.post('http://localhost:3001/register', () =>
        HttpResponse.json({}, { status: 409 })
      )
    )
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} />)
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i)
  })

  it('shows a generic server error on 500', async () => {
    server.use(
      http.post('http://localhost:3001/register', () =>
        HttpResponse.json({}, { status: 500 })
      )
    )
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} />)
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/server error/i)
  })

  it('toggles password visibility when the eye button is clicked', async () => {
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} />)
    const passwordInput = screen.getByLabelText(/^password$/i)
    expect(passwordInput).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('toggles confirm password visibility when the eye button is clicked', async () => {
    const user = userEvent.setup()
    render(<RegisterPage {...defaultProps} />)
    const confirmInput = screen.getByLabelText('Confirm Password')
    expect(confirmInput).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show confirm password/i }))
    expect(confirmInput).toHaveAttribute('type', 'text')
  })
})
