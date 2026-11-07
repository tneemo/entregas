CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`nome` text NOT NULL,
	`telefone` text NOT NULL,
	`endereco` text,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`atualizado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_empresa_telefone_unq` ON `clientes` (`empresa_id`,`telefone`);--> statement-breakpoint
CREATE TABLE `eventos_pedido` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`pedido_id` text NOT NULL,
	`acao` text NOT NULL,
	`de` text,
	`para` text NOT NULL,
	`usuario_id` text NOT NULL,
	`papel` text NOT NULL,
	`motivo` text,
	`detalhe` text,
	`latitude` real,
	`longitude` real,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `eventos_pedido_idx` ON `eventos_pedido` (`pedido_id`,`criado_em`);--> statement-breakpoint
CREATE TABLE `paradas` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`pedido_id` text NOT NULL,
	`ordem` integer NOT NULL,
	`tipo` text NOT NULL,
	`nome` text,
	`telefone` text,
	`endereco` text NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paradas_pedido_ordem_unq` ON `paradas` (`pedido_id`,`ordem`);--> statement-breakpoint
CREATE TABLE `pedidos` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`numero` integer NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`motoboy_vinculo_id` text,
	`cliente_id` text,
	`forma_pagamento` text NOT NULL,
	`valor_a_cobrar_centavos` integer NOT NULL,
	`troco_para_centavos` integer,
	`taxa_entrega_centavos` integer DEFAULT 0 NOT NULL,
	`observacoes` text,
	`codigo_entrega` text NOT NULL,
	`tentativas_codigo` integer DEFAULT 0 NOT NULL,
	`motivo` text,
	`criado_por` text NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`atualizado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`concluido_em` integer,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`motoboy_vinculo_id`) REFERENCES `vinculos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pedidos_empresa_numero_unq` ON `pedidos` (`empresa_id`,`numero`);--> statement-breakpoint
CREATE INDEX `pedidos_empresa_status_idx` ON `pedidos` (`empresa_id`,`status`);--> statement-breakpoint
CREATE INDEX `pedidos_motoboy_status_idx` ON `pedidos` (`motoboy_vinculo_id`,`status`);--> statement-breakpoint
ALTER TABLE `empresas` ADD `endereco` text;