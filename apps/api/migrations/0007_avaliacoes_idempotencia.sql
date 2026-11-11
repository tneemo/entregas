CREATE TABLE `avaliacoes` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`pedido_id` text NOT NULL,
	`nota` integer NOT NULL,
	`comentario` text,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `avaliacoes_pedido_unq` ON `avaliacoes` (`pedido_id`);--> statement-breakpoint
CREATE INDEX `avaliacoes_empresa_idx` ON `avaliacoes` (`empresa_id`,`criado_em`);--> statement-breakpoint
CREATE TABLE `idempotencia` (
	`usuario_id` text NOT NULL,
	`chave` text NOT NULL,
	`rota` text NOT NULL,
	`status` integer,
	`corpo` text,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	PRIMARY KEY(`usuario_id`, `chave`),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idempotencia_criado_idx` ON `idempotencia` (`criado_em`);--> statement-breakpoint
CREATE INDEX `pedidos_empresa_concluido_idx` ON `pedidos` (`empresa_id`,`concluido_em`);--> statement-breakpoint
CREATE INDEX `pedidos_empresa_criado_idx` ON `pedidos` (`empresa_id`,`criado_em`);