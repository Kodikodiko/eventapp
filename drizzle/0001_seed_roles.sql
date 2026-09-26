-- Standardrollen (Spezifikation 2.1). Weitere Rollen können später über die Rollenverwaltung (8.2) hinzukommen.
INSERT INTO `roles` (`key`, `label`) VALUES ('attendee', '{"de":"Teilnehmer:in","en":"Attendee"}');--> statement-breakpoint
INSERT INTO `roles` (`key`, `label`) VALUES ('speaker', '{"de":"Speaker","en":"Speaker"}');--> statement-breakpoint
INSERT INTO `roles` (`key`, `label`) VALUES ('orga', '{"de":"Organisation","en":"Organizer"}');--> statement-breakpoint
INSERT INTO `roles` (`key`, `label`) VALUES ('sponsor', '{"de":"Sponsor","en":"Sponsor"}');
