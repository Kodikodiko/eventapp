-- Newsletter entfällt (Wunsch 14.11.2026): gespeicherte Newsletter-Einwilligungen löschen
DELETE FROM `consents` WHERE `kind` = 'newsletter';
