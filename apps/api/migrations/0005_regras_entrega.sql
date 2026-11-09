ALTER TABLE `empresas` ADD `foto_entrega_obrigatoria` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `empresas` ADD `prazo_aceite_min` integer;--> statement-breakpoint
ALTER TABLE `pedidos` ADD `aceite_ate` integer;--> statement-breakpoint
CREATE INDEX `pedidos_aceite_ate_idx` ON `pedidos` (`aceite_ate`) WHERE aceite_ate IS NOT NULL;