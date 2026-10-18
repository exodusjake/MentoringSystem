using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    // Every route here takes a {mentorId}/{menteeId} straight from the URL —
    // without checking it against the caller's own JWT, any signed-in mentor
    // could post/delete a slot under a DIFFERENT mentor's name, or any
    // mentee could submit a request as a different mentee. Every action
    // below confirms the caller is only ever acting as themselves.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class AvailabilityWorkflowController : ControllerBase
    {
        private readonly AvailabilityWorkflowService _svc;
        private readonly EmailService _emailService;
        private readonly ILogger<AvailabilityWorkflowController> _logger;
        public AvailabilityWorkflowController(
            AvailabilityWorkflowService svc, EmailService emailService, ILogger<AvailabilityWorkflowController> logger)
        {
            _svc = svc;
            _emailService = emailService;
            _logger = logger;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // ── Mentor: get own slots ──────────────────────────────────────────────
        [HttpGet("mentor/{mentorId}/slots")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> GetMentorSlots(int mentorId)
        {
            if (mentorId != CallerId) return Forbid();
            return Ok(await _svc.GetMentorSlotsAsync(mentorId));
        }

        // ── Mentor: post new slot ──────────────────────────────────────────────
        [HttpPost("mentor/{mentorId}/slots")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> PostSlot(int mentorId, [FromBody] PostSlotRequest req)
        {
            if (mentorId != CallerId) return Forbid();

            if (!TimeSpan.TryParse(req.StartTime, out var start) ||
                start < TimeSpan.Zero || start >= TimeSpan.FromDays(1))
                return BadRequest(new { message = "Invalid time format. Use HH:mm." });

            if (!DateTime.TryParse(req.AvailableDate, out var date))
                return BadRequest(new { message = "Invalid date format." });

            if (date.Date < DateTime.Today)
                return BadRequest(new { message = "Availability date must be today or in the future." });

            if (string.IsNullOrWhiteSpace(req.SlotName))
                return BadRequest(new { message = "Please select which checkpoint this slot is for." });

            var (ok, error) = await _svc.AddSlotAsync(mentorId, date.Date, start, req.SlotName);
            if (ok) await _emailService.NotifyNewAvailabilitySlotAsync(mentorId, date.Date, start);
            return ok ? Ok(new { message = "Slot posted." }) : BadRequest(new { message = error });
        }

        // ── Mentor: delete slot ────────────────────────────────────────────────
        [HttpDelete("mentor/{mentorId}/slots/{slotId}")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> DeleteSlot(int mentorId, int slotId)
        {
            if (mentorId != CallerId) return Forbid();

            var (ok, error) = await _svc.DeleteSlotAsync(slotId, mentorId);
            return ok ? Ok(new { message = "Slot deleted." }) : BadRequest(new { message = error });
        }

        // ── Mentor: approve request ────────────────────────────────────────────
        // Orphaned by the auto-approve redesign — no portal's UI calls this
        // anymore (requests are approved instantly on submit), but it's left
        // in place and locked down the same way in case it's ever reused.
        [HttpPut("requests/{requestId}/approve")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Approve(int requestId, [FromBody] MentorActionBody body)
        {
            if (body.MentorID != CallerId) return Forbid();

            var (ok, error) = await _svc.ApproveRequestAsync(requestId, body.MentorID);
            return ok ? Ok(new { message = "Request approved. Session created." }) : BadRequest(new { message = error });
        }

        // ── Mentor: decline request ────────────────────────────────────────────
        [HttpPut("requests/{requestId}/decline")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Decline(int requestId, [FromBody] MentorActionBody body)
        {
            if (body.MentorID != CallerId) return Forbid();

            try
            {
                var ok = await _svc.DeclineRequestAsync(requestId, body.MentorID);
                return ok ? Ok(new { message = "Request declined." }) : NotFound(new { message = "Request not found." });
            }
            catch (Exception ex)
            {
                // The raw exception message (which for a DB failure can include
                // SQL text, column/constraint names, or connection details) used
                // to go straight into the response body — logged server-side now
                // instead, client gets a generic message.
                _logger.LogError(ex, "DeclineRequestAsync failed for requestId {RequestId}", requestId);
                return StatusCode(500, new { message = "Failed to decline the request. Please try again." });
            }
        }

        // ── Mentee: get mentor's open slots ───────────────────────────────────
        [HttpGet("mentee/{menteeId}/slots")]
        [Authorize(Roles = "Mentee")]
        public async Task<IActionResult> GetOpenSlots(int menteeId)
        {
            if (menteeId != CallerId) return Forbid();
            return Ok(await _svc.GetOpenSlotsForMenteeAsync(menteeId));
        }

        // ── Mentee: get request history ────────────────────────────────────────
        [HttpGet("mentee/{menteeId}/request-history")]
        [Authorize(Roles = "Mentee")]
        public async Task<IActionResult> GetRequestHistory(int menteeId)
        {
            if (menteeId != CallerId) return Forbid();
            return Ok(await _svc.GetRequestHistoryForMenteeAsync(menteeId));
        }

        // ── Mentee: submit request ─────────────────────────────────────────────
        [HttpPost("mentee/{menteeId}/request")]
        [Authorize(Roles = "Mentee")]
        public async Task<IActionResult> SubmitRequest(int menteeId, [FromBody] SubmitRequestBody body)
        {
            if (menteeId != CallerId) return Forbid();

            var (ok, error) = await _svc.SubmitRequestAsync(menteeId, body.AvailabilityID, body.Purpose);
            if (ok) await _emailService.NotifySlotBookedAsync(menteeId, body.AvailabilityID, body.Purpose);
            return ok ? Ok(new { message = "Request submitted." }) : BadRequest(new { message = error });
        }
    }

    public class PostSlotRequest
    {
        public string AvailableDate { get; set; } = string.Empty;
        public string StartTime     { get; set; } = string.Empty;
        public string SlotName      { get; set; } = string.Empty;
    }

    public class SubmitRequestBody
    {
        public int     AvailabilityID { get; set; }
        public string? Purpose        { get; set; }
    }

    public class MentorActionBody
    {
        public int MentorID { get; set; }
    }
}
