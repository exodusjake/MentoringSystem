using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Constants;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class SessionsController : ControllerBase
    {
        private readonly SessionsService _service;
        private readonly IConfiguration  _config;
        private readonly EmailService    _emailService;

        public SessionsController(SessionsService service, IConfiguration config, EmailService emailService)
        {
            _service = service;
            _config  = config;
            _emailService = emailService;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        private static bool IsPastSchedule(DateTime date)
        {
            var now = DateTime.UtcNow.AddHours(8);
            var currentMinute = new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, 0);
            return date < currentMinute;
        }

        // GET is unused by any portal's frontend today (rosters go through
        // SessionsAdmin instead) — restricted to staff/mentor roles so a
        // mentee can't browse every session's raw topic/notes via a direct
        // API call.
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

        // Only a mentor ever creates/edits/cancels/deletes their own
        // sessions — a mentor may only ever act on a session that's
        // actually theirs, checked against the row's real stored
        // MentorID, never a client-supplied one.
        [HttpPost]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Post([FromBody] Session data)
        {
            if (data.MentorID != CallerId) return Forbid();
            if (data.RequestID.HasValue)
                return BadRequest(new { message = "Make-up sessions must be created through the Availability workflow." });
            if (data.TimeEnd.HasValue)
                return BadRequest(new { message = "End time is recorded by Save End after the session. Do not enter an end time when scheduling." });
            if (IsPastSchedule(data.SessionDate))
                return BadRequest(new { message = "Choose a session date and start time that are not in the past (Philippine time)." });

            // This endpoint creates regular sessions only.
            if (data.RequestID == null)
            {
                var cs = _config.GetConnectionString("DefaultConnection")
                    ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";

                using var conn = new SqlConnection(cs);
                var settings = await conn.QueryAsync<(string Key, string Val)>(
                    "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')");
                var dict       = settings.ToDictionary(r => r.Key, r => r.Val);
                var schoolYear = dict.TryGetValue("SchoolYear", out var sy) ? sy : "2026-2027";
                var semester   = dict.TryGetValue("Semester",   out var sm) ? sm : "1st Semester";

                // Extract section code from Notes prefix, e.g. "[BSCS 1A] Topic" → "BSCS 1A"
                string? sectionCode = data.SectionCode;
                if (!string.IsNullOrWhiteSpace(data.Notes))
                {
                    var m = System.Text.RegularExpressions.Regex.Match(data.Notes, @"^\[(.+?)\]");
                    if (m.Success && string.IsNullOrWhiteSpace(sectionCode)) sectionCode = m.Groups[1].Value;
                }
                var assignedCourses = await CoursePolicy.AssignedAsync(conn,data.MentorID);
                if (assignedCourses.Count==0)
                    return BadRequest(new { message = "No valid assigned course is available. Ask the administrator to verify your mentees' school and course information." });
                var selectedCourse=CoursePolicy.Select(assignedCourses,data.CourseCode,data.CourseSchool);
                if(selectedCourse==null)
                    return BadRequest(new { message = "Choose a valid assigned course for this regular session." });
                data.CourseCode=selectedCourse.CourseCode;data.CourseSchool=selectedCourse.School;
                sectionCode=selectedCourse.CourseCode;
                // Resolved once here into a real column — every downstream query
                // reads Sessions.SectionCode instead of re-parsing Notes text.
                data.SectionCode = sectionCode;

                // A regular session must name one of the semester's fixed
                // checkpoints (Constants/MentoringSlots.cs) — this replaces
                // the old generic per-section count-vs-SessionLimit cap:
                // the fixed slot list length IS the cap now.
                if (string.IsNullOrWhiteSpace(data.SlotName) ||
                    !MentoringSlots.ForSemester(semester).Contains(data.SlotName))
                {
                    return BadRequest(new { message = "Please choose a valid session slot for this semester." });
                }

                if (await _service.CourseSlotExistsAsync(data.MentorID, selectedCourse, schoolYear, semester, data.SlotName, null))
                {
                    return BadRequest(new
                    {
                        message = $"A non-cancelled {data.SlotName} regular session already exists for {sectionCode ?? "the unassigned section"} in this school year and semester."
                    });
                }

                data.SchoolYear = schoolYear;
                data.Semester   = semester;
            }

            using (var windowConn = new SqlConnection(_config.GetConnectionString("DefaultConnection")))
                if (!await CheckpointWindowPolicy.CanScheduleAsync(windowConn,data.SlotName,data.SchoolYear,data.Semester,data.SessionDate))
                    return BadRequest(new { message=CheckpointWindowPolicy.Error });
            data.Status = "Scheduled";
            data.TimeEnd = null;
            var result = await _service.Add(data);
            if (result == SessionAddResult.InvalidRegularSession)
                return BadRequest(new { message = "Regular sessions require a valid assigned course and cannot use a make-up request." });
            if (result == SessionAddResult.DuplicateRegularSession)
                return BadRequest(new
                {
                    message = $"A non-cancelled {data.SlotName} regular session already exists for {data.SectionCode ?? "the unassigned section"} in this school year and semester."
                });
            if (result == SessionAddResult.CheckpointWindowUnavailable)
                return BadRequest(new { message = CheckpointWindowPolicy.Error });
            // Only regular sessions (no RequestID) are unilaterally scheduled
            // by the mentor — a make-up session comes from the mentee's own
            // booking (already covered by NotifySlotBookedAsync), so they
            // don't need telling twice.
            if (data.RequestID == null)
                await _emailService.NotifySessionScheduledAsync(data.SessionID, data.MentorID, data.SessionDate, data.SectionCode, data.SlotName);
            return Ok(new { message = "Session created" });
        }

        [HttpPost("{id}/finish")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Finish(int id)
        {
            var existing = await _service.GetById(id);
            if (existing == null) return NotFound();
            if (existing.MentorID != CallerId) return Forbid();
            var endedAt = await _service.FinishAsync(id, CallerId);
            return endedAt.HasValue ? Ok(new { timeEnd = endedAt.Value })
                : BadRequest(new { message = "This session cannot be finished: it is cancelled, or its attendance window is closed with no recorded attendance." });
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Put(int id, [FromBody] Session data)
        {
            data.SessionID = id;
            // Preserve read-only fields from DB — proof upload / attendance save must not wipe them
            var existing = await _service.GetById(id);
            if (existing == null) return NotFound();
            if (existing.MentorID != CallerId) return Forbid();

            data.SchoolYear = existing.SchoolYear;
            if (data.Status == "Completed" && existing.Status != "Completed" && !existing.TimeEnd.HasValue)
                return BadRequest(new { message = "A session can only be completed by Save & Close after attendance." });
            // Same protection as Delete: a held session keeps its attendance.
            if (data.Status == "Cancelled" && existing.Status != "Cancelled")
            {
                if (existing.Status == "Completed")
                    return BadRequest(new { message = "Completed sessions can't be cancelled." });
                if (await _service.HasScannedAttendanceAsync(id))
                    return BadRequest(new { message = "This session already has scanned attendance and can't be cancelled." });
            }
            if (data.TimeEnd.HasValue && data.TimeEnd != existing.TimeEnd)
                return BadRequest(new { message = "End time is recorded by Save End and cannot be edited manually." });
            if (data.SessionDate != existing.SessionDate && IsPastSchedule(data.SessionDate))
                return BadRequest(new { message = "Choose a session date and start time that are not in the past (Philippine time)." });
            data.Semester   = existing.Semester;
            // Only the finish action records actual end time.
            data.TimeEnd = existing.TimeEnd;
            data.LogStatus = existing.LogStatus;
            data.SubmittedAt = existing.SubmittedAt;
            // No PUT caller (Edit, Cancel, QR-attendance-save, Proof-upload) ever
            // sends RequestID — it's set once, at creation, for a makeup session.
            // Without this, the generic repo's full-column UPDATE (see
            // GenericRepository.UpdateAsync) wrote it back as null on every save,
            // silently turning any edited/cancelled/completed makeup session into
            // what looks like a regular one and orphaning its SessionRequest link.
            data.RequestID = existing.RequestID;
            // Same reasoning — MentorID is never meant to change after
            // creation. Without this, the same full-column UPDATE would let
            // a PUT body silently reassign a session to a different mentor.
            data.MentorID = existing.MentorID;

            // Re-resolve SectionCode from Notes, same as Post — the Edit Session
            // modal lets a mentor change the section, so this must stay in sync.
            // Every current PUT caller sends Notes (edited or the preserved
            // existing topic), but fall back to the existing value defensively
            // if one ever doesn't, rather than silently wiping it.
            if (!string.IsNullOrWhiteSpace(data.Notes))
            {
                var m = System.Text.RegularExpressions.Regex.Match(data.Notes, @"^\[(.+?)\]");
                data.SectionCode = m.Success ? m.Groups[1].Value : existing.SectionCode;
            }
            else
            {
                data.SectionCode = existing.SectionCode;
            }

            // Validate a requested section change without changing legacy records
            // during cancellation, proof saves, or other partial updates.
            if(existing.CourseCode!=null)
            {
                data.CourseCode??=existing.CourseCode;data.CourseSchool??=existing.CourseSchool;
                using var courseConn=new SqlConnection(_config.GetConnectionString("DefaultConnection"));
                var assigned=await CoursePolicy.AssignedAsync(courseConn,existing.MentorID);
                var changed=data.CourseCode!=existing.CourseCode||data.CourseSchool!=existing.CourseSchool;
                if(changed && (CoursePolicy.Select(assigned,data.CourseCode,data.CourseSchool)==null
                    || await _service.HasScannedAttendanceAsync(id)))
                    return BadRequest(new {message="Choose a valid assigned course. A recorded attendance roster cannot be changed."});
                data.SectionCode=data.CourseCode;
            }
            else
            {
                // An edit is not approval to migrate a historical grouping.
                data.SectionCode=existing.SectionCode;
            }

            // Same slot validation as creation. Not every PUT caller edits
            // the slot (Cancel, QR-attendance-save and Proof-upload all send
            // a partial payload that never includes SlotName) — an empty/
            // absent SlotName here means "leave it as-is", not "clear it",
            // so it's preserved rather than wiped or rejected. Only an
            // actual change (the Edit Session modal's own Slot dropdown)
            // gets re-validated.
            if (existing.RequestID == null)
            {
                if (string.IsNullOrWhiteSpace(data.SlotName))
                {
                    data.SlotName = existing.SlotName;
                }
                else if (data.SlotName != existing.SlotName &&
                         !MentoringSlots.ForSemester(data.Semester).Contains(data.SlotName))
                {
                    return BadRequest(new { message = "Please choose a valid session slot for this semester." });
                }

                var checkpointKeyChanged = data.SectionCode != existing.SectionCode || data.SlotName != existing.SlotName;
                var reactivatingCancelled = existing.Status == "Cancelled" && data.Status != "Cancelled";
                if (data.Status != "Cancelled" &&
                    !string.IsNullOrWhiteSpace(data.SlotName) &&
                    (checkpointKeyChanged || reactivatingCancelled) &&
                    (existing.CourseCode!=null
                        ? await _service.CourseSlotExistsAsync(data.MentorID,new CourseGroup(data.CourseSchool!,data.CourseCode!),data.SchoolYear,data.Semester,data.SlotName,id)
                        : await _service.SlotExistsAsync(data.MentorID, data.SectionCode, data.SchoolYear, data.Semester, data.SlotName, id)))
                {
                    return BadRequest(new
                    {
                        message = $"A non-cancelled {data.SlotName} regular session already exists for {data.SectionCode ?? "the unassigned section"} in this school year and semester."
                    });
                }
            }
            else
            {
                // A makeup session's SlotName comes from the Availability
                // slot it was booked from (sp_SubmitSessionRequest) — this
                // PUT is never how it's set, so it's preserved the same way
                // as a regular session's SlotName above. Previously this
                // branch always forced it to null (from back when a makeup
                // session could never have a checkpoint tag at all), which
                // silently wiped a checkpoint-tagged makeup session's tag on
                // every Cancel/QR-attendance-save/Proof-upload — breaking
                // its Logsheet merge and Evaluation Ratings attendance count
                // the moment any of those ran.
                data.SlotName = existing.SlotName;
            }

            // Notes/proofs and cancellation remain available after the window closes.
            if (data.SessionDate != existing.SessionDate || data.SlotName != existing.SlotName
                || data.SectionCode != existing.SectionCode || (existing.Status == "Cancelled" && data.Status != "Cancelled"))
            {
                using var windowConn = new SqlConnection(_config.GetConnectionString("DefaultConnection"));
                if (!await CheckpointWindowPolicy.CanScheduleAsync(windowConn,data.SlotName,data.SchoolYear,data.Semester,data.SessionDate))
                    return BadRequest(new { message=CheckpointWindowPolicy.Error });
            }
            // Completion is recorded by QR attendance / Finish, never by a generic edit.
            if (data.Status == "Completed" && existing.Status != "Completed") data.Status=existing.Status;
            var result = await _service.Update(data);
            if (result) await NotifyMenteesOfChangeAsync(existing, data);
            return result ? Ok(new { message = "Session updated" }) : NotFound();
        }

        // Cancel / reschedule / new notes: tell the mentees (email + portal notification). Never fails the save.
        private async Task NotifyMenteesOfChangeAsync(Session existing, Session data)
        {
            try
            {
                if (existing.Status == "Cancelled" && data.Status == "Cancelled") return;
                static string Topic(string? n) => System.Text.RegularExpressions.Regex.Replace(n ?? "", @"^\[[^\]]+\]\s*", "").Trim();
                if (data.Status == "Cancelled")
                {
                    await _emailService.NotifySessionChangedAsync(existing.SessionID, existing.MentorID, true, existing.SessionDate, existing.SlotName, Array.Empty<string>());
                    return;
                }
                var changes = new List<string>();
                if (data.SessionDate != existing.SessionDate)
                    changes.Add($"New date and time: {data.SessionDate:MMMM d, yyyy} at {data.SessionDate:h:mm tt} (was {existing.SessionDate:MMMM d, yyyy} at {existing.SessionDate:h:mm tt})");
                if (data.SlotName != existing.SlotName && !string.IsNullOrWhiteSpace(data.SlotName))
                    changes.Add($"Session slot: {data.SlotName}");
                if (Topic(data.Notes) != Topic(existing.Notes))
                    changes.Add(string.IsNullOrWhiteSpace(Topic(data.Notes)) ? "Notes removed." : $"Notes from your mentor: {Topic(data.Notes)}");
                if (changes.Count > 0)
                    await _emailService.NotifySessionChangedAsync(existing.SessionID, existing.MentorID, false, data.SessionDate, data.SlotName, changes);
            }
            catch (Exception ex)
            {
                HttpContext.RequestServices.GetRequiredService<ILogger<SessionsController>>()
                    .LogWarning(ex, "Session {SessionId}: change notice failed.", existing.SessionID);
            }
        }

        [HttpPatch("{id}/log-status")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> PatchLogStatus(int id, [FromBody] LogStatusUpdateDto data)
        {
            var existing = await _service.GetById(id);
            if (existing == null) return NotFound(new { message = "Session not found." });
            if (existing.MentorID != CallerId) return Forbid();

            if (data.LogStatus != "Draft" && data.LogStatus != "Submitted")
                return BadRequest(new { message = "LogStatus must be 'Draft' or 'Submitted'." });
            var scopeCode=data.SectionCode??existing.CourseCode;
            using var scopeConn=new SqlConnection(_config.GetConnectionString("DefaultConnection"));
            var hasCourseScope=await scopeConn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes WHERE SessionID=@id",new {id})>0;
            if(hasCourseScope && string.IsNullOrWhiteSpace(scopeCode))return BadRequest(new {message="Choose the course represented by this logsheet."});
            var result = !string.IsNullOrWhiteSpace(existing.SlotName) && !string.IsNullOrWhiteSpace(scopeCode)
                ? await _service.UpdateCheckpointLogAsync(existing, scopeCode, data.LogStatus,data.CourseSchool??existing.CourseSchool)
                : await _service.UpdateLogStatusAsync(id, data.LogStatus);
            if (result && data.LogStatus == "Submitted")
                await _emailService.NotifySessionLoggedAsync(id);
            return result
                ? Ok(new { message = "Log status updated.", logStatus = data.LogStatus })
                : BadRequest(new { message = "Check the logsheet section and finish all attended sessions with Save End before submitting." });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Delete(int id)
        {
            var existing = await _service.GetById(id);
            if (existing == null) return NotFound();
            if (existing.MentorID != CallerId) return Forbid();
            if (existing.Status == "Completed")
                return BadRequest(new { message = "Completed sessions can't be deleted." });
            if (await _service.HasScannedAttendanceAsync(id))
                return BadRequest(new { message = "This session already has scanned attendance and can't be deleted." });

            var result = await _service.DeleteCascadeAsync(id);
            return result ? Ok(new { message = "Session deleted" }) : NotFound();
        }
    }

    public record LogStatusUpdateDto(string LogStatus, string? SectionCode = null,string? CourseSchool=null);
}
