-- Link público de acompanhamento do pedido.
-- Ajustado à mão: o SQLite não aceita ADD COLUMN NOT NULL sem um padrão constante,
-- então a coluna nasce com '' e os pedidos que já existem ganham um token aleatório
-- antes do índice único. Pedidos novos recebem o token pela API.
ALTER TABLE `pedidos` ADD `token_rastreio` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `pedidos` SET `token_rastreio` = lower(hex(randomblob(16))) WHERE `token_rastreio` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `pedidos_token_rastreio_unq` ON `pedidos` (`token_rastreio`);
