// Foto do comprovante: abre a câmera, reduz para no máximo 1280 px e envia como JPEG.

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { FotoResposta, TipoFoto } from '@entregas/shared';
import { api } from './api.ts';

/** Devolve o endereço local da foto tirada, ou null se a pessoa cancelar. */
export async function tirarFoto(): Promise<string | null> {
  const permissao = await ImagePicker.requestCameraPermissionsAsync();
  if (!permissao.granted) throw new Error('Permita o uso da câmera para fotografar o comprovante.');
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (r.canceled || !r.assets[0]) return null;

  const contexto = ImageManipulator.manipulate(r.assets[0].uri);
  if ((r.assets[0].width ?? 0) > 1280) contexto.resize({ width: 1280 });
  const imagem = await contexto.renderAsync();
  const salva = await imagem.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });
  return salva.uri;
}

export async function enviarFoto(empresaId: string, pedidoId: string, uri: string, tipo: TipoFoto) {
  const bytes = await (await fetch(uri)).blob();
  return api<FotoResposta>(`/empresas/${empresaId}/pedidos/${pedidoId}/fotos?tipo=${tipo}`, {
    metodo: 'POST',
    bytes,
    tipoConteudo: 'image/jpeg',
  });
}
