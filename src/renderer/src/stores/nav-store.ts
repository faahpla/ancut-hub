import { create } from 'zustand'

/**
 * Onde a pessoa está no app.
 *
 * Eram três abas no topo (Analisar, Biblioteca, Resultados), com Personagem,
 * Favoritos e Cenas escondidos como sub-abas da Biblioteca. Com o tanto que o
 * app faz hoje — e o que vem —, isso não cabia mais: a interface nova (11/2026)
 * tem um menu lateral, e cada coisa é uma página.
 *
 *   novo         Novo corte (a antiga Analisar) + a fila
 *   biblioteca   o acervo em capas; com `animePasta`, a página daquele anime
 *   episodio     as cenas de um episódio aberto (a antiga Resultados)
 *   personagens  todos os personagens, com rosto
 *   cenas        procurar cena por descrição
 *   favoritos    os clipes favoritados
 */
export type Pagina = 'novo' | 'biblioteca' | 'episodio' | 'personagens' | 'cenas' | 'favoritos'

interface NavState {
  pagina: Pagina
  /** Pasta do anime aberto dentro da Biblioteca (null = a grade de capas). */
  animePasta: string | null
  ir: (pagina: Pagina) => void
  abrirAnime: (pasta: string) => void
}

export const useNav = create<NavState>((set) => ({
  pagina: 'novo',
  animePasta: null,
  // Ir pra Biblioteca pelo menu volta pra grade: é o "início" dela.
  ir: (pagina) => set(pagina === 'biblioteca' ? { pagina, animePasta: null } : { pagina }),
  abrirAnime: (pasta) => set({ pagina: 'biblioteca', animePasta: pasta })
}))
