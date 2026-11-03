using System.Security.Claims;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AstraMentoringAPI.Controllers
{
    // A mentee raises a concern (about their mentor, a session, their welfare...): it goes straight to every
    // Admin and Head Admin, in their notification bell and by email. The reporter is always the signed-in caller.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Mentee")]
    public class MenteeReportsController : ControllerBase
    {
        public const int MinLength = 10, MaxLength = 500;
        private static readonly string[] Categories = { "About my mentor", "Session problem", "Attendance record", "Personal or welfare", "Safety", "Other" };

        private readonly IConfiguration _config;
        private readonly EmailService _emailService;

        public MenteeReportsController(IConfiguration config, EmailService emailService)
        {
            _config = config;
            _emailService = emailService;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        public class MenteeReportDto
        {
            public string? Category { get; set; }
            public string? Message { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> Send([FromBody] MenteeReportDto data)
        {
            var category = data.Category?.Trim() ?? "";
            var message = data.Message?.Trim() ?? "";
            if (!Categories.Contains(category)) return BadRequest(new { message = "Please choose what the concern is about." });
            if (message.Length < MinLength || message.Length > MaxLength)
                return BadRequest(new { message = $"Please describe the concern in {MinLength} to {MaxLength} characters." });

            using var conn = new SqlConnection(_config.GetConnectionString("DefaultConnection"));
            var recent = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Notifications WHERE Type='MenteeConcern' AND ReferenceID=@Id AND CreatedAt > DATEADD(SECOND,-30,GETDATE())",
                new { Id = CallerId });
            if (recent > 0) return StatusCode(409, new { message = "That concern was just sent. Please wait a moment before sending another." });

            await _emailService.NotifyMenteeConcernAsync(CallerId, category, message);
            return Ok(new { message = "Your concern was sent to the Admin and Head Admin." });
        }
    }
}
