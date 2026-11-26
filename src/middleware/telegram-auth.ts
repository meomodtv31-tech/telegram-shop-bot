import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { resolveTelegramSecretToken } from '../services/telegram-config'

export const telegramAuth = createMiddleware<AppEnv>(async (c, next) => {
  const secretToken = c.req.header(
    'X-Telegram-Bot-Api-Secret-Token'
  )

  const expected = await resolveTelegramSecretToken(c.env.DB, c.env)

  console.log('[Telegram Auth Check]', {
    headerPresent: Boolean(secretToken),
    expectedPresent: Boolean(expected),
    matched: Boolean(secretToken && expected && secretToken === expected),
    headerLength: secretToken?.length ?? 0,
    expectedLength: expected.length,
    headerHasOuterWhitespace: secretToken !== secretToken?.trim(),
    expectedHasOuterWhitespace: expected !== expected.trim(),
    trimmedMatched: Boolean(
      secretToken && expected &&
      secretToken.trim() === expected.trim()
    ),
  })

  if (!secretToken || !expected || secretToken !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})
