<template>
  <div class="chat-page">
    <div v-if="auth.isDemo" class="demo-banner">
      Demo household — chat uses sample spending data.
      <button type="button" class="demo-banner-link" @click="goSignIn">Sign in for your real data</button>.
    </div>

    <h2 class="page-title">Finance assistant</h2>
    <p class="page-lead">
      Ask about your spending, categories, pace, fixed charges, and living budget. Answers use your app data — not live bank feeds.
    </p>

    <div v-if="!chatEnabled && !loadingConfig" class="chat-setup card">
      <p class="chat-setup-title">Chat is not configured yet</p>
      <p class="chat-setup-text">
        Add your Gemini API key to the server environment as <code>GEMINI_API_KEY</code>, then restart the API.
      </p>
      <p class="chat-setup-text chat-setup-muted">
        Get a key at
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
        Never put the key in the Vue app — only in <code>.env</code> on the API server.
      </p>
    </div>

    <template v-else>
      <div ref="messagesEl" class="chat-messages card" role="log" aria-live="polite">
        <div v-if="!messages.length && !sending" class="chat-empty">
          Try: “Why did spending go up this cycle?” or “Which categories are largest?”
        </div>
        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="chat-bubble"
          :class="[
            msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--assistant',
            msg.streaming ? 'chat-bubble--streaming' : '',
          ]"
        >
          <span class="chat-bubble-label">{{ msg.role === "user" ? "You" : "Assistant" }}</span>
          <p class="chat-bubble-text">
            <template v-if="msg.content">{{ msg.content }}</template>
            <span v-else-if="msg.streaming" class="chat-thinking">Thinking</span>
            <span v-if="msg.streaming" class="chat-cursor" aria-hidden="true" />
          </p>
        </div>
      </div>

      <p v-if="error" class="chat-error">{{ error }}</p>

      <form class="chat-form" @submit.prevent="send">
        <textarea
          v-model="draft"
          class="chat-input"
          rows="3"
          placeholder="Ask about your finances…"
          :disabled="sending || !chatEnabled"
          @keydown.enter.exact.prevent="send"
        />
        <div class="chat-form-actions">
          <button type="button" class="btn" :disabled="!messages.length || sending" @click="clearChat">
            Clear
          </button>
          <button type="submit" class="btn btn-primary" :disabled="!draft.trim() || sending || !chatEnabled">
            Send
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { fetchAppConfig, streamFinanceChat, type ChatMessage } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { goToSignIn } from "../utils/signIn";

const auth = useAuthStore();
const messages = ref<ChatMessage[]>([]);
const draft = ref("");
const sending = ref(false);
const error = ref("");
const chatEnabled = ref(true);
const loadingConfig = ref(true);
const messagesEl = ref<HTMLElement | null>(null);

function goSignIn() {
  goToSignIn();
}

async function scrollToBottom() {
  await nextTick();
  const el = messagesEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value || !chatEnabled.value) return;

  error.value = "";
  messages.value.push({ role: "user", content: text });
  const history = messages.value.slice(0, -1);
  draft.value = "";
  sending.value = true;

  const assistantIndex = messages.value.length;
  messages.value.push({ role: "assistant", content: "", streaming: true });
  await scrollToBottom();

  try {
    await streamFinanceChat(
      text,
      history,
      auth.isDemo,
      (chunk) => {
        messages.value[assistantIndex].content += chunk;
        void scrollToBottom();
      },
      auth.token || undefined,
    );
    messages.value[assistantIndex].streaming = false;
    if (!messages.value[assistantIndex].content.trim()) {
      messages.value[assistantIndex].content = "No response.";
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Chat failed";
    messages.value.splice(assistantIndex, 1);
    messages.value.pop();
    draft.value = text;
  } finally {
    sending.value = false;
    await scrollToBottom();
  }
}

function clearChat() {
  messages.value = [];
  error.value = "";
}

onMounted(async () => {
  try {
    const config = await fetchAppConfig(auth.token || undefined);
    chatEnabled.value = config.chat_enabled !== false;
  } catch {
    chatEnabled.value = false;
  } finally {
    loadingConfig.value = false;
  }
});
</script>

<style scoped>
.chat-page {
  max-width: 42rem;
}

.chat-setup-title {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.chat-setup-text {
  margin: 0 0 0.75rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.chat-setup-muted {
  font-size: 0.88rem;
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: min(28rem, 55vh);
  overflow-y: auto;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
}

.chat-empty {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.chat-bubble {
  border-radius: 0.75rem;
  padding: 0.65rem 0.85rem;
}

.chat-bubble--user {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  align-self: flex-end;
  max-width: 92%;
}

.chat-bubble--assistant {
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  align-self: flex-start;
  max-width: 92%;
}

.chat-bubble--streaming {
  opacity: 0.98;
}

.chat-bubble-label {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-faint);
  margin-bottom: 0.25rem;
}

.chat-bubble-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.45;
}

.chat-thinking {
  color: var(--text-muted);
}

.chat-thinking::after {
  content: "…";
}

.chat-cursor {
  display: inline-block;
  width: 0.55rem;
  height: 1em;
  margin-left: 0.1rem;
  vertical-align: text-bottom;
  background: currentColor;
  opacity: 0.75;
  animation: chat-cursor-blink 1s steps(1) infinite;
}

@keyframes chat-cursor-blink {
  0%,
  49% {
    opacity: 0.75;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.chat-error {
  color: var(--danger, #dc2626);
  font-size: 0.88rem;
  margin: 0 0 0.75rem;
}

.chat-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chat-input {
  width: 100%;
  resize: vertical;
  min-height: 4.5rem;
  border-radius: 0.65rem;
  border: 1px solid color-mix(in srgb, var(--text-muted) 25%, transparent);
  background: var(--surface, transparent);
  color: inherit;
  padding: 0.65rem 0.75rem;
  font: inherit;
}

.chat-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
