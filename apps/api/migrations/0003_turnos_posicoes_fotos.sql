CREATE TABLE `fotos_pedido` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`pedido_id` text NOT NULL,
	`tipo` text NOT NULL,
	`chave` text NOT NULL,
	`tipo_conteudo` text NOT NULL,
	`tamanho_bytes` integer NOT NULL,
	`enviado_por` text NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enviado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fotos_pedido_idx` ON `fotos_pedido` (`pedido_id`);--> statement-breakpoint
CREATE TABLE `posicoes` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`turno_id` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`precisao_m` real,
	`velocidade_ms` real,
	`registrado_em` integer NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`turno_id`) REFERENCES `turnos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `posicoes_turno_idx` ON `posicoes` (`turno_id`,`registrado_em`);--> statement-breakpoint
CREATE INDEX `posicoes_registrado_idx` ON `posicoes` (`registrado_em`);--> statement-breakpoint
CREATE TABLE `turnos` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`vinculo_id` text NOT NULL,
	`usuario_id` text NOT NULL,
	`iniciado_em` integer NOT NULL,
	`encerrado_em` integer,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vinculo_id`) REFERENCES `vinculos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turnos_um_aberto_por_usuario` ON `turnos` (`usuario_id`) WHERE encerrado_em IS NULL;--> statement-breakpoint
CREATE INDEX `turnos_empresa_idx` ON `turnos` (`empresa_id`,`encerrado_em`);