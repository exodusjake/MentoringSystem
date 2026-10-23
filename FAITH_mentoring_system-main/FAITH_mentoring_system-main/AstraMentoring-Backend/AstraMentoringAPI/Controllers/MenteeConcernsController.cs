using AstraMentoring_Backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class MenteeConcernsController : ControllerBase
    {
        private readonly MenteeConcernsService _service;
        public MenteeConcernsController(MenteeConcernsService service) { _service = service; }

        // The mentor is always the signed-in caller, never a value from the request body.
        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // POST /api/MenteeConcerns — a mentor flags one of their own mentees with a written concern.
        [HttpPost]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Submit([FromBody] SubmitConcernRequest req)
        {
            var result = await _service.SubmitAsync(CallerId, req.MenteeId, req.Category, req.Message);
            return result.Status switch
            {
                MenteeConcernsService.SubmitStatus.Ok => Ok(new { message = "Your concern was sent to the Admin and Head Admin.", concernId = result.ConcernId }),
                MenteeConcernsService.SubmitStatus.InvalidCategory => BadRequest(new { message = "Please choose what the concern is about." }),
                MenteeConcernsService.SubmitStatus.InvalidMessage => BadRequest(new { message = $"Please describe the concern in {MenteeConcernsService.MinMessageLength} to {MenteeConcernsService.MaxMessageLength} characters." }),
                MenteeConcernsService.SubmitStatus.NotAssigned => StatusCode(403, new { message = "You can only flag mentees who are assigned to you." }),
                MenteeConcernsService.SubmitStatus.TooSoon => StatusCode(409, new { message = "That concern was just sent. Please wait a moment before sending another." }),
                _ => StatusCode(500, new { message = "Something went wrong on the server. Please try again." }),
            };
        }

        // GET /api/MenteeConcerns/notifications — the bell: newest concerns plus this user's unread count.
        [HttpGet("notifications")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> Notifications() => Ok(await _service.GetFeedAsync(CallerId));

        [HttpPatch("{id:int}/read")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> MarkRead(int id)
            => await _service.MarkReadAsync(CallerId, id) ? Ok(new { message = "Marked as read" }) : NotFound(new { message = "Concern not found." });

        [HttpPatch("read-all")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> MarkAllRead()
        {
            await _service.MarkAllReadAsync(CallerId);
            return Ok(new { message = "All concerns marked as read" });
        }
    }

    public record SubmitConcernRequest(int MenteeId, string? Category, string? Message);
}
