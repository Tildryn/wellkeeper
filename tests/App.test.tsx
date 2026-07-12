import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import App from '@/App'
import { server } from './msw/server'

describe('App — auth flow', () => {
  it('renders the login page when not authenticated', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /wellkeeper/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows main app and navbar after successful login', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/^email$/i), 'dm@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByRole('navigation')
    expect(screen.getByRole('button', { name: /online players/i })).toBeInTheDocument()
  })

  it('shows an error message on failed login (401)', async () => {
    server.use(
      http.post('http://localhost:3001/login', () =>
        HttpResponse.json({}, { status: 401 })
      )
    )
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/^email$/i), 'bad@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/invalid email or password/i)
  })

  it('shows an error message on server error (500)', async () => {
    server.use(
      http.post('http://localhost:3001/login', () =>
        HttpResponse.json({}, { status: 500 })
      )
    )
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/^email$/i), 'dm@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/server error/i)
  })

  it('navigates to the register page', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /register/i }))
    expect(screen.getByText(/create an account/i)).toBeInTheDocument()
  })

  it('navigates to forgot password page', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByText(/reset your password/i)).toBeInTheDocument()
  })
})

describe('App — online players page', () => {
  it('shows the player loaded from the API after login', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/^email$/i), 'dm@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByRole('navigation')
    expect(await screen.findByText('Adventurer')).toBeInTheDocument()
    expect(screen.getByText('Thorin')).toBeInTheDocument()
  })

  it('redirects to My CD Keys page if user has no DM key', async () => {
    server.use(
      http.get('http://localhost:3001/linked_cd_keys', () =>
        HttpResponse.json({ cd_keys: [{ public_cd_key: 'ABC-NON-DM', dm: false }] })
      )
    )
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText(/^email$/i), 'player@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByRole('navigation')
    expect(await screen.findByText(/link cd key/i)).toBeInTheDocument()
  })
})
