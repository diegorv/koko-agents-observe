import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from './theme-provider'

function ModeProbe() {
  const { mode, theme } = useTheme()
  return (
    <span data-testid="probe">
      {mode}/{theme}
    </span>
  )
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <ModeProbe />
    </ThemeProvider>,
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults new visitors to the light theme', () => {
    renderProvider()

    expect(screen.getByTestId('probe')).toHaveTextContent('light/light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('app-theme')).toBe('light')
  })

  it('keeps a stored dark preference', () => {
    localStorage.setItem('app-theme', 'dark')

    renderProvider()

    expect(screen.getByTestId('probe')).toHaveTextContent('dark/dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
