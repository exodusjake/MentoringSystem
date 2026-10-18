using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class SectionsService
    {
        private readonly string _connectionString;

        public SectionsService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<SectionDto>> GetAllAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<SectionDto>(
                "SELECT * FROM Sections WHERE IsActive = 1 ORDER BY School, Course");
        }

        public async Task<IEnumerable<SectionDto>> GetBySchoolAsync(string school)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<SectionDto>(
                "SELECT * FROM Sections WHERE IsActive = 1 AND School = @School ORDER BY Course",
                new { School = school });
        }

        // Sections are keyed on Course alone now (Year+Letter sub-division was
        // removed system-wide — see SQL/collapse_sections_to_course_level.sql).
        // YearLevel/SectionLetter columns stay in the schema (dropping them is
        // unneeded risk) but a newly-created Section no longer sets them to
        // anything meaningful — every business rule reads SectionCode alone.
        public async Task<int?> CreateAsync(CreateSectionRequest req)
        {
            var sectionCode = req.Course.ToUpper();

            using var conn = new SqlConnection(_connectionString);
            var exists = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Sections WHERE SectionCode = @Code AND School = @School AND IsActive = 1",
                new { Code = sectionCode, School = req.School });
            if (exists > 0) return null;

            var newId = await conn.ExecuteScalarAsync<int>(
                @"INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School)
                  OUTPUT INSERTED.SectionID
                  VALUES (@SectionCode, @Course, '', '', @School)",
                new
                {
                    SectionCode = sectionCode,
                    Course      = req.Course.ToUpper(),
                    req.School
                });
            return newId > 0 ? newId : null;
        }

        // Sections are soft-deleted (IsActive = 0), but a mentee's
        // MenteeProfiles.SectionID is a plain FK with no cascade — deleting a
        // section out from under an assigned mentee leaves their record
        // pointing at a now-hidden section, silently dropping out of every
        // active-only dropdown (and risking a null-out on their next save).
        // Called before DeleteAsync to block that instead of letting it happen.
        public async Task<int> CountMenteesInSectionAsync(int sectionId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM MenteeProfiles WHERE SectionID = @SectionID",
                new { SectionID = sectionId });
        }

        public async Task<bool> DeleteAsync(int id)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE Sections SET IsActive = 0 WHERE SectionID = @Id",
                new { Id = id });
            return rows > 0;
        }

        public async Task<IEnumerable<MentorSectionViewDto>> GetMentorViewAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<MentorSectionViewDto>(
                @"SELECT
                    u1.UserID        AS MentorID,
                    u1.FirstName     AS MentorFirstName,
                    u1.LastName      AS MentorLastName,
                    mp.School        AS MentorSchool,
                    d.DepartmentName,
                    u2.UserID        AS MenteeID,
                    u2.FirstName     AS MenteeFirstName,
                    u2.LastName      AS MenteeLastName,
                    u2.StudentNumber,
                    me.Course,
                    me.School        AS MenteeSchool,
                    me.YearLevel,
                    me.Section,
                    me.SectionID,
                    s.SectionCode
                  FROM Users u1
                  INNER JOIN MentorProfiles mp ON mp.UserID = u1.UserID
                  LEFT  JOIN Departments d     ON d.DepartmentID = mp.DepartmentID
                  -- LEFT JOIN from here down (was INNER) — a Mentor with no
                  -- active mentee assigned yet must still appear (with an
                  -- empty mentee list), same as every other page in the
                  -- system. An INNER JOIN silently dropped that mentor
                  -- entirely, including from the per-school mentor counts
                  -- on the school cards above this list.
                  LEFT  JOIN MentorMentee mm   ON mm.MentorID = u1.UserID AND mm.IsActive = 1
                  LEFT  JOIN Users u2          ON u2.UserID = mm.MenteeID AND u2.IsActive = 1
                  LEFT  JOIN MenteeProfiles me ON me.UserID = u2.UserID
                  LEFT  JOIN Sections s        ON s.SectionID = me.SectionID
                  -- Mentors from a department with no school (e.g. SAS) are included.
                  WHERE u1.IsActive = 1 AND u1.Role = 'Mentor'
                    AND (NULLIF(mp.School, '') IS NOT NULL OR mp.DepartmentID IS NOT NULL)
                  ORDER BY u1.LastName, u1.FirstName, s.SectionCode, u2.LastName");
        }
    }

    public class SectionDto
    {
        public int SectionID { get; set; }
        public string SectionCode { get; set; } = string.Empty;
        public string Course { get; set; } = string.Empty;
        public string YearLevel { get; set; } = string.Empty;
        public string SectionLetter { get; set; } = string.Empty;
        public string School { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CreateSectionRequest
    {
        public string Course { get; set; } = string.Empty;
        public string School { get; set; } = string.Empty;
    }

    public class MentorSectionViewDto
    {
        public int MentorID { get; set; }
        public string MentorFirstName { get; set; } = string.Empty;
        public string MentorLastName { get; set; } = string.Empty;
        public string? MentorSchool { get; set; }
        public string? DepartmentName { get; set; }
        public int? MenteeID { get; set; }
        public string? MenteeFirstName { get; set; }
        public string? MenteeLastName { get; set; }
        public string? StudentNumber { get; set; }
        public string? Course { get; set; }
        public string? MenteeSchool { get; set; }
        public string? YearLevel { get; set; }
        public string? Section { get; set; }
        public int? SectionID { get; set; }
        public string? SectionCode { get; set; }
    }
}
