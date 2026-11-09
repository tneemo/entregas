// Notificações de pedido no celular (Expo Push, entregue pelo Firebase no Android).
//
// - Canal "Pedidos" com prioridade máxima, som e vibração: o motoboy anda com o celular no bolso.
// - O celular é cadastrado na API preso à sessão: sair do app para os avisos sozinho.
// - Tocar na notificação abre o pedido; chegando com o app aberto, a lista atualiza na hora.
// - Sem Firebase configurado no build (ou na web), nada quebra: o app segue consultando a API.

import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { DadosDispositivo, DadosNotificacao } from '@entregas/shared';
import { api } from './api.ts';
import { cores } from './tema.ts';
import { Sentry } from './monitoramento.ts';

const CANAL = 'pedidos';

/** ativa: chega na hora; negada: a pessoa recusou a permissão; indisponivel: web ou build sem Firebase. */
export type SituacaoNotificacao = 'ativa' | 'negada' | 'indisponivel';

if (Platform.OS !== 'web') {
  // Com o app aberto, a notificação também aparece e toca.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Pede permissão, cria o canal e cadastra este celular na API. Chamado a cada login e abertura do app. */
export async function ativarNotificacoes(): Promise<SituacaoNotificacao> {
  if (Platform.OS === 'web') return 'indisponivel';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL, {
        name: 'Pedidos',
        description: 'Pedido novo, pedido retirado ou cancelado pela central.',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: cores.mercosul,
        sound: 'default',
        // Na tela bloqueada aparece só número do pedido e bairros (a API não manda mais que isso).
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return 'negada';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const corpo: DadosDispositivo = { token, plataforma: Platform.OS === 'ios' ? 'ios' : 'android' };
    await api('/auth/dispositivo', { metodo: 'POST', corpo });
    return 'ativa';
  } catch (erro) {
    // Ex.: build sem Firebase (google-services.json) ou sem internet agora.
    Sentry.captureException(erro);
    return 'indisponivel';
  }
}

function abrirPedido(resposta: Notifications.NotificationResponse | null | undefined) {
  if (!resposta || resposta.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const dados = resposta.notification.request.content.data as Partial<DadosNotificacao> | undefined;
  if (dados?.tipo === 'pedido' && dados.empresaId && dados.pedidoId) {
    router.push(`/${dados.empresaId}/${dados.pedidoId}`);
  }
}

function OuvirNotificacoesNativo() {
  const consultas = useQueryClient();
  // Inclui o toque que abriu o app fechado.
  const ultima = Notifications.useLastNotificationResponse();
  useEffect(() => abrirPedido(ultima), [ultima]);

  useEffect(() => {
    // Chegou com o app aberto: a lista de entregas e o pedido atualizam sem esperar a próxima consulta.
    const assinatura = Notifications.addNotificationReceivedListener((n) => {
      const dados = n.request.content.data as Partial<DadosNotificacao> | undefined;
      consultas.invalidateQueries({ queryKey: ['entregas'] });
      if (dados?.pedidoId) consultas.invalidateQueries({ queryKey: ['pedido', dados.empresaId, dados.pedidoId] });
    });
    return () => assinatura.remove();
  }, [consultas]);

  return null;
}

/** Fica dentro dos provedores do app (_layout.tsx). Na web não há notificação. */
export const OuvirNotificacoes = Platform.OS === 'web' ? () => null : OuvirNotificacoesNativo;
