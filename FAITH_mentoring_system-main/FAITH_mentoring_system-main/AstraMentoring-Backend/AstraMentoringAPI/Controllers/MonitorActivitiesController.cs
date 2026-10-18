using Microsoft.AspNetCore.Authorization;
using AstraMentoring_Backend.Services;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace AstraMentoringAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MonitorActivitiesController : ControllerBase
    {
        private readonly MonitorActivitiesService _service;

        public MonitorActivitiesController(MonitorActivitiesService service)
        {
            _service = service;
        }

        // Full oversight dump of every mentor's progress (name, email,
        // contact number, session status) — used by the Admin and Head
        // Admin portals' monitoring pages. Not something an individual
        // Mentor or Mentee should be able to browse for everyone else.
        [HttpGet]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> GetOverview(
            [FromQuery] bool includeInactive = false,
            [FromQuery] string? schoolYear = null,
            [FromQuery] string? semester = null,
            CancellationToken cancellationToken = default)
        {
            var result = await _service.GetMentorOverviewAsync(includeInactive, schoolYear, semester, cancellationToken);
            return Ok(result);
        }

        // A single mentor's detail — Admin/Head can view any mentor
        // (oversight), a Mentor can view their own record (self-service —
        // Mentor's "My Activities" page), and a Mentee can view their own
        // assigned mentor's record (their dashboard/sessions page shows
        // the mentor's progress). Anyone else gets Forbidden.
        [HttpGet("{mentorId:int}/reports")]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> GetReportStatuses(int mentorId, [FromQuery] string? schoolYear = null, [FromQuery] string? semester = null)
        {
            if (User.IsInRole("Mentor") && mentorId != int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value)) return Forbid();
            try { return Ok(await _service.GetCheckpointReportStatusesAsync(mentorId, schoolYear, semester)); }
            catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        }

        [HttpGet("{mentorId:int}")]
        public async Task<IActionResult> GetDetail(int mentorId)
        {
            var isAdmin = User.IsInRole("Admin") || User.IsInRole("Head");
            if (!isAdmin)
            {
                var callerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
                var isSelf   = callerId == mentorId;
                if (!isSelf && !await _service.IsMenteeAssignedToMentorAsync(callerId, mentorId))
                    return Forbid();
            }

            var result = await _service.GetMentorDetailAsync(mentorId);
            if (result == null) return NotFound(new { message = "Mentor not found." });

            // A mentee only needs their own row, not co-mentees' contact details or signatures.
            if (User.IsInRole("Mentee"))
            {
                var callerId = int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);
                result.Mentees = result.Mentees.Where(m => m.MenteeID == callerId).ToList();
            }
            return Ok(result);
        }
    }
}
