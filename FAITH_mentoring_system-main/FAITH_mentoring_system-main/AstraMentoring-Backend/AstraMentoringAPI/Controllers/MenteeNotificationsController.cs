using System.Security.Claims;
using AstraMentoring_Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AstraMentoringAPI.Controllers
{
    // The signed-in user's own in-app notifications (the mentee portal's bell). Always scoped to the caller.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Mentee")]
    public class MenteeNotificationsController : ControllerBase
    {
        private readonly NotificationsService _service;
        public MenteeNotificationsController(NotificationsService service) { _service = service; }

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

        [HttpPatch("read-all")]
        public async Task<IActionResult> MarkAllRead()
        {
            await _service.MarkAllAsReadAsync(CallerId);
            return Ok(new { message = "All notifications marked as read" });
        }
    }
}
