using System.Security.Claims;
using AstraMentoring_Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AstraMentoringAPI.Controllers
{
    // The signed-in user's own in-app notifications (the bell of the mentee portal, of Admin/Head for mentee concerns, of the mentor portal for Head concerns). Always scoped to the caller.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Mentee,Mentor,Admin,Head")]
    public class MenteeNotificationsController : ControllerBase
    {
        private readonly NotificationsService _service;

        private const int ReplyMax = 400;
        private readonly EmailService _emailService;
        public MenteeNotificationsController(NotificationsService service, EmailService emailService) { _service = service; _emailService = emailService; }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        [HttpGet("mine")]
        public async Task<IActionResult> Mine()
        {
            var items = (await _service.GetByRecipientAsync(CallerId)).Take(30).ToList();
            return Ok(new { count = items.Count(i => !i.IsRead), items });
        }

        [HttpPatch("{id}/read")]
        public async Task<IActionResult> MarkRead(int id)
        {
            var mine = (await _service.GetByRecipientAsync(CallerId)).Any(n => n.NotificationID == id);
            if (!mine) return NotFound();
            await _service.MarkAsReadAsync(id);
            return Ok(new { message = "Marked as read" });
        }

        public class ReplyDto { public string? Message { get; set; } }

        // The mentee answers a mentor's direct message, once.
        [HttpPost("{id}/reply")]
        [Authorize(Roles = "Mentee")]
        public async Task<IActionResult> Reply(int id, [FromBody] ReplyDto data)
        {
            var message = data.Message?.Trim() ?? "";
            if (message.Length == 0) return BadRequest(new { message = "Write your reply first." });
            if (message.Length > ReplyMax) return BadRequest(new { message = $"Keep the reply under {ReplyMax} characters." });

            var mentorId = await _service.ClaimDirectMessageReplyAsync(id, CallerId);
            if (mentorId == null) return Conflict(new { message = "You already replied to this message." });

            await _emailService.NotifyMentorOfReplyAsync(CallerId, mentorId.Value, message);
            return Ok(new { message = "Reply sent" });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
            => await _service.DeleteForRecipientAsync(id, CallerId) ? Ok(new { message = "Deleted" }) : NotFound();

        [HttpDelete]
        public async Task<IActionResult> DeleteAll()
        {
            await _service.DeleteAllForRecipientAsync(CallerId);
            return Ok(new { message = "All notifications deleted" });
        }

        [HttpPatch("read-all")]
        public async Task<IActionResult> MarkAllRead()
        {
            await _service.MarkAllAsReadAsync(CallerId);
            return Ok(new { message = "All notifications marked as read" });
        }
    }
}
