-- Standard-Kostengruppen als Vorlage und als eigene Kostengruppen für alle bestehenden Events
INSERT INTO `cost_group_templates` (`name`, `speaker_link`, `sort_order`) VALUES
  ('Speaker', 1, 1),
  ('Raum', 0, 2),
  ('Marketing', 0, 3),
  ('Catering', 0, 4),
  ('Sonstiges', 0, 5);
--> statement-breakpoint
INSERT INTO `event_cost_groups` (`event_id`, `template_id`, `name`, `speaker_link`, `sort_order`)
  SELECT e.`id`, t.`id`, t.`name`, t.`speaker_link`, t.`sort_order`
    FROM `events` e CROSS JOIN `cost_group_templates` t
   ORDER BY e.`id`, t.`sort_order`;
