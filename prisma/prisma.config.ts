import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: './schema.prisma',

  // Main database URL (with connection pooling)
  datasourceUrl: process.env.POSTGRES_PRISMA_URL,

  // Direct URL for migrations (without pooling)
  migrate: {
    datasourceUrl: process.env.POSTGRES_URL_NON_POOLING
  }
})
