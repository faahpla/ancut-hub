import { create } from 'zustand'
import type { HarvestDone } from '@shared/types'

/**
 * Reforço de refs disparado sozinho, no fim de um Modo Descoberta.
 *
 * O "Reforçar refs" sempre existiu como botão na aba Resultados — e ficava
 * esquecido, que foi o pedido: "assim eu lembro de reforçar essa merda". Ele
 * passou a ser uma caixa marcada na tela de batismo, que é a hora em que a
 * pessoa acabou de conferir quem é quem.
 *
 * Mora num store, e não num componente, por dois motivos: o reforço continua
 * rodando se a pessoa trocar de aba, e a fila de descoberta precisa ESPERAR
 * ele acabar antes de mandar o próximo episódio — reforço e análise abrem
 * cada um o seu motor, e dois motores carregando modelo na mesma placa ao
 * mesmo tempo é pedir pra os dois ficarem lentos.
 */
interface ReforcoState {
  /** Rótulo do episódio sendo reforçado ("Slime S04E24"). */
  rotulo: string
  rodando: boolean
  /** Personagem atual e posição — vazio enquanto os modelos carregam. */
  progresso: { nome: string; feitos: number; total: number } | null
  resultado: HarvestDone | null
  erro: string | null

  /** Roda e resolve quando acabar (com sucesso ou não). */
  rodar: (episodeId: number, rotulo: string) => Promise<void>
  dispensar: () => void
}

let assinado = false

export const useReforcoStore = create<ReforcoState>((set, get) => ({
  rotulo: '',
  rodando: false,
  progresso: null,
  resultado: null,
  erro: null,

  rodar: async (episodeId, rotulo) => {
    if (!assinado) {
      assinado = true
      // Uma assinatura pra vida inteira do app: o progresso do reforço chega
      // por evento, e o store não desmonta.
      window.ancut.results.onHarvestEvent((e) => {
        if (!get().rodando) return
        if (e.type === 'harvest-progress') {
          set({ progresso: { nome: e.name, feitos: e.done, total: e.total } })
        } else if (e.type === 'failed') {
          set({ erro: e.message })
        }
      })
    }
    set({ rotulo, rodando: true, progresso: null, resultado: null, erro: null })
    try {
      const r = await window.ancut.results.harvest(episodeId)
      if (r) set({ resultado: r })
      else if (!get().erro) set({ erro: 'O reforço não terminou.' })
    } catch (e) {
      set({ erro: e instanceof Error ? e.message : 'Falha no reforço.' })
    } finally {
      set({ rodando: false, progresso: null })
    }
  },

  dispensar: () => set({ rotulo: '', resultado: null, erro: null })
}))
