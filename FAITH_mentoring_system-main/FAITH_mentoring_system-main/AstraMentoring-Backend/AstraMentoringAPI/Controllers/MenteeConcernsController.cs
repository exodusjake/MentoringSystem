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

        // The mentor / responder is always the signed-in caller, never a value from the request body.
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

        // GET /api/MenteeConcerns/notifications — the Admin/Head bell. `count` = concerns still awaiting a response.
        [HttpGet("notifications")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> Notifications() => Ok(await _service.GetStaffFeedAsync());

        // POST /api/MenteeConcerns/{id}/respond — the first Admin/Head to respond closes the concern for everyone.
        [HttpPost("{id:int}/respond")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> Respond(int id, [FromBody] RespondRequest req)
        {
            var result = await _service.RespondAsync(CallerId, id, req.Message);
            return result.Status switch
            {
                MenteeConcernsService.RespondStatus.Ok => Ok(new { message = "Your response was sent to the mentor.", item = result.Item }),
                MenteeConcernsService.RespondStatus.InvalidMessage => BadRequest(new { message = $"Please write a response of {MenteeConcernsService.MinResponseLength} to {MenteeConcernsService.MaxResponseLength} characters." }),
                MenteeConcernsService.RespondStatus.NotFound => NotFound(new { message = "Concern not found." }),
                MenteeConcernsService.RespondStatus.AlreadyResponded => StatusCode(409, new { message = $"{result.Item?.ResponderName ?? "Another admin"} already responded to this concern.", item = result.Item }),
                _ => StatusCode(500, new { message = "Something went wrong on the server. Please try again." }),
            };
        }

        // GET /api/MenteeConcerns/mine — the mentor's own concerns. `count` = responses they have not opened yet.
        [HttpGet("mine")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Mine() => Ok(await _service.GetMineAsync(CallerId));

        // PATCH /api/MenteeConcerns/{id}/ack — the mentor opened the response.
        [HttpPatch("{id:int}/ack")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Acknowledge(int id)
            => await _service.AcknowledgeAsync(CallerId, id) ? Ok(new { message = "Marked as seen" }) : NotFound(new { message = "Concern not found." });
    }

    public record SubmitConcernRequest(int MenteeId, string? Category, string? Message);
    public record RespondRequest(string? Message);
}
