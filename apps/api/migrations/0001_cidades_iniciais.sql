-- Cidade do piloto. Exigências federais de motofrete; as municipais de Cascavel
-- ainda precisam ser confirmadas com o Transitar.
INSERT INTO `cidades` (`id`, `nome`, `uf`, `codigo_ibge`, `regras_documentos`)
VALUES (
  'ibge-4104808',
  'Cascavel',
  'PR',
  '4104808',
  '{"exigencias":[{"codigo":"idade_21","descricao":"Idade mínima de 21 anos","base":"Lei 12.009/2009"},{"codigo":"cnh_a_2_anos","descricao":"CNH categoria A há pelo menos 2 anos","base":"Lei 12.009/2009"},{"codigo":"curso_motofrete","descricao":"Curso especializado de motofrete (30h)","base":"Resolução Contran 410/2012"},{"codigo":"placa_aluguel","descricao":"Motocicleta na categoria aluguel (placa vermelha)","base":"Lei 12.009/2009"},{"codigo":"colete","descricao":"Colete de segurança com dispositivos retrorrefletivos","base":"Lei 12.009/2009"}],"pendencia":"Confirmar exigências municipais com o Transitar"}'
);
