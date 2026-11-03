using System.Security.Claims;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AstraMentoringAPI.Controllers
{
    // A mentor's one-way message to one of their own mentees: lands in that mentee's bell and email.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Mentor")]
    public class MentorMessagesController : ControllerBase
    {
        private const int MaxLength = 400;
        private readonly IConfiguration _config;
        private readonly EmailService _emailService;

        public MentorMessagesController(IConfiguration config, EmailService emailService)
        {
            _config = config;
            _emailService = emailService;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        public class MentorMessageDto
        {
            public int MenteeId { get; set; }
            public string? Message { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> Send([FromBody] MentorMessageDto data)
        {
            var message = data.Message?.Trim() ?? "";
            if (message.Length == 0) return BadRequest(new { message = "Write a message first." });
            if (message.Length > MaxLength) return BadRequest(new { message = $"Keep the message under {MaxLength} characters." });

            using var conn = new SqlConnection(_config.GetConnectionString("DefaultConnection"));
            var assigned = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM MentorMentee WHERE MentorID=@MentorID AND MenteeID=@MenteeID AND IsActive=1",
                new { MentorID = CallerId, MenteeID = data.MenteeId });
            if (assigned == 0) return Forbid();

            await _emailService.NotifyDirectMessageAsync(CallerId, data.MenteeId, message);
            return Ok(new { message = "Message sent" });
        }
    }
}
