# AnCut HUB — interface

Front Electron do analisador de episódios de anime. Corta o episódio em shots,
identifica os personagens em cada um e organiza tudo em pastas por personagem.
Windows 10/11 x64, com auto-update e instalador unificado.

## Este repo é só a interface

O motor de análise vive em **outro repositório**: `E:\Projetos\ancut-hub-engine`
(Python + PySide6 + CLIP + YOLO). Ele é um fork do **Corte Cenas**, de Levi
Clementino, e o `CLAUDE.md` de lá manda **não alterar o motor de IA sem
necessidade**. Se o pedido for sobre detecção, matching ou pipeline, o trabalho é
lá — não aqui.

## Layout

| pasta | o que é |
|---|---|
| `src/main/` | processo main — `ipc/`, `services/`, `store/`, `windows/` |
| `src/preload/` | ponte para o renderer |
| `src/renderer/src/` | a UI |
| `src/shared/` | `channels.ts` (nomes dos canais IPC) e `types.ts` |

`src/shared/channels.ts` é o contrato com o motor e com o renderer. Canal novo
entra ali primeiro.

## Comandos

```bash
npm run dev          # app com recarga automática
npm run typecheck    # tsconfig.node + tsconfig.web
npm run build        # bundles
npm run dist:win     # instalador
npm run release      # scripts/release.mjs
```

Ambiente: Node 24, ffmpeg 9 no PATH. Ver `E:\Projetos\COMO-RODAR.md`.
