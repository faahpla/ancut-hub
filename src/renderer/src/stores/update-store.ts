import { create } from 'zustand'
import type { UpdateStatus } from '@shared/types'

/**
 * Espelho do estado de atualização que vive no processo principal.
 *
 * Ele é a fonte da verdade — aqui só refletimos, porque o download continua
 * mesmo com o diálogo fechado e o estado precisa sobreviver a isso.
 */
interface UpdateState {
  status: UpdateStatus | null
  /** O diálogo de detalhes está aberto? */
  open: boolean
  /** O usuário dispensou este aviso nesta sessão. */
  dismissed: boolean

  setOpen: (open: boolean) => void
  dismiss: () => void
  subscribe: () => () => void
  check: () => Promise<void>
  download: () => Promise<void>
  apply: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: null,
  open: false,
  dismissed: false,

  setOpen: (open) => set({ open }),
  dismiss: () => set({ dismissed: true, open: false }),

  subscribe: () => {
    void window.ancut.update.status().then((status) => set({ status }))
    return window.ancut.update.onEvent((status) => {
      // Chegou notícia de versão nova depois de dispensar: volta a avisar,
      // senão um "depois" mataria o aviso pro resto da sessão.
      const previous = get().status
      const changed = previous?.manifest?.version !== status.manifest?.version
      set(changed ? { status, dismissed: false } : { status })
    })
  },

  check: async () => set({ status: await window.ancut.update.check() }),
  download: async () => set({ status: await window.ancut.update.download() }),
  apply: async () => {
    await window.ancut.update.apply()
  }
}))
