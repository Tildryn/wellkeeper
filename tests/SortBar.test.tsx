import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SortBar from '@/SortBar'

const defaultFields = [
  { key: 'name', label: 'Name' },
  { key: 'date', label: 'Date' },
]

describe('SortBar', () => {
  it('renders all provided fields', () => {
    render(<SortBar sortKey="name" sortDir="asc" onSort={vi.fn()} fields={defaultFields} />)
    expect(screen.getByRole('button', { name: /sort by name/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sort by date/i })).toBeInTheDocument()
  })

  it('marks the active field with aria-pressed=true', () => {
    render(<SortBar sortKey="name" sortDir="asc" onSort={vi.fn()} fields={defaultFields} />)
    expect(screen.getByRole('button', { name: /sort by name/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /sort by date/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows ascending arrow on active asc field', () => {
    render(<SortBar sortKey="name" sortDir="asc" onSort={vi.fn()} fields={defaultFields} />)
    const nameBtn = screen.getByRole('button', { name: /sort by name, ascending/i })
    expect(nameBtn).toBeInTheDocument()
    expect(nameBtn.textContent).toContain('↑')
  })

  it('shows descending arrow on active desc field', () => {
    render(<SortBar sortKey="name" sortDir="desc" onSort={vi.fn()} fields={defaultFields} />)
    const nameBtn = screen.getByRole('button', { name: /sort by name, descending/i })
    expect(nameBtn.textContent).toContain('↓')
  })

  it('calls onSort with the field key when a button is clicked', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    render(<SortBar sortKey="name" sortDir="asc" onSort={onSort} fields={defaultFields} />)
    await user.click(screen.getByRole('button', { name: /sort by date/i }))
    expect(onSort).toHaveBeenCalledWith('date')
  })

  it('calls onSort when clicking the already-active field', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    render(<SortBar sortKey="name" sortDir="asc" onSort={onSort} fields={defaultFields} />)
    await user.click(screen.getByRole('button', { name: /sort by name/i }))
    expect(onSort).toHaveBeenCalledWith('name')
  })
})
