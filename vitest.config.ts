import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true
  },
  resolve: {
    alias: {
      '@shared': '/home/user/webapp/src/shared'
    }
  }
})
