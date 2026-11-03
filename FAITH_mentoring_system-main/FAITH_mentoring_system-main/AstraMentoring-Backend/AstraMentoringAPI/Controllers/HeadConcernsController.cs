using System.Security.Claims;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AstraMentoringAPI.Controllers
{
    // The Head Admin raises a concern with one or more mentors (Mentor Monitoring): it lands in each mentor's
    // notification bell and email. The sender is always the signed-in caller.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Head,Admin")]
    public class HeadConcernsController : ControllerBase
    {
        public const int MinLength = 10, MaxLength = 500, MaxMentors = 300;

        private readonly IConfiguration _config;
        private readonly EmailService _emailService;

        public HeadConcernsController(IConfiguration config, EmailService emailService)
        {
            _config = config;
            _emailService = emailService;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        public class HeadConcernDto
        {
            public List<int>? MentorIds { get; set; }
            public string? Message { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> Send([FromBody] HeadConcernDto data)
        {
            var message = data.Message?.Trim() ?? "";
            var ids = (data.MentorIds ?? new List<int>()).Distinct().ToList();
            if (ids.Count == 0) return BadRequest(new { message = "Select at least one mentor." });
            if (ids.Count > MaxMentors) return BadRequest(new { message = "Too many mentors selected." });
            if (message.Length < MinLength || message.Length > MaxLength)
                return BadRequest(new { message = $"Please write the concern in {MinLength} to {MaxLength} characters." });

            using var conn = new SqlConnection(_config.GetConnectionString("DefaultConnection"));
            var recent = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Notifications WHERE Type='HeadConcern' AND ReferenceID=@Id AND CreatedAt > DATEADD(SECOND,-15,GETDATE())",
                new { Id = CallerId });
            if (recent > 0) return StatusCode(409, new { message = "A concern was just sent. Please wait a moment before sending another." });

            var sent = await _emailService.NotifyMentorsOfHeadConcernAsync(CallerId, User.IsInRole("Head") ? "Head Admin" : "Admin", ids, message);
            return Ok(new { message = $"Your concern was sent to {sent} mentor{(sent == 1 ? "" : "s")}.", sent });
        }
    }
}
