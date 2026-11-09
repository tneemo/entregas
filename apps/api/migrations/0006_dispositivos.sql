CREATE TABLE `dispositivos` (
	`token` text PRIMARY KEY NOT NULL,
	`sessao_id` text NOT NULL,
	`usuario_id` text NOT NULL,
	`plataforma` text NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`atualizado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`sessao_id`) REFERENCES `sessoes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dispositivos_usuario_idx` ON `dispositivos` (`usuario_id`);--> statement-breakpoint
CREATE INDEX `dispositivos_sessao_idx` ON `dispositivos` (`sessao_id`);