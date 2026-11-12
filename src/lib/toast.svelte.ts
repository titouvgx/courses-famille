// Store de toasts — notifications éphémères
// Usage : toast.success('Sauvegardé !') ou toast.error('Oups')

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

let nextId = 0

class ToastStore {
  items = $state<Toast[]>([])

  private add(message: string, type: Toast['type'], duration = 3000) {
    const id = nextId++
    this.items = [...this.items, { id, message, type }]

    setTimeout(() => {
      this.items = this.items.filter((t) => t.id !== id)
    }, duration)
  }

  success(message: string) {
    this.add(message, 'success')
  }

  error(message: string) {
    this.add(message, 'error', 4000)
  }

  info(message: string) {
    this.add(message, 'info')
  }
}

export const toast = new ToastStore()
