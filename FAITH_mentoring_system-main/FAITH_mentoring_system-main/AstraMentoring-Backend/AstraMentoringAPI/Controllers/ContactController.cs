using System.Collections.Concurrent;
using System.Net.Mail;
using AstraMentoring_Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AstraMentoringAPI.Controllers
{
    // Public "Contact us" form on the login page. Anonymous by design, so it is
    // kept narrow: length limits, a honeypot field, and a small per-IP hourly cap.
    [Route("api/[controller]")]
    [ApiController]
    public class ContactController : ControllerBase
    {
        private const int MaxPerHour = 5;
        private static readonly ConcurrentDictionary<string, List<DateTime>> _sent = new();

        private readonly EmailService _email;

        public ContactController(EmailService email) => _email = email;

        public class ContactRequest
        {
            public string Name { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string Topic { get; set; } = string.Empty;
            public string Message { get; set; } = string.Empty;
            // Hidden field real users never fill in; bots do.
            public string? Website { get; set; }
        }

        [HttpPost]
        [AllowAnonymous]
        public async Task<IActionResult> Send([FromBody] ContactRequest request)
        {
            // Pretend success for bots so they don't retry.
            if (!string.IsNullOrWhiteSpace(request.Website))
                return Ok(new { message = "Thank you! Your message has been sent." });

            var name = (request.Name ?? string.Empty).Trim();
            var email = (request.Email ?? string.Empty).Trim();
            var topic = string.IsNullOrWhiteSpace(request.Topic) ? "General inquiry" : request.Topic.Trim();
            var message = (request.Message ?? string.Empty).Trim();

            if (name.Length < 2 || name.Length > 100)
                return BadRequest(new { message = "Please enter your name." });
            if (!IsValidEmail(email) || email.Length > 150)
                return BadRequest(new { message = "Please enter a valid email address." });
            if (topic.Length > 80)
                return BadRequest(new { message = "Topic is too long." });
            if (message.Length < 10)
                return BadRequest(new { message = "Please write a little more (at least 10 characters)." });
            if (message.Length > 2000)
                return BadRequest(new { message = "Message is too long (2000 characters max)." });

            if (!TryTake(HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"))
                return StatusCode(StatusCodes.Status429TooManyRequests,
                    new { message = "You've sent several messages recently. Please try again later." });

            if (!await _email.SendContactInquiryAsync(name, email, topic, message))
                return StatusCode(503, new { message = "We couldn't send your message. Please try again shortly or visit the Guidance Office." });

            return Ok(new { message = "Thank you! Your message has been sent to the Guidance Office." });
        }

        private static bool IsValidEmail(string email)
        {
            try { return new MailAddress(email).Address == email; }
            catch { return false; }
        }

        private static bool TryTake(string ip)
        {
            var list = _sent.GetOrAdd(ip, _ => new List<DateTime>());
            lock (list)
            {
                list.RemoveAll(t => t < DateTime.UtcNow.AddHours(-1));
                if (list.Count >= MaxPerHour) return false;
                list.Add(DateTime.UtcNow);
                return true;
            }
        }
    }
}
