using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class SessionsAdminController : ControllerBase
    {
        private readonly SessionsAdminService _service;
        private readonly ProfileService _profileService;
        private readonly SessionsService _sessions;
        private int CallerId => int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        public SessionsAdminController(SessionsAdminService service, ProfileService profileService, SessionsService sessions)
        {
            _service = service;
            _sessions = sessions;
            _profileService = profileService;
        }

        // Shared by the three {mentorId}-scoped routes below — a Mentor may
        // only ever pull their OWN session/logsheet data, a Mentee only their
        // OWN mentor's (checked via an active MentorMentee row, same helper
        // GET /api/Users/{id} uses), Admin/Head can pull anyone's. Without
        // this, any authenticated Mentor or Mentee could read another
        // mentor's full session list/logsheet just by changing the id in
        // the URL — there was previously no ownership check here at all.
        private async Task<bool> CanAccessMentorAsync(int mentorId)
        {
            if (User.IsInRole("Admin") || User.IsInRole("Head")) return true;
            var callerId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(callerId, out var callerUserId)) return false;
            if (User.IsInRole("Mentor")) return callerUserId == mentorId;
            if (User.IsInRole("Mentee")) return await _profileService.HasActiveMentorMenteeRelationshipAsync(callerUserId, mentorId);
            return false;
        }

        // GET /api/SessionsAdmin — mentor cards overview for EVERY mentor;
        // only Admin's own Sessions page calls this bare route (the other
        // routes below are scoped to one mentorId/sessionId and are shared
        // self-service reads used by the Mentor and Mentee portals too, so
        // they stay open to any authenticated user). Admin-only, not Head —
        // Head's frontend never calls this route.
        [HttpGet]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> GetMentorCards()
            => Ok(await _service.GetMentorCardsAsync());

        // GET /api/SessionsAdmin/{mentorId}/sessions — sessions list for a mentor
        [HttpGet("{mentorId:int}/sessions")]
        public async Task<IActionResult> GetMentorSessions(int mentorId)
        {
            if (!await CanAccessMentorAsync(mentorId)) return Forbid();
            return Ok(HideMentorSignatureFromMentee(await _service.GetMentorSessionsAsync(mentorId)));
        }

        // Mentees read their mentor's sessions but never need the mentor's signature image.
        private SessionsMentorDetailDto HideMentorSignatureFromMentee(SessionsMentorDetailDto dto)
        {
            if (User.IsInRole("Mentee") && dto.Mentor != null) dto.Mentor.SignatureFilePath = null;
            return dto;
        }

        // GET /api/SessionsAdmin/{mentorId}/sessions/mentee/{menteeId} — filtered for mentee's section
        [HttpGet("{mentorId:int}/sessions/mentee/{menteeId:int}")]
        public async Task<IActionResult> GetSessionsForMentee(int mentorId, int menteeId)
        {
            if (!await CanAccessMentorAsync(mentorId)) return Forbid();
            if (User.IsInRole("Mentee") && menteeId != CallerId) return Forbid();
            return Ok(HideMentorSignatureFromMentee(await _service.GetSessionsForMenteeAsync(mentorId, menteeId)));
        }

        // GET /api/SessionsAdmin/session/{sessionId}/mentees — logsheet detail
        [HttpGet("session/{sessionId:int}/mentees")]
        public async Task<IActionResult> GetSessionMentees(int sessionId)
        {
            var session = await _sessions.GetById(sessionId);
            if (session == null) return NotFound();
            if (!await CanAccessMentorAsync(session.MentorID)) return Forbid();
            var rows = await _service.GetSessionMenteesAsync(sessionId);
            return Ok(User.IsInRole("Mentee") ? rows.Where(m => m.MenteeID == CallerId).ToList() : rows);
        }

        // GET /api/SessionsAdmin/session/{sessionId}/requester — requester for makeup sessions
        [HttpGet("session/{sessionId:int}/requester")]
        public async Task<IActionResult> GetMakeupRequester(int sessionId)
        {
            var session = await _sessions.GetById(sessionId);
            if (session == null) return NotFound();
            if (!await CanAccessMentorAsync(session.MentorID)) return Forbid();
            var result = await _service.GetMakeupSessionRequesterAsync(sessionId);
            return Ok(User.IsInRole("Mentee") ? result.Where(m => m.MenteeID == CallerId).ToList() : result);
        }

        // GET /api/SessionsAdmin/{mentorId}/logsheet — full logsheet for export
        // Pass ?submittedOnly=true from the admin portal to hide Draft sessions
        [HttpGet("{mentorId:int}/logsheet")]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> GetLogsheet(int mentorId, [FromQuery] bool submittedOnly = false)
        {
            if (!await CanAccessMentorAsync(mentorId)) return Forbid();
            return Ok(await _service.GetLogsheetAsync(mentorId, submittedOnly));
        }
    }
}
