# Entregas Central (programa de computador)

Programa para Windows, macOS e Linux que abre o painel da central (`https://entregas.tneemo.com`) numa janela própria,
com ícone na barra de tarefas, uma instância só e avisos de pedido novo. Não tem cópia do painel dentro: toda
atualização publicada chega sozinha, sem reinstalar.

Fica fora dos workspaces do npm de propósito (o CI do monorepo não baixa o Electron).

## Rodar

```bash
cd desktop
```

```bash
npm install
```

```bash
npm start
```

Outros endereços:

```bash
npm run homologacao
```

```bash
ENTREGAS_URL=http://localhost:5173 npm start
```

## Gerar o instalador

No próprio sistema (Windows gera `.exe`, macOS gera `.dmg`, Linux gera `.AppImage`), sai em `desktop/dist`:

```bash
npm run instalador
```

Pelo GitHub, sem instalar nada: **Actions → Desktop → Run workflow**. Ao terminar, os três instaladores ficam em
**Artifacts** na página da execução (por 30 dias). Criar uma tag `desktop-v0.1.0` também dispara o build.

## Primeira abertura (sem assinatura de código)

O programa ainda não tem certificado de assinatura, então os sistemas avisam na primeira vez:

- **Windows (SmartScreen):** "O Windows protegeu o computador" → **Mais informações** → **Executar assim mesmo**.
- **macOS (Gatekeeper):** clique com o botão direito no app → **Abrir** → **Abrir**. Se aparecer "está danificado",
  rode `xattr -cr "/Applications/Entregas Central.app"` no Terminal.
- **Linux:** dê permissão de execução ao `.AppImage` (`chmod +x`) e abra.

Para sumir com esses avisos: certificado de assinatura de código no Windows e conta Apple Developer (assinatura +
notarização) no macOS.

## Segurança

- A página roda isolada (`contextIsolation`, `sandbox`, sem acesso ao Node).
- Só o próprio painel abre dentro da janela; WhatsApp, Google Maps, links de rastreio e qualquer outro endereço vão
  para o navegador padrão.
- Das permissões do navegador, só **notificação** é liberada. Câmera, microfone, localização etc. são negados.

## Pendências

- Ícone próprio: hoje usa o ícone padrão do Electron. Basta colocar `build/icon.png` (1024×1024) aqui em `desktop/`.
- Assinatura de código (ver acima) e atualização automática do próprio programa (o painel já se atualiza sozinho).
