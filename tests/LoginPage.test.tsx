import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import LoginPage from '@/LoginPage'
import { server } from './msw/server'

const defaultProps = {
  onLogin: vi.fn(),
  onRegister: vi.fn(),
  onPrivacy: vi.fn(),
  onForgotPassword: vi.fn(),
}

describe('LoginPage', () => {
  it('renders the email and password fields', () => {
    render(<LoginPage {...defaultProps} />)
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
  })

  it('renders the sign in button', () => {
    render(<LoginPage {...defaultProps} />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('toggles password visibility when the eye button is clicked', async () => {
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} />)
    const passwordInput = screen.getByLabelText(/^password$/i)
    expect(passwordInput).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: /hide password/i }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('calls onRegister with the current email and password when Register is clicked', async () => {
    const onRegister = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} onRegister={onRegister} />)
    await user.type(screen.getByLabelText(/^email$/i), 'user@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /register/i }))
    expect(onRegister).toHaveBeenCalledWith('user@example.com', 'secret')
  })

  it('calls onForgotPassword when Forgot password? is clicked', async () => {
    const onForgotPassword = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} onForgotPassword={onForgotPassword} />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(onForgotPassword).toHaveBeenCalled()
  })

  it('calls onPrivacy when Privacy Policy is clicked', async () => {
    const onPrivacy = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} onPrivacy={onPrivacy} />)
    await user.click(screen.getByRole('button', { name: /privacy policy/i }))
    expect(onPrivacy).toHaveBeenCalled()
  })

  it('calls onLogin with the token after successful sign in', async () => {
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} onLogin={onLogin} />)
    await user.type(screen.getByLabelText(/^email$/i), 'dm@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledWith('test-token'))
  })

  it('shows an error on 401', async () => {
    server.use(http.post('http://localhost:3001/login', () => HttpResponse.json({}, { status: 401 })))
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} />)
    await user.type(screen.getByLabelText(/^email$/i), 'bad@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i)
  })

  it('shows a server error message on 500', async () => {
    server.use(http.post('http://localhost:3001/login', () => HttpResponse.json({}, { status: 500 })))
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} />)
    await user.type(screen.getByLabelText(/^email$/i), 'dm@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/server error/i)
  })

  it('calls onLogin with access_token when the response uses that key', async () => {
    server.use(
      http.post('http://localhost:3001/login', () =>
        HttpResponse.json({ access_token: 'alt-token' })
      )
    )
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage {...defaultProps} onLogin={onLogin} />)
    await user.type(screen.getByLabelText(/^email$/i), 'dm@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledWith('alt-token'))
  })
})
