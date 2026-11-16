'use client'

import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

export function AppFluentProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')
    const syncTheme = () => setIsDark(preference.matches)
    syncTheme()
    preference.addEventListener('change', syncTheme)
    return () => preference.removeEventListener('change', syncTheme)
  }, [])

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      {children}
    </FluentProvider>
  )
}
