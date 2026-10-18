using AstraMentoring_Backend.Constants;
using Dapper;
using Microsoft.Data.SqlClient;
using System.Data;

namespace AstraMentoring_Backend.Services;

public record CourseGroup(string School, string CourseCode);

public static class CoursePolicy
{
    public const string Error = "Choose a valid course for the selected school. Sections are not required.";
    public static async Task<CourseGroup?> ResolveAsync(SqlConnection conn, string? school, string? course, IDbTransaction? tx = null)
    {
        var approved = SchoolCourses.Resolve(school,course);
        if (approved.HasValue) return new(approved.Value.School,approved.Value.Course);
        // Preserve existing Admin-added course catalog entries without requiring
        // the mentee to carry a SectionID. Unknown schools are not invented.
        var canonicalSchool=SchoolCourses.Catalog.Keys.FirstOrDefault(s=>string.Equals(s,school?.Trim(),StringComparison.OrdinalIgnoreCase));
        if(canonicalSchool==null || string.IsNullOrWhiteSpace(course))return null;
        var codes=await conn.QueryAsync<string>("SELECT DISTINCT Course FROM Sections WHERE School=@School AND IsActive=1",new {School=canonicalSchool},tx);
        var match=codes.FirstOrDefault(c=>SchoolCourses.NormalizeCode(c)==SchoolCourses.NormalizeCode(course));
        return match==null?null:new(canonicalSchool,match);
    }

    // Links a mentee to the course's Sections row (one row per course), creating
    // it if missing, so new accounts group and display like existing ones.
    public static async Task<int> SectionIdAsync(SqlConnection conn, CourseGroup course, IDbTransaction? tx = null)
    {
        var code = course.CourseCode.Trim().ToUpperInvariant();
        var id = await conn.ExecuteScalarAsync<int?>(
            "SELECT TOP 1 SectionID FROM Sections WHERE SectionCode=@Code AND School=@School AND IsActive=1 ORDER BY SectionID",
            new { Code = code, School = course.School }, tx);
        if (id.HasValue) return id.Value;
        return await conn.ExecuteScalarAsync<int>("""
            INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School)
            OUTPUT INSERTED.SectionID
            VALUES (@Code, @Course, '', '', @School)
            """, new { Code = code, Course = course.CourseCode, School = course.School }, tx);
    }

    public static async Task<List<CourseGroup>> AssignedAsync(SqlConnection conn,int mentorId,IDbTransaction? tx=null)
    {
        var rows=await conn.QueryAsync<(string? School,string? Course)>("""
            SELECT DISTINCT mp.School,mp.Course FROM MentorMentee mm
            JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID
            JOIN Users u ON u.UserID=mp.UserID AND u.Role='Mentee' AND u.IsActive=1
            WHERE mm.MentorID=@mentorId AND mm.IsActive=1 AND ISNULL(mp.IsDropOut,0)=0
            """,new {mentorId},tx);
        var result=new List<CourseGroup>();
        foreach(var row in rows)
        {
            var course=await ResolveAsync(conn,row.School,row.Course,tx);
            if(course!=null&&!result.Contains(course))result.Add(course);
        }
        return result;
    }

    public static CourseGroup? Select(IEnumerable<CourseGroup> assigned,string? requestedCourse,string? requestedSchool)
    {
        var courses=assigned.Distinct().ToArray();
        if(string.IsNullOrWhiteSpace(requestedCourse))return courses.Length==1?courses[0]:null;
        var matches=courses.Where(c=>SchoolCourses.NormalizeCode(c.CourseCode)==SchoolCourses.NormalizeCode(requestedCourse)
            && (string.IsNullOrWhiteSpace(requestedSchool)||string.Equals(c.School,requestedSchool.Trim(),StringComparison.OrdinalIgnoreCase))).ToArray();
        return matches.Length==1?matches[0]:null;
    }
}
