# App do motoboy no iPhone

O app (`apps/motoboy`) é o mesmo do Android: Expo + expo-router. A configuração de iOS já está
no `app.json` (identificador `br.com.entregas.motoboy`, GPS em segundo plano, push, câmera) e os
perfis do `eas.json` servem às duas plataformas. Falta só o que depende da conta da Apple.

## Antes da conta da Apple: versão de navegador

Para testar ou demonstrar num iPhone sem o app instalado, use `https://entregas.tneemo.com/motoboy` adicionado
à Tela de Início (ver README). Funciona só com a tela acesa e o app aberto; para o motoboy na rua, o app nativo.

## Requisitos

- **Apple Developer Program**: US$ 99 por ano, em nome da empresa (CNPJ pede o número D-U-N-S, que
  é gratuito mas leva alguns dias) ou de pessoa física. Sem ele não existe build para iPhone de verdade.
- Conta Expo com acesso ao projeto `unktneemo/entregas-motoboy`.
- `npm install -g eas-cli` e `eas login`. Não precisa de Mac: o build roda nos servidores do Expo.

## 1. Credenciais (uma vez)

```bash
cd apps/motoboy
```

```bash
eas credentials -p ios
```

Entre com o Apple ID da conta de desenvolvedor e deixe o EAS criar e guardar o certificado de
distribuição, o perfil de provisionamento e a **chave de push (APNs)**. Com a chave APNs no EAS, o
Expo Push entrega as notificações no iPhone sem mudar nada na API (ela já aceita `plataforma: "ios"`).

## 2. Teste em aparelhos específicos (ad hoc)

Cada iPhone de teste precisa estar cadastrado pelo UDID:

```bash
eas device:create
```

Mande o link gerado para cada pessoa abrir no iPhone e instalar o perfil. Depois:

```bash
eas build -p ios --profile homologacao
```

O link do build instala o app direto nos aparelhos cadastrados (limite de 100 por ano na conta).
Use `--profile producao` para o mesmo build apontando para a produção.

## 3. TestFlight e App Store

```bash
eas build -p ios --profile producao-loja
```

```bash
eas submit -p ios --profile producao-loja
```

Na primeira vez o `eas submit` cria o app no App Store Connect. Depois adicione os testadores no
TestFlight (até 10 mil, sem cadastrar UDID). Para publicar na loja, a Apple revisa o app e vai
perguntar por que ele usa localização "Sempre": responda que o GPS só roda com o turno aberto, para a
central acompanhar as entregas, com indicador azul na tela e fim automático ao encerrar o turno.
O `buildNumber` sobe sozinho a cada build desse perfil (`autoIncrement`).

## O que muda no iPhone

- **"Sempre" é obrigatório para o GPS com a tela apagada.** O iOS primeiro oferece "Durante o uso";
  o app pede "Sempre" logo em seguida, mas o sistema pode mostrar essa segunda pergunta só depois.
  Sem "Sempre", o app avisa e leva às configurações.
- **Indicador azul** na barra de status enquanto o turno está aberto: é o equivalente à notificação
  fixa do Android.
- **O iOS pode suspender o app** se o celular ficar sem bateria, em modo de economia extrema ou se a
  pessoa fechar o app deslizando para cima. Nesse caso o GPS para até o app ser aberto de novo.
  Oriente os motoboys a não fecharem o app durante o turno.
- **Navegação**: os botões abrem o Google Maps e o Waze instalados; sem eles, o link abre no Safari.
  No iPhone aparece também o botão "Mapas" (Apple Maps).
- **Notificação** sem canal configurável: o som e a prioridade seguem os ajustes do iPhone.

## O que testar no aparelho

1. Login, abrir turno e aceitar a permissão de localização "Sempre".
2. Bloquear a tela por 5 minutos andando: o motoboy precisa continuar se mexendo no mapa ao vivo.
3. Notificação de pedido novo com o app fechado; tocar nela abre o pedido.
4. Foto do comprovante pela câmera e envio.
5. Botões do Google Maps, Waze e Mapas.
6. Encerrar turno: o indicador azul some e o motoboy sai do mapa.
