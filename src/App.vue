<script setup>
import { computed, onMounted, ref } from 'vue'

const storageKey = 'little-list-tasks-v1'
const tasks = ref([])
const newTask = ref('')
const filter = ref('All')
const loading = ref(true)
const saving = ref(false)
const busyIds = ref(new Set())
const error = ref('')
const storageError = ref('')
const retryAction = ref(null)
const remaining = computed(() => tasks.value.filter(task => !task.completed).length)
const visibleTasks = computed(() => tasks.value.filter(task =>
  filter.value === 'All' || (filter.value === 'Completed' ? task.completed : !task.completed)))

async function request(path, options = {}) {
  const response = await fetch(`https://dummyjson.com${path}`, options)
  if (!response.ok) throw new Error('Request failed')
  return response.json()
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks.value))
    storageError.value = ''
  } catch {
    storageError.value = 'Browser storage is unavailable or full. Your changes may be lost after refresh.'
  }
}

function fail(message, action) {
  error.value = message
  retryAction.value = action
}

async function loadTasks() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/todos/user/1')
    if (!Array.isArray(data.todos)) throw new Error('Invalid task list')
    tasks.value = data.todos
    persist()
  } catch {
    fail('We couldn’t load your sample tasks. Check your connection and try again.', loadTasks)
  } finally {
    loading.value = false
  }
}

async function addTask() {
  const title = newTask.value.trim()
  if (!title || saving.value || loading.value) return
  saving.value = true
  error.value = ''
  try {
    await request('/todos/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo: title, completed: false, userId: 1 })
    })
    // DummyJSON returns a pretend server ID. Use our own ID to avoid collisions.
    tasks.value.push({ id: `local-${crypto.randomUUID()}`, todo: title, completed: false, local: true })
    newTask.value = ''
    persist()
  } catch {
    fail('We couldn’t add your task. Your text is still here; please try again.', addTask)
  } finally {
    saving.value = false
  }
}

async function changeTask(task, remove = false) {
  if (busyIds.value.has(task.id)) return
  busyIds.value.add(task.id)
  error.value = ''
  try {
    // Newly created tasks only exist in this browser, so skip the API for them.
    if (!task.local) {
      await request(`/todos/${task.id}`, remove ? { method: 'DELETE' } : {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed })
      })
    }
    if (remove) tasks.value = tasks.value.filter(item => item.id !== task.id)
    else task.completed = !task.completed
    persist()
  } catch {
    fail(`We couldn’t ${remove ? 'delete' : 'update'} that task. Please try again.`, () => changeTask(task, remove))
  } finally {
    busyIds.value.delete(task.id)
  }
}

function retry() {
  const action = retryAction.value
  error.value = ''
  action?.()
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) {
      const parsed = JSON.parse(saved)
      if (!Array.isArray(parsed) || !parsed.every(task => task && typeof task.todo === 'string' &&
        typeof task.completed === 'boolean' && (typeof task.id === 'number' ||
        (typeof task.id === 'string' && task.local === true)))) throw new Error('Invalid saved tasks')
      tasks.value = parsed
      loading.value = false
      return
    }
  } catch {
    storageError.value = 'Saved tasks could not be read. Loading fresh sample tasks.'
  }
  loadTasks()
})
</script>

<template>
  <main>
    <header>
      <span class="eyebrow">A LITTLE SPACE FOR YOUR DAY</span>
      <h1>Little List<span aria-hidden="true">.</span></h1>
      <p>One thing at a time. You’ve got this.</p>
    </header>

    <section class="card" aria-label="Your todo list" :aria-busy="loading">
      <form @submit.prevent="addTask">
        <label for="new-task">What’s on your list?</label>
        <div class="entry">
          <input id="new-task" v-model="newTask" placeholder="e.g. Take a walk outside" maxlength="500" :disabled="saving || loading" autocomplete="off">
          <button class="add" :disabled="!newTask.trim() || saving || loading">{{ saving ? 'Adding…' : '+ Add task' }}</button>
        </div>
      </form>

      <div v-if="error" class="notice error" role="alert">
        <p>{{ error }}</p><button @click="retry" :disabled="saving || loading || busyIds.size > 0">Try again</button>
      </div>
      <p v-if="storageError" class="notice" role="alert">{{ storageError }}</p>

      <div class="toolbar">
        <div class="filters" role="group" aria-label="Filter tasks">
          <button v-for="option in ['All', 'Active', 'Completed']" :key="option" :aria-pressed="filter === option" @click="filter = option">{{ option }}</button>
        </div>
        <span class="count" role="status">{{ remaining }} {{ remaining === 1 ? 'task' : 'tasks' }} left</span>
      </div>

      <p v-if="loading" class="empty" role="status">Loading your sample tasks…</p>
      <ul v-else-if="visibleTasks.length" class="tasks">
        <li v-for="task in visibleTasks" :key="task.id" :class="{ completed: task.completed, busy: busyIds.has(task.id) }">
          <button class="check" role="checkbox" :aria-checked="task.completed" :aria-label="`${task.completed ? 'Mark incomplete' : 'Complete'}: ${task.todo}`" :disabled="busyIds.has(task.id)" @click="changeTask(task)">{{ task.completed ? '✓' : '' }}</button>
          <span class="task-title">{{ task.todo }}</span>
          <button class="delete" :aria-label="`Delete: ${task.todo}`" :disabled="busyIds.has(task.id)" @click="changeTask(task, true)">×</button>
        </li>
      </ul>
      <div v-else class="empty">
        <span class="empty-icon" aria-hidden="true">✓</span>
        <p>{{ error ? 'Your tasks will appear here.' : filter === 'Completed' ? 'No completed tasks yet.' : filter === 'Active' ? 'All caught up. Enjoy a little breathing room.' : 'A fresh start. Add your first task above.' }}</p>
      </div>
      <footer class="card-footer">Small steps make a good day.</footer>
    </section>
    <p class="storage-note">Saved in this browser, on this device.<br>Sample tasks come from DummyJSON. Changes stay in your browser and don’t sync to the server or other devices. Clearing browser data removes your list.</p>
  </main>
</template>
