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
    public class AttendanceController : ControllerBase
    {
        private readonly AttendanceService _service;
        public AttendanceController(AttendanceService service) { _service = service; }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // A mentor may only ever write attendance for a session that's
        // actually theirs — otherwise any signed-in mentor could edit or
        // erase another mentor's roster just by guessing an AttendanceID.
        // Checked against the row's real, already-stored SessionID (via
        // GetSessionIdForAttendanceAsync), never a client-supplied one —
        // a client-supplied SessionID could be swapped to a session the
        // caller *does* own while targeting an AttendanceID that belongs
        // to someone else's.
        private async Task<bool> OwnsSessionAsync(int sessionId)
        {
            var mentorId = await _service.GetMentorIdForSessionAsync(sessionId);
            return mentorId.HasValue && mentorId.Value == CallerId;
        }

        private async Task<bool> OwnsAttendanceAsync(int attendanceId)
        {
            var sessionId = await _service.GetSessionIdForAttendanceAsync(attendanceId);
            return sessionId.HasValue && await OwnsSessionAsync(sessionId.Value);
        }

        // GET is unused by any portal's frontend today (rosters go through
        // SessionsAdmin's /mentees and /requester instead) — restricted to
        // staff/mentor roles so a mentee can't browse everyone's raw
        // attendance rows (absence reasons, mentor notes included) via a
        // direct API call.
        [HttpGet]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> Get() => Ok(await _service.GetAll());

        [HttpGet("{id}")]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        [HttpPost]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Post([FromBody] Attendance data)
        {
            if (data.IsPresent || data.ScannedAt.HasValue)
                return BadRequest(new { message = "Attendance can only be marked present by scanning a QR code." });
            if (!await OwnsSessionAsync(data.SessionID))
                return Forbid();

            try
            {
                return Ok(await _service.EnsureAbsentAsync(data));
            }
            catch (AttendanceNotEligibleException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Mentor")]
        public IActionResult Put(int id, [FromBody] Attendance data)
            => BadRequest(new { message = "Manual attendance changes are disabled. Use QR scanning for presence and the logsheet for notes." });

        [HttpPatch("{id}/remarks")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> PatchRemarks(int id, [FromBody] RemarksUpdateDto data)
        {
            if (!await OwnsAttendanceAsync(id))
                return Forbid();

            var attendance = await _service.GetById(id);
            if (attendance is null) return NotFound(new { message = "Attendance record not found." });
            var result = await _service.PatchTextFieldAsync(id, "Remarks", data.Remarks);
            return result
                ? Ok(new { message = "Remarks saved." })
                : StatusCode(500, new { message = "Failed to update remarks." });
        }

        [HttpPatch("{id}/mentor-notes")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> PatchMentorNotes(int id, [FromBody] RemarksUpdateDto data)
        {
            if (!await OwnsAttendanceAsync(id))
                return Forbid();

            var attendance = await _service.GetById(id);
            if (attendance is null) return NotFound(new { message = "Attendance record not found." });
            var result = await _service.PatchTextFieldAsync(id, "MentorNotes", data.Remarks);
            return result
                ? Ok(new { message = "Mentor notes saved." })
                : StatusCode(500, new { message = "Failed to update mentor notes." });
        }

        [HttpPatch("{id}/absence-reason")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> PatchAbsenceReason(int id, [FromBody] RemarksUpdateDto data)
        {
            if (!await OwnsAttendanceAsync(id))
                return Forbid();

            var attendance = await _service.GetById(id);
            if (attendance is null) return NotFound(new { message = "Attendance record not found." });
            var result = await _service.PatchTextFieldAsync(id, "AbsenceReason", data.Remarks);
            return result
                ? Ok(new { message = "Absence reason saved." })
                : StatusCode(500, new { message = "Failed to update absence reason." });
        }

        // Single atomic PATCH — updates all three text columns in one SQL statement.
        // Avoids the race condition of three concurrent GET+UPDATE-all PATCH calls.
        [HttpPatch("{id}/text-fields")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> PatchTextFields(int id, [FromBody] TextFieldsDto data)
        {
            if (!await OwnsAttendanceAsync(id))
                return Forbid();

            var result = await _service.PatchTextFieldsAsync(id, data.Remarks, data.MentorNotes, data.AbsenceReason);
            return result ? Ok(new { message = "Text fields saved." }) : NotFound(new { message = "Attendance record not found." });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Mentor")]
        public IActionResult Delete(int id)
            => BadRequest(new { message = "Manual attendance deletion is disabled." });
    }

    public record RemarksUpdateDto(string? Remarks);
    public record TextFieldsDto(string? Remarks, string? MentorNotes, string? AbsenceReason);
}
