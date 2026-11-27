
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { hashPassword, verifyPassword } from '../../utils/auth'
import { jwtAuth, type AdminVariables } from '../../middleware/jwt-auth'
import type { Bindings } from '../../types'
import type { DbAdminUser } from '../../types/db'

type AuthEnv = {
  Bindings: Bindings
  Variables: AdminVariables
}

const authRoutes = new Hono<AuthEnv>()

/**
 * POST /auth/register-first
 * Chỉ tạo tài khoản quản trị viên đầu tiên.
 * Yêu cầu ADMIN_SETUP_SECRET và chỉ hoạt động khi chưa có admin.
 */
authRoutes.post('/register-first', async (c) => {
  const setupSecret = c.env.ADMIN_SETUP_SECRET
  const suppliedSecret = c.req.header('X-Admin-Setup-Secret')

  if (!setupSecret || !suppliedSecret || suppliedSecret !== setupSecret) {
    return c.json(
      { success: false, data: null, error: 'Unauthorized' },
      401
    )
  }

  let body: {
    username?: string
    password?: string
    display_name?: string
  }

  try {
    body = await c.req.json()
  } catch {
    return c.json(
      { success: false, data: null, error: 'Invalid request body' },
      400
    )
  }

  const username = body.username?.trim()
  const password = body.password
  const displayName = body.display_name?.trim() || null

  if (
    !username ||
    !/^[a-zA-Z0-9_-]{3,32}$/.test(username) ||
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  ) {
    return c.json(
      {
        success: false,
        data: null,
        error: 'Username must be 3-32 characters and password must be 12-128 characters',
      },
      400
    )
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM admin_users LIMIT 1'
  ).first()

  if (existing) {
    return c.json(
      {
        success: false,
        data: null,
        error: 'An administrator account already exists',
      },
      409
    )
  }

  const passwordHash = await hashPassword(password)

  // Single conditional INSERT prevents a second initial account
  // if two setup requests arrive at nearly the same time.
  const result = await c.env.DB.prepare(`
    INSERT INTO admin_users (username, password_hash, display_name)
    SELECT ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM admin_users)
  `).bind(username, passwordHash, displayName).run()

  if (!result.success || result.meta.changes !== 1) {
    return c.json(
      {
        success: false,
        data: null,
        error: 'Account creation failed. An administrator may already exist.',
      },
      409
    )
  }

  return c.json({
    success: true,
    data: {
      username,
      display_name: displayName,
    },
    error: null,
  }, 201)
})

/**
 * POST /auth/login
 * Validate credentials, check lockout, create JWT (24h).
 */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>()

  if (!body.username || !body.password) {
    return c.json(
      { success: false, data: null, error: 'Username and password are required' },
      400
    )
  }

  const { username, password } = body

  const admin = await c.env.DB.prepare(
    'SELECT * FROM admin_users WHERE username = ?'
  ).bind(username).first<DbAdminUser>()

  if (!admin) {
    return c.json(
      { success: false, data: null, error: 'Invalid credentials' },
      401
    )
  }

  const now = new Date()

  if (admin.locked_until) {
    const lockedUntil = new Date(admin.locked_until)

    if (now < lockedUntil) {
      return c.json(
        { success: false, data: null, error: 'Account locked. Try again later.' },
        403
      )
    }

    await c.env.DB.prepare(
      'UPDATE admin_users SET locked_until = NULL, failed_login_count = 0 WHERE id = ?'
    ).bind(admin.id).run()

    admin.failed_login_count = 0
    admin.locked_until = null
  }

  const passwordValid = await verifyPassword(password, admin.password_hash)

  if (!passwordValid) {
    const newFailCount = admin.failed_login_count + 1

    if (newFailCount >= 5) {
      const lockedUntil = new Date(
        now.getTime() + 30 * 60 * 1000
      ).toISOString()

      await c.env.DB.prepare(
        'UPDATE admin_users SET failed_login_count = ?, locked_until = ? WHERE id = ?'
      ).bind(newFailCount, lockedUntil, admin.id).run()

      return c.json(
        { success: false, data: null, error: 'Account locked. Try again later.' },
        403
      )
    }

    await c.env.DB.prepare(
      'UPDATE admin_users SET failed_login_count = ? WHERE id = ?'
    ).bind(newFailCount, admin.id).run()

    return c.json(
      { success: false, data: null, error: 'Invalid credentials' },
      401
    )
  }

  const nowIso = now.toISOString()

  await c.env.DB.prepare(
    'UPDATE admin_users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?'
  ).bind(nowIso, admin.id).run()

  const secret = new TextEncoder().encode(c.env.JWT_SECRET)

  const token = await new SignJWT({
    sub: String(admin.id),
    username: admin.username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret)

  return c.json({
    success: true,
    data: {
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        display_name: admin.display_name,
        last_login_at: nowIso,
      },
    },
    error: null,
  })
})

/**
 * POST /auth/refresh
 * Requires valid JWT. Issues new JWT with fresh 24h expiry.
 */
authRoutes.post('/refresh', jwtAuth, async (c) => {
  const adminId = c.get('adminId')
  const adminUsername = c.get('adminUsername')

  const secret = new TextEncoder().encode(c.env.JWT_SECRET)

  const token = await new SignJWT({
    sub: String(adminId),
    username: adminUsername,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret)

  return c.json({
    success: true,
    data: { token },
    error: null,
  })
})

/**
 * GET /auth/me
 * Requires valid JWT. Returns admin info.
 */
authRoutes.get('/me', jwtAuth, async (c) => {
  const adminId = c.get('adminId')

  const admin = await c.env.DB.prepare(
    'SELECT id, username, display_name, last_login_at FROM admin_users WHERE id = ?'
  ).bind(adminId).first<
    Pick<DbAdminUser, 'id' | 'username' | 'display_name' | 'last_login_at'>
  >()

  if (!admin) {
    return c.json(
      { success: false, data: null, error: 'Admin not found' },
      404
    )
  }

  return c.json({
    success: true,
    data: {
      id: admin.id,
      username: admin.username,
      display_name: admin.display_name,
      last_login_at: admin.last_login_at,
    },
    error: null,
  })
})

export { authRoutes }
