; ============================================================
;  AnCut HUB — instalador ÚNICO (interface Electron + motor Python)
; ============================================================
;  Por que Inno Setup e não NSIS: o motor Python pesa ~4,8 GB (torch + CUDA)
;  e o NSIS é 32-bit — ele falha em "failed creating mmap" acima de ~2 GB.
;  O Inno aguenta e já era usado pelo app Qt.
;
;  Resultado: UM app, UM atalho, UM desinstalador. Sem duplicata.
;
;  Pré-requisitos (nesta ordem):
;    1. cd "D:\FAAH\AnCut HUB"     -> PyInstaller build.spec   (gera dist\CorteCenas)
;    2. cd "D:\FAAH\AnCut HUB App" -> npm run build && npx electron-builder --dir
;                                     (gera release\<v>\win-unpacked)
;    3. ISCC.exe installer-unified.iss
; ============================================================

#define AppName        "AnCut HUB"
; Versão vem da linha de comando: ISCC /DAppVersion=1.10.1 installer-unified.iss
; O padrão só existe pra rodar sem argumento. Ficava fixo em 1.0.0, e por isso
; qualquer instalador construído depois saía carimbado com a versão errada.
#ifndef AppVersion
  #define AppVersion   "1.0.0"
#endif
#define AppPublisher   "FAAH"
#define AppExeName     "AnCut HUB.exe"
; AppId NOVO: este pacote substitui os dois anteriores.
#define AppId          "{{2E7A94C1-8D3F-4B60-9E15-A6C48F072B93}"

; Pastas de origem
; Sai da versão: era fixo em 1.0.0 e empacotaria uma interface velha em
; silêncio — o instalador construído hoje sairia com o app do mês passado.
#define UiDir      "release\" + AppVersion + "\win-unpacked"
#define EngineDir  "..\AnCut HUB\dist\CorteCenas"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\AnCut HUB
DefaultGroupName=AnCut HUB
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExeName}
DisableProgramGroupPage=yes
OutputDir=release
OutputBaseFilename=AnCut-HUB-{#AppVersion}-Completo
SetupIconFile=build\icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
RestartApplications=no
; ~5 GB descompactado: avisa antes em vez de falhar no meio.
ExtraDiskSpaceRequired=5368709120

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Interface Electron na raiz…
Source: "{#UiDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; …e o motor Python em engine\. O app procura o backend nesta subpasta
; (ver resolveBackend em src/main/services/python-service.ts).
Source: "{#EngineDir}\*"; DestDir: "{app}\engine"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AnCut HUB";              Filename: "{app}\{#AppExeName}"
Name: "{group}\Desinstalar AnCut HUB";  Filename: "{uninstallexe}"
Name: "{autodesktop}\AnCut HUB";        Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
; runasoriginaluser: o instalador roda elevado, mas o app deve abrir com os
; privilégios normais do usuário — elevado, o Windows bloqueia o
; arrastar-e-soltar vindo do Explorer (UIPI).
Filename: "{app}\{#AppExeName}"; Description: "Abrir AnCut HUB"; Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallDelete]
Type: filesandordirs; Name: "{app}\engine"
; O cache, as referências e os clipes do usuário NÃO são tocados: vivem em
; %LOCALAPPDATA%\CorteCenas e na pasta de saída escolhida por ele.
