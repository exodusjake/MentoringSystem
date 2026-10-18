using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    // Not currently called from any portal's frontend (verified — no
    // apiRequest references anywhere), but it exposes real mutation and
    // mass-broadcast actions (send/all, send/role, delete-any-by-id) with
    // no ownership checks, reachable by any authenticated user under the
    // global fallback policy alone. Locked to Admin/Head as a safety
    // measure; if this is ever wired up to the frontend, revisit with
    // proper per-action ownership checks (e.g. send/mentees/{mentorUserId}
    // should verify the caller IS that mentor) rather than this blanket rule.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Admin,Head")]
    public class AdminNotificationsController : ControllerBase
    {
        private readonly NotificationsService _service;
        public AdminNotificationsController(NotificationsService service) { _service = service; }

        // ── GET: all (admin view) ───────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> Get() => Ok(await _service.GetAll());

        // ── GET: by notification ID ─────────────────────────────────────────
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        // ── GET: all notifications for a user ──────────────────────────────
        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetByUser(int userId)
        {
            var result = await _service.GetByRecipientAsync(userId);
            return Ok(result);
        }

        // ── PATCH: mark one as read ─────────────────────────────────────────
        [HttpPatch("{id}/read")]
        public async Task<IActionResult> MarkRead(int id)
        {
            var result = await _service.MarkAsReadAsync(id);
            return result ? Ok(new { message = "Marked as read" }) : NotFound();
        }

        // ── PATCH: mark all as read for a user ─────────────────────────────
        [HttpPatch("user/{userId}/read-all")]
        public async Task<IActionResult> MarkAllRead(int userId)
        {
            await _service.MarkAllAsReadAsync(userId);
            return Ok(new { message = "All notifications marked as read" });
        }

        // ── POST: Admin → send to everyone ─────────────────────────────────
        [HttpPost("send/all")]
        public async Task<IActionResult> SendToAll([FromBody] BroadcastRequest request)
        {
            await _service.SendToAllAsync(request.Type, request.Message, request.ReferenceID);
            return Ok(new { message = "Notification sent to all users" });
        }

        // ── POST: Admin → send to a role (Mentor or Mentee) ────────────────
        [HttpPost("send/role")]
        public async Task<IActionResult> SendToRole([FromBody] RoleNotificationRequest request)
        {
            await _service.SendToRoleAsync(request.Role, request.Type, request.Message, request.ReferenceID);
            return Ok(new { message = $"Notification sent to all {request.Role}s" });
        }

        // ── POST: Mentor → send to their assigned mentees only ─────────────
        [HttpPost("send/mentees/{mentorUserId}")]
        public async Task<IActionResult> SendToMentees(int mentorUserId, [FromBody] BroadcastRequest request)
        {
            await _service.SendToAssignedMenteesAsync(mentorUserId, request.Type, request.Message, request.ReferenceID);
            return Ok(new { message = "Notification sent to assigned mentees" });
        }

        // ── POST: System/manual → send to one user ─────────────────────────
        [HttpPost("send/user/{userId}")]
        public async Task<IActionResult> SendToUser(int userId, [FromBody] BroadcastRequest request)
        {
            await _service.SendToUserAsync(userId, request.Type, request.Message, request.ReferenceID);
            return Ok(new { message = "Notification sent" });
        }

        // ── PUT / DELETE (kept from AdminNotifications) ─────────────────────
        [HttpPut("{id}")]
        public async Task<IActionResult> Put(int id, [FromBody] Notification data)
        {
            data.NotificationID = id;
            var result = await _service.Update(data);
            return result ? Ok(new { message = "Notification updated" }) : NotFound();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Notification deleted" }) : NotFound();
        }
    }

    // ── Request models ──────────────────────────────────────────────────────
    public class BroadcastRequest
    {
        public string Type { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public int? ReferenceID { get; set; }
    }

    public class RoleNotificationRequest
    {
        public string Role { get; set; } = string.Empty;  // "Mentor" or "Mentee"
        public string Type { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public int? ReferenceID { get; set; }
    }
}