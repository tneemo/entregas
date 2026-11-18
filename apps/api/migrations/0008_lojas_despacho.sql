CREATE TABLE `lojas` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`nome` text NOT NULL,
	`telefone` text,
	`endereco` text NOT NULL,
	`transbordo` integer DEFAULT true NOT NULL,
	`ativa` integer DEFAULT true NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`atualizado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lojas_empresa_idx` ON `lojas` (`empresa_id`,`nome`);--> statement-breakpoint
ALTER TABLE `empresas` ADD `modo_despacho` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `empresas` ADD `oferta_segundos` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `empresas` ADD `demonstracao` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pedidos` ADD `loja_id` text REFERENCES lojas(id);--> statement-breakpoint
ALTER TABLE `pedidos` ADD `oferta_automatica` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `vinculos` ADD `loja_id` text REFERENCES lojas(id);--> statement-breakpoint
CREATE INDEX `vinculos_loja_idx` ON `vinculos` (`loja_id`) WHERE loja_id IS NOT NULL;