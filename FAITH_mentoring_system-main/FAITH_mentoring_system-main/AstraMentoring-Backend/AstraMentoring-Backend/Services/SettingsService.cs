using BCrypt.Net;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class SettingsService
    {
        private readonly string _connectionString;

        public SettingsService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<Dictionary<string, string>> GetAllAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<SettingRow>(
                "SELECT SettingKey, SettingValue FROM SystemSettings");
            return rows.ToDictionary(r => r.SettingKey, r => r.SettingValue);
        }

        // Resolves the two Calendar Sheet signatory emails (calPreparedByEmail/
        // calApprovedByEmail, both plain SystemSettings values, same as the
        // Name/Title fields) to whatever real signature image that account
        // has on file — Users.SignatureFilePath, populated the same way for
        // every role (mandatory first-login setup for Admin/Head, Profile
        // page upload for Mentor/Mentee).
        //
        // Deliberately its own narrow lookup rather than widening
        // ESignatureController's GetAsync (which is intentionally self-only —
        // no account can view another's signature by ID). This endpoint
        // never accepts an arbitrary ID/email from the caller; it only ever
        // resolves the two specific emails the Admin already typed into
        // Settings, so it can't be used to probe anyone else's signature.
        public async Task<CalendarSignaturesDto> GetCalendarSignaturesAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<SettingRow>(
                "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('calPreparedByEmail','calApprovedByEmail')");
            var dict = rows.ToDictionary(r => r.SettingKey, r => r.SettingValue);

            async Task<string?> ResolveAsync(string? email)
            {
                if (string.IsNullOrWhiteSpace(email)) return null;
                return await conn.ExecuteScalarAsync<string?>(
                    "SELECT SignatureFilePath FROM Users WHERE LOWER(Email) = LOWER(@Email)",
                    new { Email = email.Trim() });
            }

            return new CalendarSignaturesDto
            {
                PreparedBySignature = await ResolveAsync(dict.GetValueOrDefault("calPreparedByEmail")),
                ApprovedBySignature = await ResolveAsync(dict.GetValueOrDefault("calApprovedByEmail")),
            };
        }

        public async Task<bool> VerifySettingsPasswordAsync(string password)
        {
            using var conn = new SqlConnection(_connectionString);
            var stored = await conn.QueryFirstOrDefaultAsync<string>(
                "SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'SettingsPassword'");
            if (stored == null) return false;
            stored = stored.Trim(); // tolerate padding/whitespace from manual DB edits

            // If not yet hashed (first use), hash and store it now
            if (!stored.StartsWith("$2"))
            {
                bool match = stored == password;
                if (match)
                {
                    var hashed = BCrypt.Net.BCrypt.HashPassword(stored);
                    await conn.ExecuteAsync(
                        "UPDATE SystemSettings SET SettingValue = @Hash WHERE SettingKey = 'SettingsPassword'",
                        new { Hash = hashed });
                }
                return match;
            }

            return BCrypt.Net.BCrypt.Verify(password, stored);
        }

        public async Task UpdateSettingsPasswordAsync(string newPassword)
        {
            var hash = BCrypt.Net.BCrypt.HashPassword(newPassword);
            await UpdateAsync("SettingsPassword", hash);
        }

        public static void ValidatePeriodTransition(string schoolYear, string semester, string? oldSchoolYear, string? oldSemester)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(schoolYear, @"^\d{4}-\d{4}$")
                || int.Parse(schoolYear.Substring(5)) != int.Parse(schoolYear.Substring(0, 4)) + 1)
                throw new ArgumentException("School year must be consecutive years in YYYY-YYYY format.");
            if (semester != "1st Semester" && semester != "2nd Semester")
                throw new ArgumentException("Only first and second semester policies are defined. Summer requires policy review.");
            if (!string.IsNullOrEmpty(oldSchoolYear))
            {
                var oldStart = ParseStartYear(oldSchoolYear);
                if (!oldStart.HasValue || int.Parse(schoolYear.Substring(0, 4)) < oldStart.Value
                    || (schoolYear == oldSchoolYear && oldSemester == "2nd Semester" && semester == "1st Semester"))
                    throw new ArgumentException("Backward or ambiguous period changes require review; use history filters instead.");
            }
        }

        public async Task<bool> UpdateAsync(string key, string value)
        {
            using var conn = new SqlConnection(_connectionString);

            // SchoolYear/Semester are special: User Management needs to answer
            // "who had an account during period X" for any PAST period, not
            // just whoever is active right now. Before the value actually
            // changes, snapshot every currently-Active account against the
            // OUTGOING period (see AccountPeriodHistory) — a no-op Save (same
            // value re-submitted) must not create a duplicate/empty snapshot.
            bool isForwardSchoolYearChange = false;
            if (key == "SchoolYear" || key == "Semester")
                isForwardSchoolYearChange = await SnapshotOutgoingPeriodIfChangedAsync(conn, key, value);

            await conn.ExecuteAsync(
                @"MERGE SystemSettings WITH (HOLDLOCK) AS target
                  USING (SELECT @Key AS SettingKey, @Value AS SettingValue) AS source
                  ON target.SettingKey = source.SettingKey
                  WHEN MATCHED THEN
                      UPDATE SET SettingValue = @Value, UpdatedAt = GETDATE()
                  WHEN NOT MATCHED THEN
                      INSERT (SettingKey, SettingValue, UpdatedAt) VALUES (@Key, @Value, GETDATE());",
                new { Key = key, Value = value });

            // A genuine FORWARD School Year change (not a Semester switch
            // within the same year — mentoring is a one-year commitment, so
            // that alone must never touch anyone's assignment — and not a
            // backward/corrective change either, e.g. Admin fixing a typo or
            // undoing a premature change: nothing has actually "ended" in
            // that case): every mentee's current mentor pairing ends. Same
            // UPDATE already used for reassignment (sp_AssignMentor) —
            // deactivate, never delete. Each mentee lands on the existing
            // "Unassigned" status (already distinct from Drop Out) until
            // next year's assignments are made.
            if (key == "SchoolYear" && isForwardSchoolYearChange)
                await conn.ExecuteAsync("UPDATE dbo.MentorMentee SET IsActive = 0 WHERE IsActive = 1;");

            return true;
        }

        // Returns true only if this was a genuine FORWARD SchoolYear change
        // (the new value's starting year is later than the old one) — the
        // signal the caller uses to decide whether to run the year-end
        // mentee reset above. A Semester-only change, a no-op resave, or a
        // backward/corrective SchoolYear change all return false.
        private async Task<bool> SnapshotOutgoingPeriodIfChangedAsync(SqlConnection conn, string changingKey, string newValue)
        {
            var rows = await conn.QueryAsync<SettingRow>(
                "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')");
            var dict = rows.ToDictionary(r => r.SettingKey, r => r.SettingValue);
            var oldSchoolYear = dict.TryGetValue("SchoolYear", out var sy) ? sy : null;
            var oldSemester   = dict.TryGetValue("Semester", out var sm) ? sm : null;

            // Nothing to snapshot yet (first-ever configuration), or this
            // Save didn't actually change the value it targets.
            if (string.IsNullOrEmpty(oldSchoolYear) || string.IsNullOrEmpty(oldSemester)) return false;
            var currentValueForChangingKey = changingKey == "SchoolYear" ? oldSchoolYear : oldSemester;
            if (currentValueForChangingKey == newValue) return false;

            // WasAssigned/WasDropOut capture each mentee's status at THIS
            // exact moment — before the year-end reset (if any) below runs
            // — so a past-period filter shows what was true then, not
            // whatever their status has become since.
            await conn.ExecuteAsync(@"
                INSERT INTO dbo.AccountPeriodHistory (UserID, SchoolYear, Semester, WasAssigned, WasDropOut)
                SELECT
                    u.UserID, @SchoolYear, @Semester,
                    CASE WHEN u.Role = 'Mentee' THEN
                        CASE WHEN EXISTS (
                            SELECT 1 FROM dbo.MentorMentee mm
                            WHERE mm.MenteeID = u.UserID AND mm.IsActive = 1
                        ) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
                    ELSE NULL END AS WasAssigned,
                    CASE WHEN u.Role = 'Mentee' THEN ISNULL(mep.IsDropOut, 0) ELSE NULL END AS WasDropOut
                FROM   dbo.Users u
                LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = u.UserID
                WHERE  u.IsActive = 1
                  AND  NOT EXISTS (
                      SELECT 1 FROM dbo.AccountPeriodHistory h
                      WHERE h.UserID = u.UserID AND h.SchoolYear = @SchoolYear AND h.Semester = @Semester
                  );",
                new { SchoolYear = oldSchoolYear, Semester = oldSemester });

            return changingKey == "SchoolYear" && IsForwardSchoolYearChange(oldSchoolYear, newValue);
        }

        // SchoolYear is stored as "YYYY-YYYY" — compare the starting year
        // numerically. An unparseable value on either side is treated as
        // "not forward" (safest default: skip the reset rather than risk
        // firing it on a value we can't actually make sense of).
        private static bool IsForwardSchoolYearChange(string oldValue, string newValue)
        {
            var oldStart = ParseStartYear(oldValue);
            var newStart = ParseStartYear(newValue);
            return oldStart.HasValue && newStart.HasValue && newStart.Value > oldStart.Value;
        }

        private static int? ParseStartYear(string schoolYear)
        {
            var part = schoolYear.Split('-')[0];
            return int.TryParse(part, out var y) ? y : null;
        }

        // Every recorded (UserID, SchoolYear, Semester) snapshot — used by
        // User Management's School Year/Semester filter to answer "who had
        // an account during period X" for any past period. The CURRENT
        // period is never looked up here; it's just whoever is Active now.
        public async Task<List<AccountPeriodHistoryRow>> GetAccountPeriodHistoryAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return (await conn.QueryAsync<AccountPeriodHistoryRow>(
                "SELECT UserID, SchoolYear, Semester, WasAssigned, WasDropOut FROM dbo.AccountPeriodHistory")).ToList();
        }

        private class SettingRow
        {
            public string SettingKey { get; set; } = string.Empty;
            public string SettingValue { get; set; } = string.Empty;
        }
    }

    public class CalendarSignaturesDto
    {
        public string? PreparedBySignature { get; set; }
        public string? ApprovedBySignature { get; set; }
    }

    public class AccountPeriodHistoryRow
    {
        public int    UserID     { get; set; }
        public string SchoolYear { get; set; } = string.Empty;
        public string Semester   { get; set; } = string.Empty;
        public bool?  WasAssigned { get; set; }
        public bool?  WasDropOut  { get; set; }
    }
}
