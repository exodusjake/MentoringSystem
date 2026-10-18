-- Adds a dedicated settings password to SystemSettings.
-- Stored as plaintext on first insert; the backend hashes it on first verification.
-- Default password: FAITH2026!
-- Change it from the Admin Settings page after first login.

MERGE SystemSettings WITH (HOLDLOCK) AS target
USING (SELECT 'SettingsPassword' AS SettingKey, 'FAITH2026!' AS SettingValue) AS source
ON target.SettingKey = source.SettingKey
WHEN NOT MATCHED THEN
    INSERT (SettingKey, SettingValue) VALUES (source.SettingKey, source.SettingValue);
GO
