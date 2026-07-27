<div align="center">

<img src="resources/icon.png" width="120" alt="Logo do AnCut HUB">

# AnCut HUB

**Analisador de episódios de anime pra Windows.**
Corta o episódio em shots, identifica os personagens em cada um e organiza tudo
em pastas por personagem — automático.

![Windows](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6)
![Electron](https://img.shields.io/badge/Electron-33-47848F)
![Python](https://img.shields.io/badge/Python-3.11-3776AB)
![GPU](https://img.shields.io/badge/GPU-NVIDIA%20CUDA%20(opcional)-76B900)

</div>

---

## Créditos

O AnCut HUB é um **fork do [Corte Cenas](https://github.com/leviclementino1-creator/corte-cenas)**,
criado pelo **Levi Clementino**. Todo o motor de análise — detecção de shots,
reconhecimento de personagem, pipeline de referências — nasceu do trabalho dele.

Este fork trocou a interface Qt por uma em Electron e mexeu no motor em alguns
pontos (aceleração por GPU no corte, limite de galeria na busca de personagens,
modo headless). O crédito da ideia e da engenharia original é do Levi.

## Como funciona

Duas metades que conversam por IPC:

```
Electron (interface)                Python (motor)
┌──────────────────────┐            ┌─────────────────────────┐
│ renderer  React+TS   │            │ app/headless.py         │
│    ↕ window.ancut    │            │   run · probe · parse   │
│ preload   ponte IPC  │  spawn +   │   recent · results      │
│    ↕ ipcMain         │ ─────────► │   shots · has-analysis  │
│ main      serviços   │ JSON-lines │                         │
└──────────────────────┘            └─────────────────────────┘
```

A requisição vai numa linha JSON pelo stdin; os eventos voltam em JSON-lines
pelo stdout. O stderr é log humano. Contrato em `src/shared/types.ts`, canais em
`src/shared/channels.ts`. O motor vive em
[ancut-hub-engine](https://github.com/faahpla/ancut-hub-engine).

**Mídia:** keyframes e clipes são servidos por um esquema próprio
`media://local/…`, restrito a pastas explicitamente liberadas. `file://` é
bloqueado pela CSP, e passar bytes por IPC impediria o seek do vídeo (precisa de
range requests).

## Atualização automática

O app se atualiza sozinho a partir do GitHub Releases. Ele consulta
`releases/latest/download/manifest.json` na abertura, avisa numa pílula no
cabeçalho e instala quando o usuário mandar.

O que viaja é **delta**, não o pacote inteiro:

| Parte | Tamanho | Frequência |
|---|---|---|
| `resources/app.asar` — a interface | ~3 MB | toda versão |
| `engine/CorteCenas.exe` — o código Python | ~45 MB | quando o motor muda |
| torch, CUDA, Chromium | ~5 GB | fica onde está |

**Por que não electron-updater:** ele só atualiza app instalado pelo NSIS dele,
e o AnCut é instalado por Inno Setup — o pacote completo tem 2,1 GB e o NSIS é
32-bit, incapaz de mapear payload acima de ~2 GB. Trocar de instalador criaria
uma segunda entrada em "Adicionar ou remover programas". De quebra, o updater
próprio atualiza as duas metades num passo só, o que o electron-updater não
faria de jeito nenhum.

### Publicar uma versão

```bash
npm run release -- 1.2.0 --notes "corrige o seek do preview"
```

Com mudança no motor Python (rode o PyInstaller antes):

```bash
npm run release -- 1.2.0 --notes "acelera a busca de personagens" --engine
```

Só a interface também sai pelo GitHub Actions: `git push origin v1.2.0`, ou o
botão *Run workflow* na aba Actions. O motor precisa sair daqui — PyInstaller
com torch/CUDA não cabe num runner.

> **Quando o Electron mudar de versão**, use `--full-ui`. O `app.asar` sozinho
> deixaria o Chromium velho rodando código novo.

## Rodar do código

```bash
npm install
node node_modules/electron/install.js   # o npm bloqueia postinstall nesta máquina
node node_modules/esbuild/install.js
npm run dev
```

Em dev o motor é resolvido no venv do projeto Python, então mexer no Python vale
na hora. `ANCUT_BACKEND` sobrescreve o caminho.

```bash
npm run typecheck     # node + web
npm run build
npm run dist:win      # empacota a interface
```

O instalador completo (interface + motor) sai do `installer-unified.iss` com o
Inno Setup, depois de `npm run build`, `electron-builder --win --dir` e o
PyInstaller do repositório do motor.

## Armadilhas já pagas

- **Thread bloqueada lendo stdin trava o carregamento de DLL nativa no Windows.**
  O processo congela sem erro, sem log, sem traceback. Não basta mover a thread
  pra depois dos imports — qualquer DLL carregada sob demanda (codec, NVENC)
  volta a travar. `_watch_stdin` **sonda** com `PeekNamedPipe` e só lê quando há
  dado; ela nunca pode ficar parada dentro de uma leitura.
- **NVENC de H.264 não codifica 10 bits.** Boa parte dos fansubs é 10-bit, e o
  fallback silencioso escondia isso: toda análise cortava na CPU. Precisa de
  `pix_fmt=yuv420p`.
- **`transform` é uma propriedade só.** Animação que define `scale()` apaga o
  `translate(-50%,-50%)` da centralização; com fill `both` o diálogo fica torto
  pra sempre. O keyframe `dialog-in` já inclui o translate.
- **`File.path` não existe desde o Electron 32.** Caminho de arquivo arrastado
  vem de `webUtils.getPathForFile`, exposto pelo preload.
- **App elevado perde o arrastar-e-soltar** (UIPI). Por isso o
  `apply-update.ps1` relança pelo `explorer.exe` em vez de `Start-Process`.
- **`useContentSize: true`** no BrowserWindow: no Windows, width/height medem a
  moldura, não o conteúdo.
- **Preload sem import pesado.** `channels.ts` não tem dependência nenhuma de
  propósito; tipos são apagados na compilação.
- **Visibilidade não pode depender de animação em JS.** Entrada de conteúdo é
  keyframe CSS; Framer Motion só em hover, drag e scale.

## Aviso

O instalador não é assinado. O SmartScreen bloqueia na primeira execução e
parece que "não instalou" — é em *Mais informações → Executar assim mesmo*.
Atualizações depois disso não passam pelo SmartScreen.
