import { Hono } from 'hono'
import type { Bindings } from '../../types'
import type { AdminVariables } from '../../middleware/jwt-auth'
import { jwtAuth } from '../../middleware/jwt-auth'
import {
  resolveBotToken,
  resolveTelegramSecretToken,
} from '../../services/telegram-config'

type WebhookEnv = {
  Bindings: Bindings
  Variables: AdminVariables
}

const telegramWebhookAdmin = new Hono<WebhookEnv>()

// This action changes the bot's live Telegram webhook; require an authenticated CMS admin.
telegramWebhookAdmin.use('/*', jwtAuth)

telegramWebhookAdmin.post('/register', async (c) => {
  const botToken = await resolveBotToken(c.env.DB, c.env)
  const secretToken = await resolveTelegramSecretToken(c.env.DB, c.env)

  if (!botToken || !secretToken) {
    return c.json({
      success: false,
      data: null,
      error: 'Telegram BOT_TOKEN or TELEGRAM_SECRET_TOKEN is not configured',
    }, 400)
  }

  const webhookUrl = new URL('/webhook/telegram', c.req.url).toString()

  try {
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secretToken,
        }),
      }
    )

    const result = await telegramResponse.json() as {
      ok?: boolean
      description?: string
    }

    if (!telegramResponse.ok || result.ok !== true) {
      return c.json({
        success: false,
        data: null,
        error: result.description || 'Telegram rejected the webhook registration',
      }, 502)
    }

    return c.json({
      success: true,
      data: { webhook_url: webhookUrl },
      error: null,
    })
  } catch {
    // Never return or log the Bot API URL because it contains the bot token.
    return c.json({
      success: false,
      data: null,
      error: 'Could not reach the Telegram Bot API',
    }, 502)
  }
})

export { telegramWebhookAdmin }
