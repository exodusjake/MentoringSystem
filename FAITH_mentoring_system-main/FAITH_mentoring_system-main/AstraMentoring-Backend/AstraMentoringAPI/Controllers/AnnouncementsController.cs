using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class AnnouncementsController : ControllerBase
    {
        private readonly AnnouncementsService _service;
        private readonly EmailService _emailService;
        public AnnouncementsController(AnnouncementsService service, EmailService emailService)
        {
            _service = service;
            _emailService = emailService;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // Edit/Delete/Pin are all owner-only — Admin and Head post
        // announcements the same way Mentor does, and can only manage their
        // own, not anyone else's. (Deliberately reversed from an earlier
        // version that gave Admin/Head blanket moderation power here.)
        private async Task<bool> CanModifyAsync(int id)
        {
            var existing = await _service.GetById(id);
            return existing != null && existing.PostedByUserID == CallerId;
        }

        [HttpGet]
        public async Task<IActionResult> Get() => Ok(await _service.GetAllWithPoster());

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        // Only Mentor/Admin/Head ever post an announcement — mentees only
        // ever comment on one (AnnouncementCommentsController). PostedByUserID
        // always comes from the caller's own JWT, never the request body —
        // otherwise anyone could post content that displays as if it came
        // from someone else (Admin, a mentee's own mentor, ...).
        [HttpPost]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> Post([FromBody] Announcement data)
        {
            if (string.IsNullOrWhiteSpace(data.Title) || string.IsNullOrWhiteSpace(data.Content))
                return BadRequest(new { message = "Title and content are required." });
            data.PostedByUserID = CallerId;
            // UtcNow, not Now — the EC2 server's own clock is UTC, so
            // Now and UtcNow are numerically identical here today, but
            // Now silently stops being correct the moment the server's
            // timezone ever changes. UtcNow is the unambiguous, always-
            // correct choice regardless of what timezone the OS is in.
            data.PostedAt = DateTime.UtcNow;
            var result = await _service.Add(data);
            if (result) await _emailService.NotifyNewAnnouncementAsync(data);
            return result ? Ok(new { message = "Announcement created", announcementID = data.AnnouncementID }) : BadRequest();
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> Put(int id, [FromBody] Announcement data)
        {
            if (!await CanModifyAsync(id)) return Forbid();
            if (string.IsNullOrWhiteSpace(data.Title) || string.IsNullOrWhiteSpace(data.Content))
                return BadRequest(new { message = "Title and content are required." });

            data.AnnouncementID = id;
            // PostedByUserID is never client-editable — keep whatever the
            // row already has (CanModifyAsync already proved the caller may
            // touch it). Also preserve IsPinned — not part of the edit form, and
            // UpdateAsync would otherwise reset it to false on every edit.
            var existing = await _service.GetById(id);
            data.PostedByUserID = existing!.PostedByUserID;
            data.IsPinned       = existing.IsPinned;
            var result = await _service.Update(data);
            return result ? Ok(new { message = "Announcement updated" }) : NotFound();
        }

        [HttpPatch("{id}/pin")]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> TogglePin(int id)
        {
            if (!await CanModifyAsync(id)) return Forbid();

            var result = await _service.TogglePinAsync(id);
            return result ? Ok(new { message = "Pin toggled" }) : NotFound();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> Delete(int id)
        {
            if (!await CanModifyAsync(id)) return Forbid();

            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Announcement deleted" }) : NotFound();
        }
    }
}
