
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, setToken } from '@/api/client'
import Icon from '@/components/Icon.vue'

const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const showRegister = ref(false)
const setupSecret = ref('')
const newUsername = ref('')
const newPassword = ref('')
const displayName = ref('')
const registerMessage = ref('')
const registerLoading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    const res = await api.post<{ token: string }>('/auth/login', {
      username: username.value,
      password: password.value,
    })
    if (res.success && res.data) {
      setToken(res.data.token)
      router.push('/')
    } else {
      error.value = res.error || 'Đăng nhập thất bại'
    }
  } catch {
    error.value = 'Không thể kết nối máy chủ'
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  registerMessage.value = ''

  if (!setupSecret.value || !newUsername.value || !newPassword.value) {
    registerMessage.value = 'Vui lòng nhập đầy đủ thông tin'
    return
  }

  registerLoading.value = true
  try {
    const response = await fetch('/api/admin/auth/register-first', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Setup-Secret': setupSecret.value,
      },
      body: JSON.stringify({
        username: newUsername.value,
        password: newPassword.value,
        display_name: displayName.value || undefined,
      }),
    })

    const result = await response.json()

    if (response.ok && result.success) {
      registerMessage.value = 'Tạo tài khoản thành công. Bạn có thể đăng nhập.'
      showRegister.value = false
      username.value = newUsername.value
      password.value = ''
      setupSecret.value = ''
      newPassword.value = ''
    } else {
      registerMessage.value = result.error || 'Không thể tạo tài khoản'
    }
  } catch {
    registerMessage.value = 'Không thể kết nối máy chủ'
  } finally {
    registerLoading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4" style="background: var(--canvas)">
    <div
      class="pointer-events-none fixed inset-0"
      style="background: radial-gradient(600px circle at 50% 30%, rgba(17,17,17,0.025), transparent 70%)"
    />

    <div class="animate-in relative w-full max-w-[380px]">
      <div class="mb-8 flex flex-col items-center text-center">
        <div
          class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-white"
          style="background: var(--accent)"
        >
          <Icon name="store" :size="24" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight" style="color: var(--ink)">Shop Admin</h1>
        <p class="mt-1 text-[13px]" style="color: var(--muted)">Đăng nhập để quản trị hệ thống</p>
      </div>

      <form v-if="!showRegister" class="card p-7" @submit.prevent="handleLogin">
        <div
          v-if="error"
          class="mb-5 rounded-md px-3 py-2.5 text-[13px]"
          style="background: var(--red-bg); color: var(--red-fg)"
        >
          {{ error }}
        </div>

        <div class="space-y-4">
          <div>
            <label class="label" for="username">Tên đăng nhập</label>
            <input
              id="username"
              v-model="username"
              type="text"
              required
              autocomplete="username"
              class="field"
              placeholder="admin"
            />
          </div>
          <div>
            <label class="label" for="password">Mật khẩu</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="field"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button type="submit" :disabled="loading" class="btn btn-primary mt-6 w-full py-2.5">
          <Icon v-if="!loading" name="lock" :size="16" />
          {{ loading ? 'Đang đăng nhập…' : 'Đăng nhập' }}
        </button>

        <button
          type="button"
          class="btn mt-3 w-full py-2.5"
          @click="showRegister = true; error = ''; registerMessage = ''"
        >
          Tạo tài khoản quản trị viên đầu tiên
        </button>
      </form>

      <form v-else class="card p-7" @submit.prevent="handleRegister">
        <h2 class="mb-4 text-lg font-semibold" style="color: var(--ink)">
          Tạo tài khoản quản trị
        </h2>

        <div class="space-y-4">
          <div>
            <label class="label" for="setup-secret">Mã thiết lập</label>
            <input
              id="setup-secret"
              v-model="setupSecret"
              type="password"
              required
              autocomplete="off"
              class="field"
            />
          </div>
          <div>
            <label class="label" for="new-username">Tên đăng nhập</label>
            <input
              id="new-username"
              v-model="newUsername"
              type="text"
              required
              minlength="3"
              maxlength="32"
              autocomplete="username"
              class="field"
            />
          </div>
          <div>
            <label class="label" for="new-password">Mật khẩu (ít nhất 12 ký tự)</label>
            <input
              id="new-password"
              v-model="newPassword"
              type="password"
              required
              minlength="12"
              maxlength="128"
              autocomplete="new-password"
              class="field"
            />
          </div>
          <div>
            <label class="label" for="display-name">Tên hiển thị (không bắt buộc)</label>
            <input
              id="display-name"
              v-model="displayName"
              type="text"
              class="field"
            />
          </div>
        </div>

        <p
          v-if="registerMessage"
          class="mt-4 text-[13px]"
          style="color: var(--muted)"
        >
          {{ registerMessage }}
        </p>

        <button
          type="submit"
          :disabled="registerLoading"
          class="btn btn-primary mt-6 w-full py-2.5"
        >
          {{ registerLoading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản' }}
        </button>

        <button
          type="button"
          class="btn mt-3 w-full py-2.5"
          @click="showRegister = false; setupSecret = ''; newPassword = ''"
        >
          Quay lại đăng nhập
        </button>
      </form>

      <p class="mt-6 text-center text-[11px]" style="color: var(--faint)">
        Telegram Shop Bot · Cloudflare Workers
      </p>
    </div>
  </div>
</template>
