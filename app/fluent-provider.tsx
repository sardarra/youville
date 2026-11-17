'use client'

import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components'
import { Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

export function AppFluentProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('youville.theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const nextIsDark = savedTheme ? savedTheme === 'dark' : prefersDark
    setIsDark(nextIsDark)
    document.documentElement.dataset.theme = nextIsDark ? 'dark' : 'light'
  }, [])

  const toggleTheme = () => {
    setIsDark((current) => {
      const nextIsDark = !current
      document.documentElement.dataset.theme = nextIsDark ? 'dark' : 'light'
      window.localStorage.setItem('youville.theme', nextIsDark ? 'dark' : 'light')
      return nextIsDark
    })
  }

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      {children}
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    </FluentProvider>
  )
}
