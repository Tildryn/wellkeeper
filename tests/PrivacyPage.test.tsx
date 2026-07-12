import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PrivacyPage from '@/PrivacyPage'

describe('PrivacyPage', () => {
  it('renders the Privacy Policy heading', () => {
    render(<PrivacyPage onBack={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument()
  })

  it('shows the last updated date', () => {
    render(<PrivacyPage onBack={vi.fn()} />)
    expect(screen.getByText(/july 2026/i)).toBeInTheDocument()
  })

  it('renders key section headings', () => {
    render(<PrivacyPage onBack={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /who we are/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what data we hold/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /your rights under gdpr/i })).toBeInTheDocument()
  })

  it('calls onBack when the Back button is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<PrivacyPage onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: /back to login/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('has a Discord link', () => {
    render(<PrivacyPage onBack={vi.fn()} />)
    expect(screen.getByRole('link', { name: /discord server/i })).toBeInTheDocument()
  })
})
