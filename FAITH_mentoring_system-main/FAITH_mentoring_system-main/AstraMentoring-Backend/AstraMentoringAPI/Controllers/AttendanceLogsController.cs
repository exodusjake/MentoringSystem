using Microsoft.AspNetCore.Authorization;
using AstraMentoring_Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace AstraMentoringAPI.Controllers
{
    // Attendance oversight across every mentor/mentee — used only by the
    // Admin and Head Admin portals' Attendance Summary pages (verified —
    // no Mentor or Mentee frontend code calls any action here, unlike
    // MonitorActivitiesController which has legitimate self-service uses).
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin,Head")]
    public class AttendanceLogsController : ControllerBase
    {
        private readonly AttendanceLogsService _service;

        public AttendanceLogsController(AttendanceLogsService service)
        {
            _service = service;
        }

        // GET /api/AttendanceLogs  → summary stats + mentor cards
        [HttpGet]
        public async Task<IActionResult> GetOverview()
        {
            var result = await _service.GetOverviewAsync();
            return Ok(result);
        }

        // GET /api/AttendanceLogs/{mentorId}/mentees  → mentee cards for a mentor
        [HttpGet("{mentorId:int}/mentees")]
        public async Task<IActionResult> GetMentorMentees(int mentorId)
        {
            var result = await _service.GetMentorMenteesAsync(mentorId);
            return Ok(result);
        }

        // GET /api/AttendanceLogs/mentee/{menteeId}?mentorId={id}  → session history
        [HttpGet("mentee/{menteeId:int}")]
        public async Task<IActionResult> GetMenteeHistory(int menteeId, [FromQuery] int mentorId)
        {
            var result = await _service.GetMenteeHistoryAsync(menteeId, mentorId);
            return Ok(result);
        }

        // GET /api/AttendanceLogs/full-report?school=...  → two-level print report
        [HttpGet("full-report")]
        public async Task<IActionResult> GetFullReport([FromQuery] string? school)
        {
            var result = await _service.GetFullReportAsync(school);
            return Ok(result);
        }
    }
}
