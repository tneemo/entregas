CREATE TABLE `cidades` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`uf` text NOT NULL,
	`codigo_ibge` text NOT NULL,
	`regras_documentos` text,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cidades_codigo_ibge_unq` ON `cidades` (`codigo_ibge`);--> statement-breakpoint
CREATE TABLE `convites` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`papel` text NOT NULL,
	`nome_convidado` text,
	`criado_por` text NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`expira_em` integer NOT NULL,
	`aceito_em` integer,
	`aceito_por` text,
	`revogado_em` integer,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`aceito_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `convites_token_unq` ON `convites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `convites_empresa_idx` ON `convites` (`empresa_id`);--> statement-breakpoint
CREATE TABLE `empresas` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`razao_social` text NOT NULL,
	`nome_fantasia` text NOT NULL,
	`cnpj` text NOT NULL,
	`cidade_id` text NOT NULL,
	`telefone` text,
	`email` text,
	`status` text DEFAULT 'ativa' NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`atualizado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`cidade_id`) REFERENCES `cidades`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `empresas_cnpj_unq` ON `empresas` (`cnpj`);--> statement-breakpoint
CREATE TABLE `falhas_login` (
	`id` text PRIMARY KEY NOT NULL,
	`chave` text NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `falhas_login_chave_idx` ON `falhas_login` (`chave`,`criado_em`);--> statement-breakpoint
CREATE TABLE `sessoes` (
	`id` text PRIMARY KEY NOT NULL,
	`usuario_id` text NOT NULL,
	`user_agent` text,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`expira_em` integer NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessoes_usuario_idx` ON `sessoes` (`usuario_id`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`email` text,
	`telefone` text,
	`cpf` text,
	`senha_hash` text NOT NULL,
	`super_admin` integer DEFAULT false NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`atualizado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_email_unq` ON `usuarios` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_telefone_unq` ON `usuarios` (`telefone`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_cpf_unq` ON `usuarios` (`cpf`);--> statement-breakpoint
CREATE TABLE `vinculos` (
	`id` text PRIMARY KEY NOT NULL,
	`empresa_id` text NOT NULL,
	`usuario_id` text NOT NULL,
	`papel` text NOT NULL,
	`status` text DEFAULT 'ativo' NOT NULL,
	`tipo_vinculo` text,
	`criado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`atualizado_em` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vinculos_empresa_usuario_unq` ON `vinculos` (`empresa_id`,`usuario_id`);--> statement-breakpoint
CREATE INDEX `vinculos_usuario_idx` ON `vinculos` (`usuario_id`);