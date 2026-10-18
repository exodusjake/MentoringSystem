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
    public class AnnouncementCommentsController : ControllerBase
    {
        private readonly AnnouncementCommentsService _service;
        public AnnouncementCommentsController(AnnouncementCommentsService service) { _service = service; }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
        private bool IsStaff => User.IsInRole("Admin") || User.IsInRole("Head");

        private async Task<bool> CanModifyAsync(int commentId)
        {
            if (IsStaff) return true;
            var posterId = await _service.GetPosterIdAsync(commentId);
            return posterId.HasValue && posterId.Value == CallerId;
        }

        [HttpGet("announcement/{announcementId}")]
        public async Task<IActionResult> GetByAnnouncement(int announcementId) =>
            Ok(await _service.GetByAnnouncementId(announcementId));

        [HttpGet("announcer/{userId}/latest")]
        public async Task<IActionResult> GetLatestForAnnouncer(int userId)
        {
            var date = await _service.GetLatestCommentDateForAnnouncer(userId);
            return Ok(new { latestCommentAt = date });
        }

        [HttpGet("mentioned/{userId}/latest")]
        public async Task<IActionResult> GetLatestMention(int userId)
        {
            var date = await _service.GetLatestMentionDateAsync(userId);
            return Ok(new { latestMentionAt = date });
        }

        // Any signed-in account can comment — but PostedByUserID always
        // comes from the caller's own JWT, never the request body, or
        // anyone could post a comment that displays as if it came from
        // someone else.
        [HttpPost]
        public async Task<IActionResult> Post([FromBody] AnnouncementComment data)
        {
            if (string.IsNullOrWhiteSpace(data.Content))
                return BadRequest(new { message = "Comment content is required." });
            data.PostedByUserID = CallerId;
            // UtcNow, not Now — see AnnouncementsController.Post for why.
            data.PostedAt = DateTime.UtcNow;
            var result = await _service.Add(data);
            return result ? Ok(new { message = "Comment added" }) : BadRequest();
        }

        // Only the original commenter (or Admin/Head, for moderation) may
        // edit or delete a comment.
        [HttpPut("{id}")]
        public async Task<IActionResult> Put(int id, [FromBody] UpdateCommentRequest req)
        {
            if (!await CanModifyAsync(id)) return Forbid();
            if (string.IsNullOrWhiteSpace(req.Content))
                return BadRequest(new { message = "Comment content is required." });

            var result = await _service.UpdateContent(id, req.Content);
            return result ? Ok(new { message = "Comment updated" }) : NotFound();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(int id)
        {
            if (!await CanModifyAsync(id)) return Forbid();

            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Comment deleted" }) : NotFound();
        }
    }

    public class UpdateCommentRequest
    {
        public string Content { get; set; } = string.Empty;
    }
}
