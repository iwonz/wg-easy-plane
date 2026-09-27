UPDATE `nodes`
SET `status` = 'tls_error', `last_error_code` = 'TLS_ERROR'
WHERE `allow_insecure_tls` = 1;
--> statement-breakpoint
ALTER TABLE `nodes` DROP COLUMN `allow_insecure_tls`;
