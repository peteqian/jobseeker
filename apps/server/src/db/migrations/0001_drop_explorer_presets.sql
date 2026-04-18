UPDATE `explorer_configs` SET `domains_json` = COALESCE((
  SELECT json_group_array(
    json_object(
      'domain', value,
      'enabled', json('true'),
      'jobLimit', 25,
      'freshness', 'week',
      'queries', json('[]')
    )
  )
  FROM json_each(`explorer_configs`.`domains_json`)
), '[]');
--> statement-breakpoint
ALTER TABLE `explorer_configs` DROP COLUMN `preset_ids_json`;
