import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: './schema.prisma',

  // Database URL for migrations (uses non-pooling connection)
  migrate: {
    datasourceUrl: process.env.POSTGRES_URL_NON_POOLING
  }
})
